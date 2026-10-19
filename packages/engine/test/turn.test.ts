import { describe, expect, it } from 'vitest'
import { STEPS } from '../src'
import { act, expectError, firstInHand, started } from './helpers'

describe('turn structure and priority', () => {
  it('passes through every step with priority (no priority in untap/cleanup) and rotates turns', () => {
    let s = started(4)
    const seen: string[] = [s.turn.step]
    for (let i = 0; i < 9; i++) {
      s = act(s, { type: 'advanceStep', player: 'p1' }).state
      seen.push(s.turn.step)
    }
    expect(seen).toEqual(STEPS.filter((st) => st !== 'untap' && st !== 'cleanup'))
    s = act(s, { type: 'advanceStep', player: 'p1' }).state
    expect(s.turn).toEqual({ number: 2, active: 'p2', step: 'upkeep', combat: null })
  })

  it('draws automatically in the draw step', () => {
    let s = started(4)
    const before = s.zones.p1!.hand.length
    s = act(s, { type: 'advanceStep', player: 'p1' }).state
    expect(s.turn.step).toBe('draw')
    expect(s.zones.p1!.hand.length).toBe(before + 1)
  })

  it('skips the first draw of the starting player only in 2-player games (CR 103.8a)', () => {
    let s = started(2)
    const before = s.zones.p1!.hand.length
    s = act(s, { type: 'advanceStep', player: 'p1' }).state
    expect(s.zones.p1!.hand.length).toBe(before)
  })

  it('untaps the active player permanents at the start of their turn', () => {
    let s = started(2)
    const land = firstInHand(s, 'p1', 'Creature')
    s = act(s, { type: 'moveObject', player: 'p1', objectId: land, to: 'battlefield' }).state
    s = act(s, { type: 'tap', player: 'p1', objectId: land }).state
    for (let i = 0; i < 20 && s.turn.number < 3; i++) s = act(s, { type: 'advanceStep', player: s.turn.active }).state
    expect(s.turn.active).toBe('p1')
    expect(s.objects[land]!.tapped).toBe(false)
  })

  it('advances the step when everyone passes with an empty stack (CR 117.4)', () => {
    let s = started(4)
    for (const p of ['p1', 'p2', 'p3']) {
      s = act(s, { type: 'passPriority', player: p }).state
      expect(s.turn.step).toBe('upkeep')
    }
    s = act(s, { type: 'passPriority', player: 'p4' }).state
    expect(s.turn.step).toBe('draw')
    expect(s.priority).toEqual({ player: 'p1', passed: [] })
  })

  it('acting keeps priority and resets passes (CR 117.3c)', () => {
    let s = started(4)
    s = act(s, { type: 'passPriority', player: 'p1' }).state
    expect(s.priority?.player).toBe('p2')
    s = act(s, { type: 'adjustLife', player: 'p2', target: 'p2', delta: -1 }).state
    expect(s.priority).toEqual({ player: 'p2', passed: [] })
  })

  it('resolves the stack top-first: permanents to battlefield, others to graveyard', () => {
    let s = started(2)
    const bear = firstInHand(s, 'p1', 'Creature')
    const bolt = firstInHand(s, 'p1', 'Instant')
    s = act(s, { type: 'moveObject', player: 'p1', objectId: bear, to: 'stack' }).state
    s = act(s, { type: 'moveObject', player: 'p1', objectId: bolt, to: 'stack' }).state
    expect(s.stack.map((i) => i.objectId)).toEqual([bear, bolt])

    s = act(s, { type: 'passPriority', player: 'p1' }).state
    s = act(s, { type: 'passPriority', player: 'p2' }).state
    expect(s.zones.p1!.graveyard).toContain(bolt)
    expect(s.priority).toEqual({ player: 'p1', passed: [] })

    s = act(s, { type: 'passPriority', player: 'p1' }).state
    s = act(s, { type: 'passPriority', player: 'p2' }).state
    expect(s.battlefield).toContain(bear)
    expect(s.stack).toHaveLength(0)
    expect(s.turn.step).toBe('upkeep')
  })

  it('manual abilities leave the stack when they resolve', () => {
    let s = started(2)
    s = act(s, { type: 'putAbilityOnStack', player: 'p2', description: 'Ganhe 1 de vida' }).state
    expect(s.stack[0]).toMatchObject({ kind: 'ability', controller: 'p2' })
    s = act(s, { type: 'passPriority', player: 'p2' }).state
    s = act(s, { type: 'passPriority', player: 'p1' }).state
    expect(s.stack).toHaveLength(0)
  })

  it('guards priority-related actions', () => {
    let s = started(2)
    expectError(s, { type: 'passPriority', player: 'p2' }, 'notYourPriority')
    expectError(s, { type: 'advanceStep', player: 'p2' }, 'notActivePlayer')
    s = act(s, { type: 'putAbilityOnStack', player: 'p1', description: 'Algo' }).state
    expectError(s, { type: 'advanceStep', player: 'p1' }, 'stackNotEmpty')

    const strict = started(2, { ruleset: { priorityMode: 'strict' } })
    expectError(strict, { type: 'advanceStep', player: 'p1' }, 'strictPriority')
    expectError(strict, { type: 'draw', player: 'p2', count: 1 }, 'strictPriority')
  })
})
