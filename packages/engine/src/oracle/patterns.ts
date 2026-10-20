// Sentence patterns of the Oracle reader (épico 11). Each pattern recognizes one exact shape of an ability line and
// returns its piece of the effect model. Lines no pattern recognizes stay manual: on doubt, never guess.
//
// The list starts empty (T11.2); each wave adds patterns measured by the coverage command (T11.3). Only the reader
// (deriveRules.ts) uses this file: the rules core never sees Oracle text.

import { parseManaCost } from '../deriveRules'
import type { Ability, AbilityCost, ActivatedAbility, CardType, ManaAbility } from '../types'
import { nounFilter, parseSpellLine } from './sentences'

export interface LineContext {
  types: CardType[] // of the card being read
}

// What a recognized line adds to the card's rules.
export interface Recognized {
  spell?: Ability
  etb?: Ability
  activated?: ActivatedAbility
  mana?: ManaAbility
}

export interface LinePattern {
  id: string
  match(line: string, ctx: LineContext): Recognized | null
}

// Wave 1: whole lines of instants and sorceries made of known sentences (oracle/sentences.ts).
const SPELL_LINE: LinePattern = {
  id: 'spell-line',
  match(line, ctx) {
    if (!ctx.types.includes('instant') && !ctx.types.includes('sorcery')) return null
    const spell = parseSpellLine(line)
    return spell ? { spell } : null
  },
}

// Wave 1: "When this creature enters, <known sentences>." on permanents (CR 603.6a). "you may", "if" (intervening if)
// and "or another…" are other shapes and stay manual.
const ENTERS = /^When this (?:card|creature|land|artifact|enchantment|permanent|Vehicle) enters, (?!you may |if )(.+)$/
const SELF_DEALS = /^(?:it|this (?:creature|land|artifact|enchantment|permanent)) deals /i
// The effect part of a permanent's ability: "it deals" / "this creature deals" are the permanent's own damage.
function permanentEffect(text: string): Ability | null {
  const rest = text.replace(SELF_DEALS, 'this card deals ')
  return parseSpellLine(rest.startsWith('this card ') ? rest : rest[0]!.toUpperCase() + rest.slice(1))
}

const ETB_LINE: LinePattern = {
  id: 'etb-line',
  match(line, ctx) {
    if (ctx.types.includes('instant') || ctx.types.includes('sorcery')) return null
    const m = ENTERS.exec(line)
    const parsed = m && permanentEffect(m[1]!)
    return parsed ? { etb: { ...parsed, text: line } } : null
  },
}

// Wave 2: "<cost>: <known sentences>." on permanents (CR 602.1), with "Activate only as a sorcery." at the end.
// Every cost item must be known; loyalty ("+1:"), graveyard costs ("Exile this card from your graveyard") and
// limits ("Activate only once each turn.") stay manual. Mana abilities ("{T}: Add {G}.") are read elsewhere.
const SELF_NOUN = '(?:card|creature|artifact|enchantment|land|permanent)'
function parseCost(text: string): AbilityCost | null {
  const cost: AbilityCost = {}
  for (const item of text.split(', ')) {
    if (item === '{T}' && !cost.tap) cost.tap = true
    else if (/^(\{[^}]+\})+$/.test(item) && !cost.mana && !item.includes('{T}') && !item.includes('{Q}')) {
      const mana = parseManaCost(item)
      if (!mana || mana.unknown || mana.x) return null
      cost.mana = mana
    } else if (new RegExp(`^Sacrifice this ${SELF_NOUN}$`).test(item) && !cost.sacrifice) cost.sacrifice = 'self'
    else if (/^Sacrifice an? /.test(item) && !cost.sacrifice) {
      const filter = nounFilter(item.replace(/^Sacrifice an? /, ''))
      if (!filter) return null
      cost.sacrifice = filter
    } else if (item === 'Discard a card' && !cost.discard) cost.discard = 1
    else if (/^Pay \d{1,2} life$/.test(item) && !cost.life) cost.life = Number(item.split(' ')[1])
    else return null
  }
  return Object.keys(cost).length ? cost : null
}

const ACTIVATED_LINE: LinePattern = {
  id: 'activated-line',
  match(line, ctx) {
    if (ctx.types.includes('instant') || ctx.types.includes('sorcery')) return null
    const m = /^([^:"]+): (.+)$/.exec(line)
    if (!m) return null
    const cost = parseCost(m[1]!)
    if (!cost) return null
    const sorcery = m[2]!.endsWith(' Activate only as a sorcery.')
    const parsed = permanentEffect(sorcery ? m[2]!.slice(0, -' Activate only as a sorcery.'.length) : m[2]!)
    return parsed ? { activated: { ...parsed, text: line, cost, ...(sorcery ? { sorcerySpeed: true } : {}) } } : null
  },
}

export const PATTERNS: LinePattern[] = [SPELL_LINE, ETB_LINE, ACTIVATED_LINE]

export function recognize(line: string, ctx: LineContext, patterns: readonly LinePattern[] = PATTERNS): Recognized | null {
  for (const p of patterns) {
    const hit = p.match(line, ctx)
    if (hit) return hit
  }
  return null
}
