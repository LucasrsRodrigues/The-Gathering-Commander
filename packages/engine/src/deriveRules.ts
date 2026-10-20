// Derives the engine's structured CardRules from catalog facts (épico 09, T9.1).
//
// This runs OUTSIDE the rules core: the app and the server call it when preparing decks, and reduce/turn never
// import it (fitness function). It recognizes whole sentences of Oracle text by their structure, never by card
// name; anything it does not recognize degrades to "manual" (declared mana, manual cost), never to wrong rules.

import { PATTERNS, recognize, type LinePattern } from './oracle/patterns'
import {
  KEYWORDS, type CardRules, type CardType, type Filter, type Keyword, type ManaAbility, type ManaAmount, type ManaColor,
  type ManaCost, type ManaProduction, type ManaType, type Supertype,
} from './types'

// What the catalog knows about one face of a card (Scryfall field formats).
export interface OracleFacts {
  name: string
  typeLine: string
  manaCost: string // '{2}{G}{G}', '' when there is none
  oracleText: string
  power?: string
  toughness?: string
  loyalty?: string
  keywords: string[] // Scryfall's keyword names: only hints, they also list keywords the card grants to others
  colorIdentity: string[]
  otherFaces?: string[] // "Name: text" of the other faces (back, adventure): played by hand, so listed as manual
}

const COLORS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G']
const MANA_TYPES: readonly ManaType[] = [...COLORS, 'C']
const CARD_TYPES: readonly CardType[] = ['land', 'creature', 'artifact', 'enchantment', 'planeswalker', 'instant', 'sorcery', 'battle']
const SUPERTYPES: readonly Supertype[] = ['legendary', 'basic', 'snow']
// CR 305.6: basic land types carry an intrinsic "{T}: Add {X}."
const BASIC_LAND_TYPES: Record<string, ManaColor> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' }
const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 }
const SELF = 'this card'

const KEYWORD_TEXT: Record<string, Keyword> = Object.fromEntries(
  KEYWORDS.map((k) => [k.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`), k]),
) // 'firstStrike' → 'first strike'

export function deriveCardRules(facts: OracleFacts): CardRules {
  return deriveCardRulesWith(facts, PATTERNS)
}

// The reader with a given pattern list (tests use small lists of their own).
export function deriveCardRulesWith(facts: OracleFacts, patterns: readonly LinePattern[]): CardRules {
  const { types, supertypes, subtypes } = parseTypeLine(facts.typeLine)
  const power = parsePT(facts.power)
  const toughness = parsePT(facts.toughness)
  const lines = oracleLines(facts)
  const mana = parseManaLines(lines)

  for (const sub of subtypes) {
    const color = types.includes('land') ? BASIC_LAND_TYPES[sub.toLowerCase()] : undefined
    if (color) mana.abilities.push({ produces: { kind: 'fixed', mana: { [color]: 1 } } })
  }
  if (mana.tapDamage) for (const a of mana.abilities) a.selfDamage = (a.selfDamage ?? 0) + mana.tapDamage

  const rules: CardRules = {
    types, supertypes, subtypes,
    cost: parseManaCost(facts.manaCost),
    power: power.value,
    toughness: toughness.value,
    loyalty: parsePT(facts.loyalty).value,
    keywords: parseKeywords(lines, facts.keywords),
    manaAbilities: dedupe(mana.abilities),
    colorIdentity: COLORS.filter((c) => facts.colorIdentity.includes(c)),
  }
  if (power.variable || toughness.variable) rules.variablePT = true
  if (mana.unrecognized) rules.hasUnrecognizedMana = true
  if (mana.entersTapped) rules.entersTapped = true
  const spellMana = (types.includes('instant') || types.includes('sorcery')) && lines.length === 1 ? fixedAdd(lines[0]!) : null
  if (spellMana) rules.spellMana = spellMana

  // Épico 11: coverage, line by line. A line counts as understood only when the engine does everything it says.
  const shown = displayLines(facts)
  const manual: string[] = []
  let understood = 0
  lines.forEach((line, i) => {
    const hit = spellMana ? null : recognize(line, { types }, patterns)
    // Two lines of the same spell join into one ability; two that both ask for targets stay manual (wave 1).
    if (hit?.spell && rules.spell?.targets?.length && hit.spell.targets?.length) {
      manual.push(shown[i] ?? line)
      return
    }
    if (hit) {
      if (hit.spell) {
        rules.spell = rules.spell
          ? { text: `${rules.spell.text} ${hit.spell.text}`, effects: [...rules.spell.effects, ...hit.spell.effects], ...((rules.spell.targets ?? hit.spell.targets) ? { targets: rules.spell.targets ?? hit.spell.targets! } : {}) }
          : hit.spell
      }
      if (hit.etb) rules.etb = [...(rules.etb ?? []), hit.etb]
      if (hit.activated) rules.activated = [...(rules.activated ?? []), hit.activated]
      if (hit.mana) rules.manaAbilities = dedupe([...rules.manaAbilities, hit.mana])
      understood++
    } else if (spellMana || knownLine(line)) understood++
    else manual.push(shown[i] ?? line)
  })
  // Order matters in a spell: a manual line before an automated one ("Look at the top three cards…" then "Draw a
  // card.") would happen after it. Unless that line is about casting (costs), the whole spell stays manual.
  if (rules.spell && manual.length) {
    const firstAuto = lines.findIndex((l) => rules.spell!.text.includes(l))
    const before = shown.slice(0, Math.max(0, firstAuto)).filter((l) => manual.includes(l) && !CAST_TIME.test(l))
    if (before.length) {
      delete rules.spell
      return { ...rules, coverage: 'manual', manualText: shown }
    }
  }
  // T11.13: the rules come from the front face; the other faces (an MDFC's land, an adventure) are the players'.
  for (const face of facts.otherFaces ?? []) {
    const text = face.replace(/\s*\([^)]*\)/g, '').trim()
    if (text && !text.endsWith(':')) manual.push(text)
  }
  rules.coverage = manual.length === 0 ? 'automated' : understood === 0 ? 'manual' : 'partial'
  if (manual.length) rules.manualText = manual
  return rules
}

// Lines about casting the spell (costs, rules for the cast), not about what it does on resolution.
const CAST_TIME = /^(As an additional cost to cast this spell|This spell costs|This spell can't be countered|Kicker|Flashback|Buyback|Convoke|Delve|Affinity for)/i

// Lines the engine already handled before épico 11: its own keywords, recognized mana abilities, "enters tapped",
// pain lands' "deals 1 damage to you".
function knownLine(line: string): boolean {
  const items = line.split(/,\s*/).map((i) => i.toLowerCase().trim())
  if (items.length && items.every((i) => KEYWORD_TEXT[i])) return true
  if (ENTERS_TAPPED.test(line) || TAP_DAMAGE.test(line)) return true
  if (GRANTS_OTHERS.test(line)) return false
  if (/\{T\}/.test(line) && /\badd\b/i.test(line)) {
    const ability = parseManaAbility(line)
    return !!ability && !ability.partial
  }
  return false
}

// The same lines as oracleLines, as the players read them (the card's name, no reminder text): the "Manual:" list.
function displayLines(facts: OracleFacts): string[] {
  return facts.oracleText.replace(/[’]/g, "'").split('\n').map((l) => l.replace(/\s*\([^)]*\)/g, '').trim()).filter(Boolean)
}

// ---- Type line ----------------------------------------------------------------

function parseTypeLine(typeLine: string) {
  const [left = '', right = ''] = typeLine.split(' // ')[0]!.split(/\s+[—-]\s+/)
  const words = left.toLowerCase().split(/\s+/)
  return {
    types: CARD_TYPES.filter((t) => words.includes(t)),
    supertypes: SUPERTYPES.filter((t) => words.includes(t)),
    subtypes: right.split(/\s+/).filter(Boolean),
  }
}

// ---- Mana cost (CR 107.4) ------------------------------------------------------

export function parseManaCost(text: string): ManaCost | null {
  if (!text.trim()) return null
  const cost: ManaCost = { generic: 0, colored: {}, hybrid: [], twoBrid: [], phyrexian: [], x: 0 }
  const symbols = [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!)
  if (symbols.map((s) => `{${s}}`).join('') !== text.replace(/\s+/g, '')) cost.unknown = true
  for (const sym of symbols) {
    let m: RegExpExecArray | null
    if (/^\d+$/.test(sym)) cost.generic += Number(sym)
    else if (isManaType(sym)) cost.colored[sym] = (cost.colored[sym] ?? 0) + 1
    else if (sym === 'X') cost.x++
    else if ((m = /^([WUBRG])\/([WUBRG])$/.exec(sym))) cost.hybrid.push([m[1] as ManaColor, m[2] as ManaColor])
    else if ((m = /^2\/([WUBRG])$/.exec(sym))) cost.twoBrid.push(m[1] as ManaColor)
    else if ((m = /^([WUBRG])\/P$/.exec(sym))) cost.phyrexian.push(m[1] as ManaColor)
    else cost.unknown = true
  }
  return cost
}

function isManaType(s: string): s is ManaType {
  return (MANA_TYPES as readonly string[]).includes(s)
}

function parsePT(v: string | undefined): { value: number | null; variable: boolean } {
  if (v === undefined) return { value: null, variable: false }
  return /^-?\d+$/.test(v) ? { value: Number(v), variable: false } : { value: null, variable: true }
}

// ---- Oracle text ------------------------------------------------------------

// One entry per ability line, with reminder text removed and the card's own name replaced by a marker.
function oracleLines(facts: OracleFacts): string[] {
  // Legendary cards are named by their short name in their own text ("Marwyn" for "Marwyn, the Nurturer").
  const front = facts.name.split(' // ')[0]!
  const short = front.includes(',') ? front.split(',')[0]!.trim() : ''
  const names = [...new Set([facts.name, front, ...(short.length > 2 ? [short] : [])])].sort((a, b) => b.length - a.length)
  return facts.oracleText
    .replace(/[’]/g, "'")
    .split('\n')
    .map((line) => {
      let out = line
      for (const n of names) out = out.split(n).join(SELF)
      return out.replace(/\s*\([^)]*\)/g, '').trim()
    })
    .filter(Boolean)
}

// Keyword lines are lists like "Flying, first strike, lifelink, protection from red". A line counts only when every
// item is a keyword (ours, or one Scryfall lists for the card), so granted keywords in other sentences are ignored.
function parseKeywords(lines: string[], hints: string[]): Keyword[] {
  const known = hints.map((h) => h.toLowerCase())
  const found = new Set<Keyword>()
  for (const line of lines) {
    const items = line.split(/,\s*/).map((i) => i.toLowerCase().trim())
    const ours = items.map((i) => KEYWORD_TEXT[i])
    if (items.every((item, n) => ours[n] || known.some((k) => item.startsWith(k)))) for (const k of ours) if (k) found.add(k)
  }
  return KEYWORDS.filter((k) => found.has(k))
}

interface ManaLines {
  abilities: ManaAbility[]
  unrecognized: boolean
  entersTapped: boolean
  tapDamage: number
}

const OBJECT = `(?:${SELF}|this (?:land|artifact|creature|permanent))`
const ENTERS_TAPPED = new RegExp(`^${OBJECT} enters(?: the battlefield)? tapped\\.$`, 'i')
const TAP_DAMAGE = new RegExp(`^whenever ${OBJECT} becomes tapped, it deals (\\d+) damage to you\\.$`, 'i')
const SELF_DAMAGE = new RegExp(`^${OBJECT} deals (\\d+) damage to you\\.$`, 'i')
const GRANTS_OTHERS = /\bhave "/i
const ACTIVATED = /^((?:\{[^}]+\}|pay \d+ life)(?:, (?:\{[^}]+\}|pay \d+ life))*): (.+)$/i

function parseManaLines(lines: string[]): ManaLines {
  const out: ManaLines = { abilities: [], unrecognized: false, entersTapped: false, tapDamage: 0 }
  for (const line of lines) {
    let m: RegExpExecArray | null
    if (ENTERS_TAPPED.test(line)) out.entersTapped = true
    else if ((m = TAP_DAMAGE.exec(line))) out.tapDamage += Number(m[1])
    else if (GRANTS_OTHERS.test(line)) continue // 'Lands you control have "{T}: Add …"' is not this card's ability
    else if (/\{T\}/.test(line) && /\badd\b/i.test(line)) {
      const ability = parseManaAbility(line)
      if (ability) out.abilities.push(ability)
      else out.unrecognized = true
    }
  }
  return out
}

function parseManaAbility(line: string): ManaAbility | null {
  const m = ACTIVATED.exec(line)
  if (!m) return null
  const ability: Partial<ManaAbility> = {}
  let taps = false
  const extra: string[] = []
  for (const part of m[1]!.split(', ')) {
    const life = /^pay (\d+) life$/i.exec(part)
    if (part === '{T}') taps = true
    else if (life) ability.lifeCost = Number(life[1])
    else extra.push(part)
  }
  if (!taps) return null
  if (extra.length) {
    const cost = parseManaCost(extra.join(''))
    // Only generic extra costs ({1}, {T}: Signets) are paid automatically; anything else stays declared mana.
    const onlyGeneric = cost && !cost.unknown && !cost.x && !cost.hybrid.length && !cost.twoBrid.length && !cost.phyrexian.length && !Object.keys(cost.colored).length
    if (!onlyGeneric) return null
    ability.extraCost = cost
  }
  const [first = '', ...rest] = m[2]!.split(/(?<=\.)\s+/)
  const produces = parseProduction(first)
  if (!produces) return null
  ability.produces = produces
  for (const sentence of rest) {
    const dmg = SELF_DAMAGE.exec(sentence)
    if (dmg) ability.selfDamage = (ability.selfDamage ?? 0) + Number(dmg[1])
    else ability.partial = true
  }
  return ability as ManaAbility
}

function parseProduction(sentence: string): ManaProduction | null {
  const fixed = fixedAdd(sentence)
  if (fixed) return { kind: 'fixed', mana: fixed }
  let m: RegExpExecArray | null
  if ((m = /^Add ((?:\{[WUBRGC]\}, )*\{[WUBRGC]\},? or \{[WUBRGC]\})\.$/.exec(sentence))) {
    return { kind: 'oneOf', colors: [...m[1]!.matchAll(/\{([WUBRGC])\}/g)].map((s) => s[1] as ManaType) }
  }
  if (/^Add one mana of any color in your commander's color identity\.$/i.test(sentence)) return { kind: 'commanderIdentity' }
  if (/^Add one mana of any color\.$/i.test(sentence)) return { kind: 'anyColor', amount: 1 }
  if ((m = /^Add (one|two|three|four|five) mana of any one color\.$/i.exec(sentence))) return { kind: 'anyColor', amount: NUMBERS[m[1]!.toLowerCase()]! }
  // Épico 11: amounts that depend on the table.
  if ((m = new RegExp(`^Add an amount of \\{([WUBRGC])\\} equal to ${OBJECT}'s power\\.$`, 'i').exec(sentence))) {
    return { kind: 'dynamic', color: m[1] as ManaType, amount: { kind: 'power', of: 'self' } }
  }
  if ((m = /^Add \{([WUBRGC])\} for each (\w+) (on the battlefield|you control)\.$/.exec(sentence))) {
    const what = nounFilter(m[2]!)
    if (!what) return null
    return {
      kind: 'dynamic', color: m[1] as ManaType,
      amount: { kind: 'count', what: m[3] === 'you control' ? { ...what, controller: 'you' } : what, zone: 'battlefield' },
    }
  }
  return null
}

// "creature", "artifact", "land" → a card type; a capitalized word ("Elf", "Swamp") → a subtype. Anything else: null.
function nounFilter(word: string): Filter | null {
  const type = CARD_TYPES.find((t) => t === word.toLowerCase())
  if (type) return { types: [type] }
  return /^[A-Z][a-z]+$/.test(word) ? { subtypes: [word] } : null
}

function fixedAdd(sentence: string): ManaAmount | null {
  const m = /^Add ((?:\{[WUBRGC]\})+)\.$/.exec(sentence)
  if (!m) return null
  const mana: ManaAmount = {}
  for (const s of m[1]!.matchAll(/\{([WUBRGC])\}/g)) mana[s[1] as ManaType] = (mana[s[1] as ManaType] ?? 0) + 1
  return mana
}

function dedupe(abilities: ManaAbility[]): ManaAbility[] {
  const seen = new Set<string>()
  return abilities.filter((a) => {
    const key = JSON.stringify(a)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
