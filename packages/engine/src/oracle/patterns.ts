// Sentence patterns of the Oracle reader (épico 11). Each pattern recognizes one exact shape of an ability line and
// returns its piece of the effect model. Lines no pattern recognizes stay manual: on doubt, never guess.
//
// The list starts empty (T11.2); each wave adds patterns measured by the coverage command (T11.3). Only the reader
// (deriveRules.ts) uses this file: the rules core never sees Oracle text.

import type { Ability, ActivatedAbility, CardType, ManaAbility } from '../types'
import { parseSpellLine } from './sentences'

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
const ETB_LINE: LinePattern = {
  id: 'etb-line',
  match(line, ctx) {
    if (ctx.types.includes('instant') || ctx.types.includes('sorcery')) return null
    const m = ENTERS.exec(line)
    if (!m) return null
    const rest = m[1]!.replace(SELF_DEALS, 'this card deals ')
    const parsed = parseSpellLine(rest.startsWith('this card ') ? rest : rest[0]!.toUpperCase() + rest.slice(1))
    return parsed ? { etb: { ...parsed, text: line } } : null
  },
}

export const PATTERNS: LinePattern[] = [SPELL_LINE, ETB_LINE]

export function recognize(line: string, ctx: LineContext, patterns: readonly LinePattern[] = PATTERNS): Recognized | null {
  for (const p of patterns) {
    const hit = p.match(line, ctx)
    if (hit) return hit
  }
  return null
}
