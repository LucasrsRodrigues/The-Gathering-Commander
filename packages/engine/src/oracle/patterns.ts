// Sentence patterns of the Oracle reader (épico 11). Each pattern recognizes one exact shape of an ability line and
// returns its piece of the effect model. Lines no pattern recognizes stay manual: on doubt, never guess.
//
// The list starts empty (T11.2); each wave adds patterns measured by the coverage command (T11.3). Only the reader
// (deriveRules.ts) uses this file: the rules core never sees Oracle text.

import type { Ability, ActivatedAbility, CardType, ManaAbility } from '../types'

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

export const PATTERNS: LinePattern[] = []

export function recognize(line: string, ctx: LineContext, patterns: readonly LinePattern[] = PATTERNS): Recognized | null {
  for (const p of patterns) {
    const hit = p.match(line, ctx)
    if (hit) return hit
  }
  return null
}
