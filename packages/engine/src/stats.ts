// Power, toughness and loyalty right now (épico 09, CR 208, 306.5, 613). Since épico 12 they come from the
// characteristics (layers.ts); cards without data have no stats the engine can trust.

import { charsOf } from './layers'
import type { Tx } from './tx'
import type { GameObject, GameState } from './types'

export const PLUS_ONE = '+1/+1'
export const MINUS_ONE = '-1/-1'
export const LOYALTY = 'lealdade' // the counter name the table already uses

export const powerOf = (state: GameState, obj: GameObject): number => charsOf(state, obj).power
export const toughnessOf = (state: GameState, obj: GameObject): number => charsOf(state, obj).toughness

export function loyaltyOf(obj: GameObject): number {
  return obj.counters[LOYALTY] ?? 0
}

export const isCreature = (state: GameState, obj: GameObject) => charsOf(state, obj).types.includes('creature')
export const isPlaneswalker = (state: GameState, obj: GameObject) => charsOf(state, obj).types.includes('planeswalker')

// Whether the engine may apply state-based actions about stats: known, fixed numbers only (no data or '*' = manual).
export const hasKnownStats = (obj: GameObject) => !!obj.card.rules && !obj.card.rules.variablePT

// CR 120.3: damage to a creature is marked on it; damage to a planeswalker removes loyalty counters.
export function dealDamageTo(tx: Tx, obj: GameObject, amount: number, deathtouch: boolean) {
  const writable = tx.object(obj.id)
  if (isPlaneswalker(tx.s, obj) && !isCreature(tx.s, obj)) {
    const loyalty = Math.max(0, loyaltyOf(obj) - amount)
    writable.counters = { ...obj.counters, [LOYALTY]: loyalty }
    tx.emit({ type: 'counterChanged', objectId: obj.id, counter: LOYALTY, value: loyalty })
  } else {
    writable.damage = obj.damage + amount
    if (deathtouch) writable.deathtouchDamage = true
  }
  tx.emit({ type: 'damageDealt', objectId: obj.id, amount, total: writable.damage })
}
