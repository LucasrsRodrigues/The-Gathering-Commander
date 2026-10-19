// Power, toughness and loyalty right now (épico 09, CR 208, 306.5, 613): printed values, then counters, then the
// manual "until end of turn" adjustments. Cards without data have no stats the engine can trust.

import { typesOf } from './cards'
import type { Tx } from './tx'
import type { GameObject } from './types'

export const PLUS_ONE = '+1/+1'
export const MINUS_ONE = '-1/-1'
export const LOYALTY = 'lealdade' // the counter name the table already uses

const counters = (obj: GameObject) => (obj.counters[PLUS_ONE] ?? 0) - (obj.counters[MINUS_ONE] ?? 0)
const mods = (obj: GameObject, key: 'power' | 'toughness') => obj.ptMods.reduce((n, m) => n + m[key], 0)

export function powerOf(obj: GameObject): number {
  return (obj.card.rules?.power ?? 0) + counters(obj) + mods(obj, 'power')
}

export function toughnessOf(obj: GameObject): number {
  return (obj.card.rules?.toughness ?? 0) + counters(obj) + mods(obj, 'toughness')
}

export function loyaltyOf(obj: GameObject): number {
  return obj.counters[LOYALTY] ?? 0
}

export const isCreature = (obj: GameObject) => typesOf(obj.card).includes('creature')
export const isPlaneswalker = (obj: GameObject) => typesOf(obj.card).includes('planeswalker')

// Whether the engine may apply state-based actions about stats: known, fixed numbers only (no data or '*' = manual).
export const hasKnownStats = (obj: GameObject) => !!obj.card.rules && !obj.card.rules.variablePT

// CR 120.3: damage to a creature is marked on it; damage to a planeswalker removes loyalty counters.
export function dealDamageTo(tx: Tx, obj: GameObject, amount: number, deathtouch: boolean) {
  const writable = tx.object(obj.id)
  if (isPlaneswalker(obj) && !isCreature(obj)) {
    const loyalty = Math.max(0, loyaltyOf(obj) - amount)
    writable.counters = { ...obj.counters, [LOYALTY]: loyalty }
    tx.emit({ type: 'counterChanged', objectId: obj.id, counter: LOYALTY, value: loyalty })
  } else {
    writable.damage = obj.damage + amount
    if (deathtouch) writable.deathtouchDamage = true
  }
  tx.emit({ type: 'damageDealt', objectId: obj.id, amount, total: writable.damage })
}
