import { describe, expect, it } from 'vitest'
import { reduce } from '../src'
import type { Action } from '../src'
import { act, expectError, firstInHand, started } from './helpers'

// reduce() is the trust boundary: actions may come from a UI, a bot or the network, so a
// malformed action must come back as a GameError and never throw or corrupt the state.
const raw = (value: unknown) => value as Action

describe('action validation', () => {
  it('rejects unknown types and malformed shapes without throwing', () => {
    const s = started(2)
    expectError(s, raw({ type: 'deleteEverything', player: 'p1' }), 'invalidAction')
    expectError(s, raw({ type: 'draw', player: 42, count: 1 }), 'invalidAction')
    expectError(s, raw({ type: 'tap', player: 'p1', objectId: { id: 'x' } }), 'invalidAction')
    expectError(s, raw(null), 'invalidAction')
  })

  it('never resolves ids to inherited members such as constructor or __proto__', () => {
    const s = started(2)
    expectError(s, raw({ type: 'draw', player: 'constructor', count: 1 }), 'unknownPlayer')
    expectError(s, raw({ type: 'tap', player: 'p1', objectId: 'toString' }), 'unknownObject')
    expectError(s, raw({ type: 'adjustLife', player: 'p1', target: '__proto__', delta: 1 }), 'unknownPlayer')
    expectError(s, raw({ type: 'commanderDamage', player: 'p1', target: 'p2', commanderId: 'hasOwnProperty', amount: 1, alsoLife: false }), 'unknownObject')
  })

  it('refuses counter names that would reach Object.prototype', () => {
    let s = started(2)
    const bear = firstInHand(s, 'p1', 'Creature')
    s = act(s, { type: 'moveObject', player: 'p1', objectId: bear, to: 'battlefield' }).state
    expectError(s, { type: 'addCounter', player: 'p1', objectId: bear, counter: '__proto__', delta: 1 }, 'invalidAmount')
    expectError(s, { type: 'addCounter', player: 'p1', objectId: bear, counter: 'constructor', delta: 1 }, 'invalidAmount')
    expect(Object.getPrototypeOf(s.objects[bear]!.counters)).toBe(Object.prototype)
  })

  it('bounds numeric amounts and coordinates', () => {
    let s = started(2)
    const bear = firstInHand(s, 'p1', 'Creature')
    s = act(s, { type: 'moveObject', player: 'p1', objectId: bear, to: 'battlefield' }).state
    expectError(s, { type: 'adjustLife', player: 'p1', target: 'p1', delta: Number.MAX_SAFE_INTEGER }, 'invalidAmount')
    expectError(s, { type: 'adjustPoison', player: 'p1', target: 'p1', delta: 1.5 }, 'invalidAmount')
    expectError(s, { type: 'addCounter', player: 'p1', objectId: bear, counter: 'x', delta: 1e9 }, 'invalidAmount')
    expectError(s, { type: 'setArrangement', player: 'p1', objectId: bear, arrangement: { x: 1e9, z: 0 } }, 'invalidAmount')
    expectError(s, { type: 'setArrangement', player: 'p1', objectId: bear, arrangement: { x: Number.NaN, z: 0 } }, 'invalidAmount')
  })

  it('checks optional fields of moveObject and keeps only known token fields', () => {
    const s = started(2)
    const card = firstInHand(s, 'p1', 'Creature')
    expectError(s, raw({ type: 'moveObject', player: 'p1', objectId: card, to: 'graveyard', position: 'middle' }), 'invalidAction')
    expectError(s, raw({ type: 'moveObject', player: 'p1', objectId: card, to: 'graveyard', faceDown: 'yes' }), 'invalidAction')

    const tooLong = 'x'.repeat(500)
    expectError(s, { type: 'createToken', player: 'p1', card: { name: 'Soldier', typeLine: tooLong } }, 'invalidAmount')
    const result = reduce(s, raw({ type: 'createToken', player: 'p1', card: { name: ' Soldier ', extra: { evil: true } } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const created = result.events.find((e) => e.type === 'tokenCreated')
    const id = created?.type === 'tokenCreated' ? created.objectId : ''
    expect(result.state.objects[id]!.card).toEqual({ name: 'Soldier' })
  })

  it('leaves the input state untouched on every rejected action', () => {
    const s = started(2)
    const snapshot = JSON.stringify(s)
    reduce(s, raw({ type: 'bottomCards', player: 'p1', objectIds: 'not-an-array' }))
    reduce(s, raw({ type: 'adjustLife', player: 'p1', target: 'p2', delta: '5' }))
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})
