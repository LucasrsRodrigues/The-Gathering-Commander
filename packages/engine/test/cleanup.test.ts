import { describe, expect, it } from 'vitest'
import { reduce, viewFor, type Action, type GameState, type RuleLevel } from '../src'
import { act, keepAll, newGame } from './helpers'

// p1 at the end step with 9 cards in hand (7 + 2 extra from the library).
function atCleanup(timingRules: RuleLevel = 'block', approval: 'auto' | 'vote' = 'auto'): GameState {
  let s = keepAll(newGame(2, { ruleset: { timingRules } }))
  s = { ...s, options: { exceptionApproval: approval } }
  for (const id of s.zones.p1!.library.slice(-2)) s = act(s, { type: 'moveObject', player: 'p1', objectId: id, to: 'hand' }).state
  while (s.turn.step !== 'end') s = act(s, { type: 'advanceStep', player: 'p1' }).state
  return act(s, { type: 'advanceStep', player: 'p1' }).state
}
const codeOf = (s: GameState, a: Action) => {
  const r = reduce(s, a)
  return r.ok ? 'ok' : (r.error.findings?.[0]?.code ?? r.error.code)
}

describe('discard to hand size in cleanup (CR 514.1)', () => {
  it('asks the active player to discard down to the maximum, then the turn passes', () => {
    let s = atCleanup()
    expect(s.zones.p1!.hand).toHaveLength(9)
    expect(s.pending).toEqual({ kind: 'discard', player: 'p1', count: 2 })
    expect(s.turn.active).toBe('p1')
    expect(codeOf(s, { type: 'draw', player: 'p1', count: 1 })).toBe('notYourDecision')
    const chosen = s.zones.p1!.hand.slice(0, 2)
    s = act(s, { type: 'discard', player: 'p1', objectIds: chosen }).state
    expect(s.zones.p1!.hand).toHaveLength(7)
    expect(s.zones.p1!.graveyard).toEqual(chosen)
    expect(s.turn.active).toBe('p2')
  })

  it('the other players see how many, never which, until it is done', () => {
    const s = atCleanup()
    const seen = viewFor(s, 'p2')
    expect(seen.pending).toEqual({ kind: 'discard', player: 'p1', count: 2 })
    expect(seen.players.p1!.hand).toEqual([])
  })

  it('keeping more cards is an exception; wrong cards are refused', () => {
    const s = atCleanup()
    expect(codeOf(s, { type: 'discard', player: 'p1', objectIds: s.zones.p1!.hand.slice(0, 1) })).toBe('discardCount')
    expect(codeOf(s, { type: 'discard', player: 'p1', objectIds: [s.zones.p2!.hand[0]!, s.zones.p2!.hand[1]!] })).toBe('invalidSelection')
    expect(codeOf(s, { type: 'discard', player: 'p2', objectIds: [] })).toBe('notYourDecision')
    const kept = act(s, { type: 'requestException', player: 'p1', action: { type: 'discard', objectIds: [] }, reason: 'Reliquary Tower' }).state
    expect(kept.zones.p1!.hand).toHaveLength(9)
    expect(kept.turn.active).toBe('p2')
  })

  it('with turn rules off the sandbox does not ask', () => {
    const s = atCleanup('off')
    expect(s.pending).toBeNull()
    expect(s.turn.active).toBe('p2')
  })
})
