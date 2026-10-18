import { describe, expect, it } from 'vitest'
import { createGame } from '../src'
import { shuffle } from '../src/rng'
import { act, expectError, newGame } from './helpers'

describe('rng', () => {
  it('shuffles deterministically per seed', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    expect(shuffle(items, 7)).toEqual(shuffle(items, 7))
    expect(shuffle(items, 7)[0]).not.toEqual(shuffle(items, 8)[0])
    expect(shuffle(items, 7)[0].slice().sort((a, b) => a - b)).toEqual(items)
  })
})

describe('createGame', () => {
  it('sets up a 4-player Commander game', () => {
    const s = newGame(4)
    expect(s.status).toBe('mulligan')
    expect(s.seats).toEqual(['p1', 'p2', 'p3', 'p4'])
    for (const id of s.seats) {
      expect(s.players[id]!.life).toBe(40)
      expect(s.zones[id]!.hand).toHaveLength(7)
      expect(s.zones[id]!.library).toHaveLength(92)
      expect(s.zones[id]!.command).toHaveLength(1)
      expect(s.objects[s.zones[id]!.command[0]!]!.isCommander).toBe(true)
    }
    expect(s.pending).toEqual({ kind: 'mulligan', player: 'p1' })
  })

  it('is deterministic for the same seed and differs for another', () => {
    expect(newGame(4, { seed: 1 })).toEqual(newGame(4, { seed: 1 }))
    expect(newGame(4, { seed: 1 }).zones.p1!.hand).not.toEqual(newGame(4, { seed: 2 }).zones.p1!.hand)
  })

  it('applies ruleset overrides such as house-rule starting life', () => {
    const s = newGame(2, { ruleset: { startingLife: 30, startingHandSize: 6 } })
    expect(s.players.p1!.life).toBe(30)
    expect(s.zones.p1!.hand).toHaveLength(6)
  })

  it('rejects invalid configurations', () => {
    expect(() => createGame({ seed: 1, players: [] })).toThrow()
    const p = { id: 'a', name: 'A', deck: { commanders: [], cards: [] } }
    expect(() => createGame({ seed: 1, players: [p, p] })).toThrow()
    expect(() => createGame({ seed: 1, players: [p, { ...p, id: 'b' }, { ...p, id: 'c' }, { ...p, id: 'd' }, { ...p, id: 'e' }] })).toThrow()
  })
})

describe('London mulligan', () => {
  it('keeps hands in order and starts turn 1 in upkeep', () => {
    let s = newGame(2)
    s = act(s, { type: 'keepHand', player: 'p1' }).state
    expect(s.pending).toEqual({ kind: 'mulligan', player: 'p2' })
    const { state, events } = act(s, { type: 'keepHand', player: 'p2' })
    expect(state.status).toBe('playing')
    expect(state.turn).toEqual({ number: 1, active: 'p1', step: 'upkeep' })
    expect(state.priority).toEqual({ player: 'p1', passed: [] })
    expect(events.map((e) => e.type)).toContain('gameStarted')
  })

  it('first mulligan is free; the second asks for one card to the bottom', () => {
    let s = newGame(2)
    s = act(s, { type: 'mulligan', player: 'p1' }).state
    expect(s.zones.p1!.hand).toHaveLength(7)
    expect(s.zones.p1!.library).toHaveLength(92)
    s = act(s, { type: 'mulligan', player: 'p1' }).state
    s = act(s, { type: 'keepHand', player: 'p1' }).state
    expect(s.pending).toEqual({ kind: 'bottomCards', player: 'p1', count: 1 })

    const card = s.zones.p1!.hand[0]!
    expectError(s, { type: 'bottomCards', player: 'p1', objectIds: [] }, 'invalidSelection')
    expectError(s, { type: 'keepHand', player: 'p1' }, 'notYourDecision')
    s = act(s, { type: 'bottomCards', player: 'p1', objectIds: [card] }).state
    expect(s.zones.p1!.hand).toHaveLength(6)
    expect(s.zones.p1!.library[0]).toBe(card)
    expect(s.pending).toEqual({ kind: 'mulligan', player: 'p2' })
  })

  it('rejects out-of-turn decisions and game actions during mulligans', () => {
    const s = newGame(2)
    expectError(s, { type: 'keepHand', player: 'p2' }, 'notYourDecision')
    expectError(s, { type: 'draw', player: 'p1', count: 1 }, 'wrongPhase')
  })
})
