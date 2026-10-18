import { describe, expect, it } from 'vitest'
import { commanderTax } from '../src'
import { act, expectError, firstInHand, started } from './helpers'

describe('sandbox actions', () => {
  it('taps, untaps and resets state when a permanent changes zones (CR 400.7)', () => {
    let s = started(2)
    const bear = firstInHand(s, 'p1', 'Creature')
    s = act(s, { type: 'moveObject', player: 'p1', objectId: bear, to: 'battlefield' }).state
    s = act(s, { type: 'tap', player: 'p1', objectId: bear }).state
    s = act(s, { type: 'addCounter', player: 'p1', objectId: bear, counter: '+1/+1', delta: 2 }).state
    s = act(s, { type: 'setArrangement', player: 'p1', objectId: bear, arrangement: { x: 1, z: 2 } }).state
    expect(s.objects[bear]).toMatchObject({ tapped: true, counters: { '+1/+1': 2 }, arrangement: { x: 1, z: 2 } })

    s = act(s, { type: 'moveObject', player: 'p1', objectId: bear, to: 'graveyard' }).state
    expect(s.objects[bear]).toMatchObject({ zone: 'graveyard', tapped: false, counters: {} })
    expect(s.objects[bear]!.arrangement).toBeUndefined()
  })

  it('removes a counter type when it reaches zero and rejects zero deltas', () => {
    let s = started(2)
    const bear = firstInHand(s, 'p1', 'Creature')
    s = act(s, { type: 'moveObject', player: 'p1', objectId: bear, to: 'battlefield' }).state
    s = act(s, { type: 'addCounter', player: 'p1', objectId: bear, counter: 'loyalty', delta: 1 }).state
    s = act(s, { type: 'addCounter', player: 'p1', objectId: bear, counter: 'loyalty', delta: -3 }).state
    expect(s.objects[bear]!.counters).toEqual({})
    expectError(s, { type: 'addCounter', player: 'p1', objectId: bear, counter: 'x', delta: 0 }, 'invalidAmount')
  })

  it('tokens cease to exist when they leave the battlefield (CR 111.7)', () => {
    let s = started(2)
    const { state, events } = act(s, { type: 'createToken', player: 'p1', card: { name: 'Soldier', typeLine: 'Token Creature — Soldier' } })
    s = state
    const token = events.find((e) => e.type === 'tokenCreated')!
    const id = token.type === 'tokenCreated' ? token.objectId : ''
    expect(s.battlefield).toContain(id)
    s = act(s, { type: 'moveObject', player: 'p1', objectId: id, to: 'graveyard' }).state
    expect(s.objects[id]).toBeUndefined()
    expect(s.zones.p1!.graveyard).not.toContain(id)
  })

  it('draws, mills and shuffles', () => {
    let s = started(2)
    const hand = s.zones.p1!.hand.length
    s = act(s, { type: 'draw', player: 'p1', count: 2 }).state
    expect(s.zones.p1!.hand).toHaveLength(hand + 2)
    s = act(s, { type: 'mill', player: 'p1', count: 3 }).state
    expect(s.zones.p1!.graveyard).toHaveLength(3)
    const before = s.zones.p1!.library
    s = act(s, { type: 'shuffleLibrary', player: 'p1' }).state
    expect(s.zones.p1!.library.slice().sort()).toEqual(before.slice().sort())
    expectError(s, { type: 'draw', player: 'p1', count: 0 }, 'invalidAmount')
    expectError(s, { type: 'draw', player: 'p1', count: 101 }, 'invalidAmount')
  })

  it('puts cards on top or bottom of the library', () => {
    let s = started(2)
    const [a, b] = s.zones.p1!.hand
    s = act(s, { type: 'moveObject', player: 'p1', objectId: a!, to: 'library', position: 'top' }).state
    s = act(s, { type: 'moveObject', player: 'p1', objectId: b!, to: 'library', position: 'bottom' }).state
    expect(s.zones.p1!.library.at(-1)).toBe(a)
    expect(s.zones.p1!.library[0]).toBe(b)
  })

  it('never lets a player touch another player hidden zones', () => {
    const s = started(2)
    const theirs = s.zones.p2!.hand[0]!
    expectError(s, { type: 'moveObject', player: 'p1', objectId: theirs, to: 'graveyard' }, 'notAllowed')
  })

  it('restricts battlefield objects to their controller when the ruleset says so', () => {
    let s = started(2, { ruleset: { restrictToController: true } })
    const bear = firstInHand(s, 'p1', 'Creature')
    s = act(s, { type: 'moveObject', player: 'p1', objectId: bear, to: 'battlefield' }).state
    expectError(s, { type: 'tap', player: 'p2', objectId: bear }, 'notAllowed')

    let open = started(2)
    const other = firstInHand(open, 'p1', 'Creature')
    open = act(open, { type: 'moveObject', player: 'p1', objectId: other, to: 'battlefield' }).state
    open = act(open, { type: 'moveObject', player: 'p2', objectId: other, to: 'exile' }).state
    expect(open.zones.p1!.exile).toContain(other)
  })

  it('rejects unknown objects, invalid zones and bad text', () => {
    const s = started(2)
    expectError(s, { type: 'tap', player: 'p1', objectId: 'nope' }, 'unknownObject')
    expectError(s, { type: 'tap', player: 'p1', objectId: s.zones.p1!.hand[0]! }, 'invalidZone')
    expectError(s, { type: 'moveObject', player: 'p1', objectId: s.zones.p1!.hand[0]!, to: 'moon' as never }, 'invalidZone')
    expectError(s, { type: 'putAbilityOnStack', player: 'p1', description: '   ' }, 'invalidAmount')
    expectError(s, { type: 'putAbilityOnStack', player: 'p1', description: 'x'.repeat(201) }, 'invalidAmount')
  })
})

describe('commander rules', () => {
  it('tracks commander tax per cast from the command zone (CR 903.8)', () => {
    let s = started(2)
    const cmd = s.zones.p1!.command[0]!
    expect(commanderTax(s.objects[cmd]!, s.ruleset)).toBe(0)
    s = act(s, { type: 'moveObject', player: 'p1', objectId: cmd, to: 'stack' }).state
    s = act(s, { type: 'passPriority', player: 'p1' }).state
    s = act(s, { type: 'passPriority', player: 'p2' }).state
    expect(s.battlefield).toContain(cmd)

    const { state, events } = act(s, { type: 'moveObject', player: 'p1', objectId: cmd, to: 'graveyard' })
    expect(events).toContainEqual({ type: 'commanderMayReturn', objectId: cmd, owner: 'p1' })
    s = act(state, { type: 'moveObject', player: 'p1', objectId: cmd, to: 'command' }).state
    s = act(s, { type: 'moveObject', player: 'p1', objectId: cmd, to: 'stack' }).state
    expect(commanderTax(s.objects[cmd]!, s.ruleset)).toBe(4)
  })

  it('accumulates commander damage per commander and can also cost life', () => {
    let s = started(3)
    const c2 = s.zones.p2!.command[0]!
    const c3 = s.zones.p3!.command[0]!
    s = act(s, { type: 'commanderDamage', player: 'p2', target: 'p1', commanderId: c2, amount: 15, alsoLife: true }).state
    s = act(s, { type: 'commanderDamage', player: 'p3', target: 'p1', commanderId: c3, amount: 15, alsoLife: false }).state
    expect(s.players.p1).toMatchObject({ life: 25, commanderDamage: { [c2]: 15, [c3]: 15 }, lost: false })
    expectError(s, { type: 'commanderDamage', player: 'p2', target: 'p1', commanderId: s.zones.p2!.library[0]!, amount: 1, alsoLife: false }, 'unknownObject')
  })
})
