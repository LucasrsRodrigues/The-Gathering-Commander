// Property-style tests: random (seeded) action sequences must keep the engine's invariants.
// These double as the fitness functions for hidden information, determinism and serializability.

import { describe, expect, it } from 'vitest'
import { eventsFor, migrateState, reduce, replay, viewFor, type Action, type GameEvent, type GameState, type ZoneKind } from '../src'
import { nextRandom } from '../src/rng'
import { deepFreeze, keepAll, newGame } from './helpers'

const ZONES: ZoneKind[] = ['hand', 'battlefield', 'graveyard', 'exile', 'library', 'stack', 'command']

function pick<T>(items: readonly T[], rng: { s: number }): T {
  const [r, next] = nextRandom(rng.s)
  rng.s = next
  return items[Math.floor(r * items.length)]!
}

function randomAction(state: GameState, rng: { s: number }): Action {
  const alive = state.seats.filter((id) => !state.players[id]!.lost)
  const player = pick(alive, rng)
  const own = Object.values(state.objects).filter((o) => o.owner === player && o.zone !== 'library')
  const target = pick(alive, rng)
  const kind = pick(['pass', 'advance', 'move', 'move', 'tap', 'draw', 'life', 'counter', 'token', 'ability', 'play'] as const, rng)
  switch (kind) {
    case 'pass': return { type: 'passPriority', player: state.priority?.player ?? player }
    case 'advance': return { type: 'advanceStep', player: state.turn.active }
    case 'move': {
      const obj = own.length ? pick(own, rng) : undefined
      return obj ? { type: 'moveObject', player, objectId: obj.id, to: pick(ZONES, rng) } : { type: 'draw', player, count: 1 }
    }
    case 'tap': {
      const bf = state.battlefield.filter((id) => state.objects[id]!.controller === player)
      return bf.length ? { type: pick(['tap', 'untap'] as const, rng), player, objectId: pick(bf, rng) } : { type: 'draw', player, count: 1 }
    }
    case 'draw': return { type: 'draw', player, count: 1 }
    case 'life': return { type: 'adjustLife', player, target, delta: pick([-7, -3, -1, 2], rng) }
    case 'counter': {
      const bf = state.battlefield
      return bf.length ? { type: 'addCounter', player, objectId: pick(bf, rng), counter: '+1/+1', delta: 1 } : { type: 'draw', player, count: 1 }
    }
    case 'token': return { type: 'createToken', player, card: { name: 'Token' } }
    case 'ability': return { type: 'putAbilityOnStack', player, description: 'Efeito manual' }
    case 'play': {
      const hand = state.zones[player]!.hand
      const card = hand.length ? pick(hand, rng) : undefined
      return card ? { type: pick(['playLand', 'castSpell'] as const, rng), player, objectId: card } : { type: 'draw', player, count: 1 }
    }
  }
}

function simulate(seed: number, steps: number) {
  let state = keepAll(newGame(4, { seed, deckSize: 40 }))
  const initial = state
  const applied: Action[] = []
  const rng = { s: seed }
  for (let i = 0; i < steps && state.status === 'playing'; i++) {
    const action = randomAction(state, rng)
    const result = reduce(deepFreeze(state), action) // deepFreeze: any mutation of the input throws
    if (result.ok) {
      checkEvents(result.events, result.state)
      state = result.state
      applied.push(action)
      if (applied.length % 5 === 0) checkInvariants(state)
    }
  }
  checkInvariants(state)
  return { initial, state, applied }
}

// No filtered event may carry the id of an object that is hidden from that viewer after the action.
function checkEvents(events: GameEvent[], after: GameState) {
  for (const viewer of [...after.seats, null]) {
    const hidden = new Set<string>()
    for (const seat of after.seats) {
      after.zones[seat]!.library.forEach((id) => seat !== viewer && hidden.add(id))
      if (seat !== viewer) after.zones[seat]!.hand.forEach((id) => hidden.add(id))
    }
    const text = JSON.stringify(eventsFor(events, viewer))
    for (const id of hidden) expect(text.includes(`"${id}"`), `evento vaza ${id} para ${viewer}`).toBe(false)
  }
}

function checkInvariants(state: GameState) {
  // Every object is in exactly one place and its zone field agrees with where it is.
  const seen = new Map<string, string>()
  const note = (id: string, where: string) => {
    expect(seen.has(id), `${id} em ${seen.get(id)} e ${where}`).toBe(false)
    seen.set(id, where)
  }
  for (const id of state.seats) for (const [zone, ids] of Object.entries(state.zones[id]!)) ids.forEach((o) => note(o, zone))
  state.battlefield.forEach((o) => note(o, 'battlefield'))
  state.stack.forEach((item) => item.objectId && note(item.objectId, 'stack'))
  for (const [id, where] of seen) expect(state.objects[id]?.zone).toBe(where)
  expect(seen.size).toBe(Object.keys(state.objects).length)

  // Hidden information never leaks into another player's view.
  for (const viewer of state.seats) {
    const view = viewFor(state, viewer)
    for (const other of state.seats) {
      for (const id of state.zones[other]!.library) expect(view.objects[id]).toBeUndefined()
      if (other !== viewer) for (const id of state.zones[other]!.hand) expect(view.objects[id]).toBeUndefined()
    }
    for (const obj of Object.values(view.objects)) {
      if (obj.faceDown && obj.controller !== viewer) expect(obj.card).toBeNull()
    }
  }
}

describe('invariants under random play', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`holds for seed ${seed}`, () => {
      const { initial, state, applied } = simulate(seed, 400)
      expect(applied.length).toBeGreaterThan(100)

      // Determinism: replaying the recorded actions rebuilds the exact same state.
      const replayed = replay(initial, applied)
      expect(replayed.ok).toBe(true)
      if (replayed.ok) expect(replayed.state).toEqual(state)

      // Serializability: the state is plain JSON.
      expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    }, 30_000)
  }

  it('applies a typical action quickly with ~300 objects in play', () => {
    const { state } = simulate(9, 300)
    const start = performance.now()
    for (let i = 0; i < 200; i++) reduce(state, { type: 'adjustLife', player: state.seats[0]!, target: state.seats[0]!, delta: 0 })
    expect((performance.now() - start) / 200).toBeLessThan(1)
  })
})

// A state as engine schema 1 saved it (before épico 09).
function toV1(state: GameState): unknown {
  type Loose = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const s = structuredClone(state) as unknown as Loose
  s.schemaVersion = 1
  delete s.options
  for (const k of ['landsPerTurn', 'timingRules', 'manaRules', 'combatRules']) delete s.ruleset[k]
  for (const p of Object.values(s.players) as Loose[]) for (const k of ['manaPool', 'landsPlayed', 'lastTurnStarted', 'stops', 'passUntil']) delete p[k]
  for (const o of Object.values(s.objects) as Loose[]) for (const k of ['damage', 'deathtouchDamage', 'controlledSince', 'ptMods']) delete o[k]
  delete s.turn.combat
  return s
}

describe('schema migration (fitness function)', () => {
  it.each([3, 11, 29])('v1 games (seed %i) migrate, keep replaying deterministically and switch the new rules off', (seed) => {
    const { initial, state, applied } = simulate(seed, 150)
    const migrated = migrateState(toV1(state))!
    const start = migrateState(toV1(initial))!
    expect(migrated.schemaVersion).toBe(2)
    expect(JSON.parse(JSON.stringify(migrated))).toEqual(migrated)
    expect(migrated.ruleset).toMatchObject({ timingRules: 'off', manaRules: 'off', combatRules: 'off', landsPerTurn: 1 })
    checkInvariants(migrated)

    const a = replay(start, applied)
    const b = replay(start, applied)
    expect(a.ok && b.ok).toBe(true)
    expect(a.state).toEqual(b.state)
    // The migrated game keeps going.
    const next = reduce(migrated, { type: 'draw', player: migrated.turn.active, count: 1 })
    expect(next.ok || migrated.status !== 'playing').toBe(true)
  })

  it('leaves current states alone and rejects unknown ones', () => {
    const state = keepAll(newGame(2))
    expect(migrateState(state)).toBe(state)
    expect(migrateState({ schemaVersion: 99 })).toBeNull()
    expect(migrateState('nope')).toBeNull()
  })
})
