import { describe, expect, it } from 'vitest'
import { act, expectError, firstInHand, newGame, started } from './helpers'

describe('state-based losing and game end', () => {
  it('a player at 0 life loses and leaves turn rotation (CR 704.5a, 800.4)', () => {
    let s = started(3)
    const bear = firstInHand(s, 'p2', 'Creature')
    s = act(s, { type: 'moveObject', player: 'p2', objectId: bear, to: 'battlefield' }).state
    const { state, events } = act(s, { type: 'adjustLife', player: 'p1', target: 'p2', delta: -40 })
    expect(state.players.p2).toMatchObject({ lost: true, lossReason: 'life' })
    expect(events).toContainEqual({ type: 'playerLost', player: 'p2', reason: 'life' })
    expect(state.battlefield).not.toContain(bear)
    expect(state.objects[bear]).toBeUndefined()

    let t = state
    for (let i = 0; i < 12 && t.turn.number < 2; i++) t = act(t, { type: 'advanceStep', player: 'p1' }).state
    expect(t.turn.active).toBe('p3')
    expectError(t, { type: 'draw', player: 'p2', count: 1 }, 'playerLost')
  })

  it('10 poison or 21 damage from one commander loses; 21 split across commanders does not', () => {
    let s = started(3)
    const c2 = s.zones.p2!.command[0]!
    const c3 = s.zones.p3!.command[0]!
    s = act(s, { type: 'commanderDamage', player: 'p2', target: 'p1', commanderId: c2, amount: 11, alsoLife: false }).state
    s = act(s, { type: 'commanderDamage', player: 'p3', target: 'p1', commanderId: c3, amount: 11, alsoLife: false }).state
    expect(s.players.p1!.lost).toBe(false)
    s = act(s, { type: 'commanderDamage', player: 'p2', target: 'p1', commanderId: c2, amount: 10, alsoLife: false }).state
    expect(s.players.p1).toMatchObject({ lost: true, lossReason: 'commanderDamage' })

    s = act(s, { type: 'adjustPoison', player: 'p2', target: 'p3', delta: 10 }).state
    expect(s.players.p3).toMatchObject({ lost: true, lossReason: 'poison' })
    expect(s.status).toBe('ended')
    expect(s.winners).toEqual(['p2'])
    expectError(s, { type: 'draw', player: 'p2', count: 1 }, 'gameOver')
  })

  it('drawing from an empty library loses (CR 704.5b)', () => {
    let s = started(2, { deckSize: 8 })
    s = act(s, { type: 'draw', player: 'p2', count: 5 }).state
    expect(s.players.p2).toMatchObject({ lost: true, lossReason: 'emptyLibrary' })
    expect(s.winners).toEqual(['p1'])
  })

  it('conceding the active player starts the next turn; conceding during mulligans moves the decision on', () => {
    let s = started(3)
    s = act(s, { type: 'concede', player: 'p1' }).state
    expect(s.turn).toMatchObject({ active: 'p2', number: 2 })

    let m = newGame(3)
    m = act(m, { type: 'concede', player: 'p1' }).state
    expect(m.pending).toEqual({ kind: 'mulligan', player: 'p2' })
  })

  it('a goldfish game ends only when the single player loses', () => {
    let s = started(1)
    s = act(s, { type: 'adjustLife', player: 'p1', target: 'p1', delta: -39 }).state
    expect(s.status).toBe('playing')
    s = act(s, { type: 'adjustLife', player: 'p1', target: 'p1', delta: -1 }).state
    expect(s.status).toBe('ended')
    expect(s.winners).toEqual([])
  })

  it('can turn automatic losing off as a house rule', () => {
    let s = started(2, { ruleset: { autoLoss: false } })
    s = act(s, { type: 'adjustLife', player: 'p1', target: 'p2', delta: -50 }).state
    expect(s.players.p2!.lost).toBe(false)
  })
})
