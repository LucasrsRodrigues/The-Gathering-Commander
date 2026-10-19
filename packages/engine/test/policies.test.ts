import { describe, expect, it } from 'vitest'
import { checkPolicies, reduce, type RuleLevel } from '../src'
import { act, keepAll, newGame } from './helpers'

function game(timingRules: RuleLevel) {
  return keepAll(newGame(2, { ruleset: { timingRules } }))
}

describe('rule policies (block / warn / off)', () => {
  it('block rejects moving a card from hand into play, with the reason', () => {
    const s = game('block')
    const card = s.zones.p1!.hand[0]!
    const result = reduce(s, { type: 'moveObject', player: 'p1', objectId: card, to: 'battlefield' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ruleBlocked')
    expect(result.error.findings).toEqual([expect.objectContaining({ area: 'timing', code: 'useCastOrPlay' })])
    expect(result.error.message).toMatch(/Lançar/)
  })

  it('warn lets it through and logs ruleBent', () => {
    const s = game('warn')
    const card = s.zones.p1!.hand[0]!
    const { state, events } = act(s, { type: 'moveObject', player: 'p1', objectId: card, to: 'stack' })
    expect(state.objects[card]!.zone).toBe('stack')
    expect(events).toContainEqual(expect.objectContaining({ type: 'ruleBent', player: 'p1', area: 'timing', code: 'useCastOrPlay' }))
  })

  it('off is the sandbox: no check, no event', () => {
    const s = game('off')
    const card = s.zones.p1!.hand[0]!
    const { events } = act(s, { type: 'moveObject', player: 'p1', objectId: card, to: 'battlefield' })
    expect(events.some((e) => e.type === 'ruleBent')).toBe(false)
    expect(checkPolicies(s, { type: 'moveObject', player: 'p1', objectId: card, to: 'battlefield' })).toEqual([])
  })

  it('manual moves that apply effects stay free even at block', () => {
    let s = game('block')
    const card = s.zones.p1!.hand[0]!
    s = act(s, { type: 'moveObject', player: 'p1', objectId: card, to: 'graveyard' }).state // discard
    s = act(s, { type: 'moveObject', player: 'p1', objectId: card, to: 'battlefield' }).state // reanimate
    const top = s.zones.p1!.library.at(-1)!
    s = act(s, { type: 'moveObject', player: 'p1', objectId: top, to: 'battlefield' }).state // put onto the battlefield
    expect(s.objects[card]!.zone).toBe('battlefield')
    expect(s.objects[top]!.zone).toBe('battlefield')
  })

  it('the commander from the command zone follows the same rule', () => {
    const s = game('block')
    const commander = s.zones.p1!.command[0]!
    const result = reduce(s, { type: 'moveObject', player: 'p1', objectId: commander, to: 'stack' })
    expect(!result.ok && result.error.code).toBe('ruleBlocked')
  })
})
