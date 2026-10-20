// Sentence parsers of the Oracle reader (épico 11, wave 1): one exact shape each, written from the Oracle text's own
// templates. The card's name was already replaced by "this card" (deriveRules.ts). A sentence that fits no parser is
// manual — never guessed.

import {
  KEYWORDS, type Ability, type CardType, type Effect, type Filter, type Keyword, type ManaColor, type TargetSpec, type TokenDef, type Value,
} from '../types'

export interface Piece {
  effects: Effect[]
  targets?: TargetSpec[]
}

const SELF = '(?:this card|this spell)'
const NUM = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d{1,2}|X)'
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const COLOR_WORDS: Record<string, ManaColor> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }
const TYPES: readonly CardType[] = ['creature', 'artifact', 'enchantment', 'planeswalker', 'land', 'battle']

export function value(word: string): Value {
  if (word === 'X') return { kind: 'x' }
  return { kind: 'fixed', n: WORDS[word.toLowerCase()] ?? Number(word) }
}

const signed = (s: string): Value => (s.endsWith('X') ? { kind: 'x' } : { kind: 'fixed', n: Number(s) })
const neg = (v: Value): Value => (v.kind === 'fixed' ? { kind: 'fixed', n: -v.n } : v)
const IRREGULAR: Record<string, string> = { Elves: 'Elf', Dwarves: 'Dwarf', Wolves: 'Wolf', Werewolves: 'Werewolf', Faeries: 'Faerie', Zombies: 'Zombie' }
const singular = (w: string) => IRREGULAR[w] ?? (w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('s') ? w.slice(0, -1) : w)

// "creature", "nonland permanent", "artifact or enchantment", "creature you don't control", "tapped creature",
// plural forms for "all" ("creatures your opponents control"). Null for anything else.
export function nounFilter(phrase: string, plural = false): Filter | null {
  const m = /^(tapped |untapped )?(?:non(\w+) )?(\w+(?: or \w+)*)( you don't control| an opponent controls| your opponents control| you control)?$/.exec(phrase)
  if (!m) return null
  const filter: Filter = {}
  if (m[1]) filter.tapped = m[1] === 'tapped '
  if (m[2]) {
    const not = TYPES.find((t) => t === m[2])
    if (!not) return null
    filter.notTypes = [not]
  }
  const words = m[3]!.split(' or ').map((w) => (plural ? singular(w) : w))
  const types: CardType[] = []
  const subtypes: string[] = []
  for (const w of words) {
    if (w === 'permanent') continue
    const t = TYPES.find((x) => x === w)
    if (t) types.push(t)
    else if (/^[A-Z][a-z]+$/.test(w)) subtypes.push(w) // "Goblin", "Elf": a creature or other subtype (épico 11, onda 2)
    else return null
  }
  if (types.length && subtypes.length) return null // "Elf or creature": no such template
  if (types.length) filter.types = types
  if (subtypes.length) filter.subtypes = subtypes
  if (m[4] === " you don't control" || m[4] === ' an opponent controls' || m[4] === ' your opponents control') filter.controller = 'opponent'
  if (m[4] === ' you control') filter.controller = 'you'
  return filter
}

const objectTarget = (filter: Filter, count = 1): TargetSpec => ({ kind: 'object', filter, count })

function tokenFromWords(pt: [string, string], colors: string, rest: string, keyword?: string): TokenDef | null {
  const colorList = colors === 'colorless' ? [] : colors.split(' and ').map((c) => COLOR_WORDS[c])
  if (colorList.some((c) => !c)) return null
  const words = rest.split(' ')
  const kind = words.at(-1)
  if (kind !== 'creature') return null
  const artifact = words.at(-2) === 'artifact'
  const subtypes = words.slice(0, artifact ? -2 : -1)
  if (!subtypes.length || subtypes.some((w) => !/^[A-Z][a-z]+$/.test(w))) return null
  const keywords: Keyword[] = []
  if (keyword) {
    const k = KEYWORDS.find((x) => x.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`) === keyword)
    if (!k) return null
    keywords.push(k)
  }
  return {
    name: subtypes.join(' '), types: artifact ? ['artifact', 'creature'] : ['creature'], subtypes, colors: colorList as ManaColor[],
    power: Number(pt[0]), toughness: Number(pt[1]), keywords, manaAbilities: [],
  }
}

// Predefined tokens (CR 111.10). Food and Clue keep their sacrifice abilities manual until wave 2.
export const TREASURE: TokenDef = {
  name: 'Treasure', types: ['artifact'], subtypes: ['Treasure'], colors: [], power: null, toughness: null, keywords: [],
  manaAbilities: [{ produces: { kind: 'anyColor', amount: 1 }, sacrificeSelf: true }],
}
const FOOD: TokenDef = { name: 'Food', types: ['artifact'], subtypes: ['Food'], colors: [], power: null, toughness: null, keywords: [], manaAbilities: [] }
const CLUE: TokenDef = { name: 'Clue', types: ['artifact'], subtypes: ['Clue'], colors: [], power: null, toughness: null, keywords: [], manaAbilities: [] }
const PREDEFINED: Record<string, TokenDef> = { Treasure: TREASURE, Food: FOOD, Clue: CLUE }

type Parser = (sentence: string) => Piece | null

const re = (src: string) => new RegExp(`^${src}$`)
const PARSERS: Parser[] = [
  // Cards and life
  (s) => { const m = re(`Draw ${NUM} cards?\\.`).exec(s); return m ? { effects: [{ kind: 'draw', who: 'you', amount: value(m[1]!) }] } : null },
  (s) => { const m = re(`You draw ${NUM} cards? and lose ${NUM} life\\.`).exec(s); return m ? { effects: [{ kind: 'draw', who: 'you', amount: value(m[1]!) }, { kind: 'loseLife', who: 'you', amount: value(m[2]!) }] } : null },
  (s) => { const m = re(`Target player draws ${NUM} cards?\\.`).exec(s); return m ? { targets: [{ kind: 'player', who: 'any' }], effects: [{ kind: 'draw', who: 'target', amount: value(m[1]!) }] } : null },
  (s) => {
    const m = re(`Target player draws ${NUM} cards? and loses ${NUM} life\\.`).exec(s)
    return m ? { targets: [{ kind: 'player', who: 'any' }], effects: [{ kind: 'draw', who: 'target', amount: value(m[1]!) }, { kind: 'loseLife', who: 'target', amount: value(m[2]!) }] } : null
  },
  (s) => { const m = re(`Each player draws ${NUM} cards?\\.`).exec(s); return m ? { effects: [{ kind: 'draw', who: 'each player', amount: value(m[1]!) }] } : null },
  (s) => { const m = re(`You (gain|lose) ${NUM} life\\.`).exec(s); return m ? { effects: [{ kind: m[1] === 'gain' ? 'gainLife' : 'loseLife', who: 'you', amount: value(m[2]!) }] } : null },
  (s) => { const m = re(`Each opponent loses ${NUM} life\\.`).exec(s); return m ? { effects: [{ kind: 'loseLife', who: 'each opponent', amount: value(m[1]!) }] } : null },
  (s) => {
    const m = re(`Each opponent loses ${NUM} life and you gain ${NUM} life\\.`).exec(s)
    return m ? { effects: [{ kind: 'loseLife', who: 'each opponent', amount: value(m[1]!) }, { kind: 'gainLife', who: 'you', amount: value(m[2]!) }] } : null
  },
  (s) => {
    const m = re(`Target player (gains|loses) ${NUM} life\\.`).exec(s)
    return m ? { targets: [{ kind: 'player', who: 'any' }], effects: [{ kind: m[1] === 'gains' ? 'gainLife' : 'loseLife', who: 'target', amount: value(m[2]!) }] } : null
  },
  (s) => { const m = re(`(?:Target player|Each opponent) mills ${NUM} cards?\\.`).exec(s); return m ? (s.startsWith('Target') ? { targets: [{ kind: 'player', who: 'any' }], effects: [{ kind: 'mill', who: 'target', amount: value(m[1]!) }] } : { effects: [{ kind: 'mill', who: 'each opponent', amount: value(m[1]!) }] }) : null },
  (s) => { const m = re(`Mill ${NUM} cards?\\.`).exec(s); return m ? { effects: [{ kind: 'mill', who: 'you', amount: value(m[1]!) }] } : null },

  // Damage
  (s) => { const m = re(`${SELF} deals ${NUM} damage to any target\\.`).exec(s); return m ? { targets: [{ kind: 'any' }], effects: [{ kind: 'damage', to: 'target', amount: value(m[1]!) }] } : null },
  (s) => {
    const m = re(`${SELF} deals ${NUM} damage to target (creature|planeswalker|creature or planeswalker|creature you don't control|creature an opponent controls)\\.`).exec(s)
    const f = m && nounFilter(m[2]!)
    return m && f ? { targets: [objectTarget(f)], effects: [{ kind: 'damage', to: 'target', amount: value(m[1]!) }] } : null
  },
  (s) => { const m = re(`${SELF} deals ${NUM} damage to each creature\\.`).exec(s); return m ? { effects: [{ kind: 'damage', to: 'each creature', amount: value(m[1]!) }] } : null },
  (s) => { const m = re(`${SELF} deals ${NUM} damage to each opponent\\.`).exec(s); return m ? { effects: [{ kind: 'damage', to: 'each opponent', amount: value(m[1]!) }] } : null },

  // Removal
  (s) => {
    const m = /^(Destroy|Exile) target (.+)\.$/.exec(s)
    const f = m && nounFilter(m[2]!)
    return m && f ? { targets: [objectTarget(f)], effects: [{ kind: m[1] === 'Destroy' ? 'destroy' : 'exile', what: 'target' }] } : null
  },
  (s) => {
    const m = /^(Destroy|Exile) all (.+)\.$/.exec(s)
    const f = m && nounFilter(m[2]!, true)
    return m && f ? { effects: [{ kind: m[1] === 'Destroy' ? 'destroy' : 'exile', what: { all: f } }] } : null
  },
  (s) => {
    const m = /^Return target (.+) to its owner's hand\.$/.exec(s)
    const f = m && nounFilter(m[1]!)
    return m && f ? { targets: [objectTarget(f)], effects: [{ kind: 'bounce', what: 'target' }] } : null
  },
  // Regeneration does not exist in this engine, so "can't be regenerated" changes nothing.
  (s) => (/^(?:They|It) can't be regenerated\.$/.test(s) ? { effects: [] } : null),

  // Pump and counters
  (s) => {
    const m = /^Target creature gets ([+-](?:\d{1,2}|X))\/([+-](?:\d{1,2}|X)) until end of turn\.$/.exec(s)
    if (!m) return null
    const p = m[1]!.startsWith('-') ? neg(signed(m[1]!.slice(1))) : signed(m[1]!.slice(1))
    const t = m[2]!.startsWith('-') ? neg(signed(m[2]!.slice(1))) : signed(m[2]!.slice(1))
    return { targets: [objectTarget({ types: ['creature'] })], effects: [{ kind: 'pump', what: 'target', power: p, toughness: t }] }
  },
  (s) => {
    const m = /^Creatures you control get \+(\d{1,2})\/\+(\d{1,2}) until end of turn\.$/.exec(s)
    return m ? { effects: [{ kind: 'pump', what: { each: { types: ['creature'], controller: 'you' } }, power: value(m[1]!), toughness: value(m[2]!) }] } : null
  },
  // The permanent itself (activated and "enters" abilities): "This creature gets +2/+2 until end of turn."
  (s) => {
    const m = /^(?:T|t)his (?:card|creature) gets ([+-](?:\d{1,2}|X))\/([+-](?:\d{1,2}|X)) until end of turn\.$/.exec(s)
    if (!m) return null
    const p = m[1]!.startsWith('-') ? neg(signed(m[1]!.slice(1))) : signed(m[1]!.slice(1))
    const t = m[2]!.startsWith('-') ? neg(signed(m[2]!.slice(1))) : signed(m[2]!.slice(1))
    return { effects: [{ kind: 'pump', what: 'self', power: p, toughness: t }] }
  },
  (s) => {
    const m = re(`Put ${NUM} \\+1/\\+1 counters? on this (?:card|creature)\\.`).exec(s)
    return m ? { effects: [{ kind: 'counters', what: 'self', counter: '+1/+1', amount: value(m[1]!) }] } : null
  },
  (s) => {
    const m = re(`Put ${NUM} \\+1/\\+1 counters? on target creature\\.`).exec(s)
    return m ? { targets: [objectTarget({ types: ['creature'] })], effects: [{ kind: 'counters', what: 'target', counter: '+1/+1', amount: value(m[1]!) }] } : null
  },

  // Tokens
  (s) => {
    const m = re(`Create ${NUM} (\\d{1,2})/(\\d{1,2}) ((?:white|blue|black|red|green|colorless)(?: and (?:white|blue|black|red|green))?) ([A-Za-z ]+?) tokens?(?: with (\\w+(?: \\w+)?))?\\.`).exec(s)
    const token = m && tokenFromWords([m[2]!, m[3]!], m[4]!, m[5]!, m[6])
    return m && token ? { effects: [{ kind: 'token', token, amount: value(m[1]!) }] } : null
  },
  (s) => {
    const m = re(`Create ${NUM} (Treasure|Food|Clue) tokens?\\.`).exec(s)
    return m ? { effects: [{ kind: 'token', token: PREDEFINED[m[2]!]!, amount: value(m[1]!) }] } : null
  },
]

// "Draw two cards and create two Treasure tokens." → two sentences sharing the subject.
function split(line: string): string[] {
  const out: string[] = []
  for (const part of line.split(/(?<=\.)\s+(?=[A-Z•])/)) {
    const and = /^Draw (\S+) cards? and create (.+)$/.exec(part)
    if (and) out.push(`Draw ${and[1]} card${and[1] === 'a' || and[1] === 'one' ? '' : 's'}.`, `Create ${and[2]}`)
    else out.push(part)
  }
  return out
}

// Counts (épico 11, onda 2, T11.11): "for each Elf on the battlefield", "the number of cards in your hand",
// "Goblins you control". The phrase after "for each" / "the number of". Null for anything else.
export function countValue(phrase: string): Value | null {
  let m: RegExpExecArray | null
  if (phrase === 'card in your hand' || phrase === 'cards in your hand') return { kind: 'count', what: {}, zone: 'hand' }
  if ((m = /^(?:(\w+) )?cards? in your graveyard$/.exec(phrase))) {
    const what = m[1] ? nounFilter(m[1]) : {}
    return what ? { kind: 'count', what, zone: 'graveyard' } : null
  }
  if ((m = /^(other )?(.+?) (you control|on the battlefield)$/.exec(phrase))) {
    const what = nounFilter(m[2]!, true) ?? nounFilter(m[2]!)
    if (!what || what.controller) return null
    return { kind: 'count', what: { ...what, ...(m[3] === 'you control' ? { controller: 'you' } : {}), ...(m[1] ? { other: true } : {}) }, zone: 'battlefield' }
  }
  return null
}

// Every amount of the effects, rewritten (the count put where the sentence said "a", "1" or "X").
function mapAmounts(effects: Effect[], f: (v: Value) => Value | null): Effect[] | null {
  let ok = false
  const swap = (v: Value) => {
    const out = f(v)
    if (out) ok = true
    return out ?? v
  }
  const mapped = effects.map((e): Effect => {
    if (e.kind === 'pump') return { ...e, power: swap(e.power), toughness: swap(e.toughness) }
    if ('amount' in e) return { ...e, amount: swap(e.amount) } as Effect
    return e
  })
  return ok ? mapped : null
}

const parseOne = (sentence: string): Piece | null => PARSERS.reduce<Piece | null>((hit, p) => hit ?? p(sentence), null)

// A sentence with a count: "…, where X is the number of Ys", "… for each Y", "life/cards/damage equal to the
// number of Ys". It is read without the count, then the count takes the place of X (or of the single "a"/"1").
function countSentence(sentence: string): Piece | null {
  let m: RegExpExecArray | null
  if ((m = /^(.+), where X is the number of (.+)\.$/.exec(sentence))) {
    const count = countValue(m[2]!)
    const base = count && parseOne(`${m[1]}.`)
    const effects = base && mapAmounts(base.effects, (v) => (v.kind === 'x' ? count : null))
    return base && effects ? { ...base, effects } : null
  }
  if ((m = /^(.+) for each (.+)\.$/.exec(sentence))) {
    const count = countValue(m[2]!)
    const base = count && parseOne(`${m[1]}.`)
    const effects = base && mapAmounts(base.effects, (v) => (v.kind === 'fixed' && v.n === 1 ? count : null))
    return base && effects ? { ...base, effects } : null
  }
  if ((m = /^(.*?)\b(life|cards|damage) equal to the number of (.+?)( to .+)?\.$/.exec(sentence))) {
    const count = countValue(m[3]!)
    const base = count && parseOne(`${m[1]}X ${m[2]}${m[4] ?? ''}.`)
    const effects = base && mapAmounts(base.effects, (v) => (v.kind === 'x' ? count : null))
    return base && effects ? { ...base, effects } : null
  }
  return null
}

// A whole line of a spell: every sentence must parse, and at most one of them may ask for targets (wave 1).
export function parseSpellLine(line: string): Ability | null {
  const pieces: Piece[] = []
  for (const sentence of split(line)) {
    const piece = parseOne(sentence) ?? countSentence(sentence)
    if (!piece) return null
    pieces.push(piece)
  }
  const targets = pieces.flatMap((p) => p.targets ?? [])
  if (pieces.filter((p) => p.targets?.length).length > 1) return null
  return { text: line, effects: pieces.flatMap((p) => p.effects), ...(targets.length ? { targets } : {}) }
}
