// Mana (épico 09, CR 106, 605): the pool, what a mana ability produces and summoning sickness for {T} abilities.

import { fail, RuleViolation } from './errors'
import { hasKeyword, typesOf } from './cards'
import type { Tx } from './tx'
import type { GameObject, GameState, ManaAbility, ManaActivation, ManaAmount, ManaColor, ManaPool, ManaType, PlayerId } from './types'

export const MANA_TYPES: readonly ManaType[] = ['W', 'U', 'B', 'R', 'G', 'C']
const COLORS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G']
export const MAX_DECLARED_MANA = 20

export function poolTotal(pool: ManaAmount): number {
  return MANA_TYPES.reduce((n, t) => n + (pool[t] ?? 0), 0)
}

// CR 302.6: a creature's {T} abilities need it under its controller's control since their most recent turn began.
export function isSummoningSick(state: GameState, obj: GameObject): boolean {
  if (!typesOf(obj.card).includes('creature') || hasKeyword(obj.card, 'haste')) return false
  return obj.controlledSince >= (state.players[obj.controller]?.lastTurnStarted ?? 0)
}

// CR 903.4: the combined color identity of the player's commanders.
export function commanderIdentity(state: GameState, player: PlayerId): ManaColor[] {
  const colors = new Set<ManaColor>()
  for (const obj of Object.values(state.objects)) {
    if (obj.isCommander && obj.owner === player) for (const c of obj.card.rules?.colorIdentity ?? []) colors.add(c)
  }
  return COLORS.filter((c) => colors.has(c))
}

// The colors a player may pick from for this ability; null when it produces fixed mana.
export function colorChoices(state: GameState, player: PlayerId, ability: ManaAbility): ManaType[] | null {
  const p = ability.produces
  switch (p.kind) {
    case 'fixed': return null
    case 'oneOf': return p.colors
    case 'anyColor': return [...COLORS]
    case 'commanderIdentity': return commanderIdentity(state, player)
  }
}

// What the ability adds, given the chosen color when there is a choice.
export function production(state: GameState, player: PlayerId, ability: ManaAbility, color: ManaType | undefined): ManaAmount {
  const p = ability.produces
  if (p.kind === 'fixed') return p.mana
  const choices = colorChoices(state, player, ability)!
  // CR 903.4f: "a color in your commander's identity" with a colorless commander produces no mana.
  if (!choices.length) return {}
  const chosen = color ?? (choices.length === 1 ? choices[0] : undefined)
  if (!chosen || !choices.includes(chosen)) fail('invalidAction', `Escolha a cor da mana: ${choices.join(', ')}.`)
  return { [chosen]: p.kind === 'anyColor' ? p.amount : 1 }
}

// Pays generic mana from the pool, colorless first, then the colors there are most of. Null when it cannot.
export function payGeneric(pool: ManaPool, amount: number): ManaPool | null {
  if (poolTotal(pool) < amount) return null
  const next = { ...pool }
  let left = amount
  const order = ['C' as ManaType, ...[...COLORS].sort((a, b) => next[b] - next[a])]
  for (const t of order) {
    const take = Math.min(next[t], left)
    next[t] -= take
    left -= take
  }
  return next
}

export interface SimulatedPool {
  pool: ManaPool
  sick: boolean // some creature source is summoning sick
  short: boolean // some extra cost ({1}, {T}: …) could not be paid when its turn came
}

// The pool after activating these abilities in order, without touching the state. Null when an activation is
// not possible at all (unknown or tapped source, used twice, no such ability, wrong color).
export function simulatePool(state: GameState, player: PlayerId, activations: readonly ManaActivation[]): SimulatedPool | null {
  let pool = { ...state.players[player]!.manaPool }
  let sick = false
  let short = false
  const used = new Set<string>()
  for (const a of activations) {
    const obj = state.objects[a.objectId]
    if (!obj || obj.zone !== 'battlefield' || obj.controller !== player || obj.tapped || used.has(obj.id)) return null
    used.add(obj.id)
    const ability = obj.card.rules?.manaAbilities[a.abilityIndex]
    if (!ability) return null
    let mana: ManaAmount
    try {
      mana = production(state, player, ability, a.color)
    } catch (err) {
      if (err instanceof RuleViolation) return null
      throw err
    }
    if (isSummoningSick(state, obj)) sick = true
    if (ability.extraCost) {
      const paid = payGeneric(pool, ability.extraCost.generic)
      if (!paid) short = true
      pool = paid ?? payGeneric(pool, poolTotal(pool))!
    }
    for (const t of MANA_TYPES) pool[t] += mana[t] ?? 0
  }
  return { pool, sick, short }
}

export function addMana(tx: Tx, player: PlayerId, mana: ManaAmount, source: GameObject['id'] | null) {
  if (!poolTotal(mana)) return
  const pool = { ...tx.s.players[player]!.manaPool }
  for (const t of MANA_TYPES) pool[t] += mana[t] ?? 0
  tx.player(player).manaPool = pool
  tx.emit({ type: 'manaAdded', player, mana, source })
}

// CR 500.4: mana empties from every pool at the end of each step and phase.
export function emptyPools(tx: Tx) {
  for (const id of tx.s.seats) {
    const pool = tx.s.players[id]!.manaPool
    if (!poolTotal(pool)) continue
    tx.player(id).manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
    tx.emit({ type: 'manaEmptied', player: id })
  }
}
