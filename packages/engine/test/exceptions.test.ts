import { describe, expect, it } from 'vitest'
import { reduce, type Action, type GameState } from '../src'
import { act, keepAll, newGame } from './helpers'

function game(players: number, approval: 'auto' | 'vote'): GameState {
  const s = keepAll(newGame(players, { ruleset: { timingRules: 'block' } }))
  return { ...s, options: { exceptionApproval: approval } }
}

function give(state: GameState, player: string, kind: 'Land' | 'Creature'): [GameState, string] {
  const id = state.zones[player]!.library.find((o) => state.objects[o]!.card.typeLine?.includes(kind))!
  return [act(state, { type: 'moveObject', player, objectId: id, to: 'hand' }).state, id]
}

const errorOf = (state: GameState, action: Action) => {
  const r = reduce(state, action)
  return r.ok ? 'ok' : r.error.code
}

// p1 wants to cast a creature during their upkeep (sorcery speed says no).
function asking(players: number, approval: 'auto' | 'vote') {
  const [s, bear] = give(game(players, approval), 'p1', 'Creature')
  const request: Action = { type: 'requestException', player: 'p1', action: { type: 'castSpell', objectId: bear }, reason: 'Efeito de outra carta' }
  return { s, bear, request }
}

describe('rule exceptions — local games approve at once', () => {
  it('applies the blocked action and logs a judge action', () => {
    const { s, bear, request } = asking(2, 'auto')
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: bear })).toBe('ruleBlocked')
    const { state, events } = act(s, request)
    expect(state.objects[bear]!.zone).toBe('stack')
    expect(events[0]).toEqual({ type: 'judgeAction', player: 'p1', actionType: 'castSpell', reason: 'Efeito de outra carta', approvedBy: [] })
  })

  it('a second land with Exploration-like effects', () => {
    let s = game(2, 'auto')
    let a: string, b: string
    ;[s, a] = give(s, 'p1', 'Land')
    ;[s, b] = give(s, 'p1', 'Land')
    while (s.turn.step !== 'main1') s = act(s, { type: 'advanceStep', player: 'p1' }).state
    s = act(s, { type: 'playLand', player: 'p1', objectId: a }).state
    s = act(s, { type: 'requestException', player: 'p1', action: { type: 'playLand', objectId: b }, reason: 'Exploration' }).state
    expect(s.objects[b]!.zone).toBe('battlefield')
    expect(s.players.p1!.landsPlayed).toBe(2)
  })
})

describe('rule exceptions — online games vote', () => {
  it('waits for every other player, reveals the card and freezes the game meanwhile', () => {
    const { s, bear, request } = asking(3, 'vote')
    let state = act(s, request).state
    expect(state.pending).toMatchObject({ kind: 'exception', player: 'p1', approvals: [], card: { name: 'Test Bear' } })
    expect(state.objects[bear]!.zone).toBe('hand')
    expect(errorOf(state, { type: 'draw', player: 'p2', count: 1 })).toBe('pendingException')
    expect(errorOf(state, { type: 'answerException', player: 'p1', approve: true })).toBe('notYourDecision')

    state = act(state, { type: 'answerException', player: 'p2', approve: true }).state
    expect(state.pending).toMatchObject({ approvals: ['p2'] })
    expect(errorOf(state, { type: 'answerException', player: 'p2', approve: true })).toBe('notYourDecision')
    const done = act(state, { type: 'answerException', player: 'p3', approve: true })
    expect(done.state.pending).toBeNull()
    expect(done.state.objects[bear]!.zone).toBe('stack')
    expect(done.events).toContainEqual(expect.objectContaining({ type: 'judgeAction', approvedBy: ['p2', 'p3'] }))
  })

  it('one refusal cancels the request and nothing changes', () => {
    const { s, bear, request } = asking(3, 'vote')
    const state = act(act(s, request).state, { type: 'answerException', player: 'p3', approve: false }).state
    expect(state.pending).toBeNull()
    expect(state.objects[bear]!.zone).toBe('hand')
  })

  it('only who asked can give up; giving up or conceding clears the request', () => {
    const { s, request } = asking(3, 'vote')
    const pending = act(s, request).state
    expect(errorOf(pending, { type: 'cancelException', player: 'p2' })).toBe('notYourDecision')
    expect(act(pending, { type: 'cancelException', player: 'p1' }).state.pending).toBeNull()
    expect(act(pending, { type: 'concede', player: 'p1' }).state.pending).toBeNull()
  })

  it('a solo game in vote mode has nobody to ask and applies at once', () => {
    const { s, bear, request } = asking(1, 'vote')
    expect(act(s, request).state.objects[bear]!.zone).toBe('stack')
  })
})

describe('what is not an exception', () => {
  it('actions the rules already allow, actions that fail for other reasons and nested requests', () => {
    const { s, bear } = asking(2, 'vote')
    expect(errorOf(s, { type: 'requestException', player: 'p1', action: { type: 'draw', count: 1 }, reason: '' })).toBe('noException')
    expect(errorOf(s, { type: 'requestException', player: 'p1', action: { type: 'playLand', objectId: bear }, reason: '' })).toBe('invalidAction')
    expect(errorOf(s, { type: 'requestException', player: 'p2', action: { type: 'castSpell', objectId: bear }, reason: '' })).toBe('unknownObject')
    expect(errorOf(s, { type: 'requestException', player: 'p1', action: { type: 'concede' }, reason: '' })).toBe('noException')
    expect(errorOf(s, { type: 'answerException', player: 'p2', approve: true })).toBe('noException')
    // Another player's hidden card and a made-up id answer the same way: nothing is revealed.
    expect(errorOf(s, { type: 'requestException', player: 'p2', action: { type: 'castSpell', objectId: 'o9999' }, reason: '' })).toBe('unknownObject')
  })
})
