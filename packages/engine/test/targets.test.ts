import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, reduce, viewFor, type Action, type CardRef, type CardRules, type GameState, type Target } from '../src'
import { legalTargets, legalTargetsInView } from '../src/effects/targets'
import { act, keepAll } from './helpers'

const rules = (name: string, typeLine: string, cost: string, extra: Partial<CardRules> = {}, pt?: [string, string]): CardRules => ({
  ...deriveCardRules({ name, typeLine, manaCost: cost, oracleText: '', keywords: [], colorIdentity: ['R'], ...(pt ? { power: pt[0], toughness: pt[1] } : {}) }),
  ...extra,
})
const dmg = (n: number) => ({ kind: 'damage' as const, to: 'target' as const, amount: { kind: 'fixed' as const, n } })
const BOLT: CardRef = { name: 'Test Bolt', typeLine: 'Instant', rules: rules('Test Bolt', 'Instant', '{R}', { spell: { text: '~ deals 3 damage to any target.', targets: [{ kind: 'any' }], effects: [dmg(3)] } }) }
const SNIPE: CardRef = {
  name: 'Test Snipe', typeLine: 'Sorcery',
  rules: rules('Test Snipe', 'Sorcery', '{R}', { spell: { text: 'Destroy target creature you don\'t control.', targets: [{ kind: 'object', filter: { types: ['creature'], controller: 'opponent' }, count: 1 }], effects: [{ kind: 'destroy', what: 'target' }] } }),
}
const SPLIT: CardRef = {
  name: 'Test Split', typeLine: 'Sorcery',
  rules: rules('Test Split', 'Sorcery', '{R}', { spell: { text: 'Up to two target creatures…', targets: [{ kind: 'object', filter: { types: ['creature'] }, count: 2, upTo: true }], effects: [dmg(1)] } }),
}
const BEAR: CardRef = { name: 'Test Bear', typeLine: 'Creature — Bear', rules: rules('Test Bear', 'Creature — Bear', '{1}{G}', {}, ['2', '2']) }

function game(): GameState {
  const deck = { commanders: [BEAR], cards: [BOLT, SNIPE, SPLIT, BEAR, BEAR, ...Array(60).fill(BEAR)] }
  return keepAll(createGame({
    seed: 4, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'off', combatRules: 'off' },
    players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }],
  }))
}
const find = (s: GameState, owner: string, name: string, notIn?: string) =>
  Object.values(s.objects).find((o) => o.owner === owner && o.card.name === name && o.zone !== notIn)!.id
function setup() {
  let s = game()
  for (const [owner, name, to] of [['p1', 'Test Bolt', 'hand'], ['p1', 'Test Snipe', 'hand'], ['p1', 'Test Split', 'hand'], ['p1', 'Test Bear', 'battlefield'], ['p2', 'Test Bear', 'battlefield']] as const) {
    s = act(s, { type: 'moveObject', player: owner, objectId: find(s, owner, name, to), to }).state
  }
  const mine = Object.values(s.objects).find((o) => o.owner === 'p1' && o.zone === 'battlefield')!.id
  const theirs = Object.values(s.objects).find((o) => o.owner === 'p2' && o.zone === 'battlefield')!.id
  return { s, mine, theirs, bolt: find(s, 'p1', 'Test Bolt'), snipe: find(s, 'p1', 'Test Snipe'), split: find(s, 'p1', 'Test Split') }
}
const errorOf = (s: GameState, a: Action) => {
  const r = reduce(s, a)
  return r.ok ? 'ok' : r.error.code
}
// Everyone passes in turn order from whoever holds priority, until the top of the stack resolves. Returns the events.
function resolveTop(s: GameState): { state: GameState; events: import('../src').GameEvent[] } {
  let state = s
  const events: import('../src').GameEvent[] = []
  const depth = s.stack.length
  for (let i = 0; i < 8 && state.stack.length >= depth && state.priority; i++) {
    const r = act(state, { type: 'passPriority', player: state.priority.player })
    state = r.state
    events.push(...r.events)
  }
  return { state, events }
}

describe('targets (épico 11, T11.5)', () => {
  it('lists the legal targets, from the state and from a player view alike', () => {
    const { s, mine, theirs } = setup()
    const any = legalTargets(s, { kind: 'any' }, { controller: 'p1' })
    expect(any).toEqual(expect.arrayContaining([{ object: mine }, { object: theirs }, { player: 'p1' }, { player: 'p2' }]))
    expect(legalTargets(s, SNIPE.rules!.spell!.targets![0]!, { controller: 'p1' })).toEqual([{ object: theirs }])
    expect(legalTargetsInView(viewFor(s, 'p1'), SNIPE.rules!.spell!.targets![0]!, { controller: 'p1' })).toEqual([{ object: theirs }])
    expect(legalTargets(s, { kind: 'player', who: 'opponent' }, { controller: 'p1' })).toEqual([{ player: 'p2' }])
  })

  it('a spell is cast only with targets that fit its specs; a refused cast spends nothing', () => {
    const { s, mine, theirs, bolt, snipe, split } = setup()
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: snipe, targets: [{ object: mine }] })).toBe('invalidTarget') // you control it
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: bolt, targets: [] })).toBe('invalidTarget')
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: bolt, targets: [{ player: 'p2' }, { player: 'p1' }] })).toBe('invalidTarget')
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: split, targets: [{ object: mine }, { object: mine }] })).toBe('invalidTarget') // twice
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: bolt, targets: [{ object: 'nope' }] })).toBe('invalidTarget')
    const forestless = reduce(s, { type: 'castSpell', player: 'p1', objectId: snipe, targets: [{ object: mine }] })
    expect(forestless.ok).toBe(false) // atomic: nothing moved, nothing paid
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: split, targets: [] })).toBe('ok') // "up to two": zero is fine
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: split, targets: [{ object: mine }, { object: theirs }] })).toBe('ok')
  })

  it('the stack item keeps the ability and the targets; without targets it resolves by hand', () => {
    const { s, theirs, bolt } = setup()
    const withTarget = act(s, { type: 'castSpell', player: 'p1', objectId: bolt, targets: [{ object: theirs }] }).state
    expect(withTarget.stack.at(-1)).toMatchObject({ ability: { from: 'spell', index: 0 }, targets: [{ object: theirs }] })
    expect(withTarget.stack.at(-1)!.manual).toBeUndefined()
    const without = act(s, { type: 'castSpell', player: 'p1', objectId: bolt }).state
    expect(without.stack.at(-1)).toMatchObject({ manual: true })
  })

  it('a spell whose target left before it resolves is countered on resolution (CR 608.2b)', () => {
    const { s, theirs, bolt } = setup()
    let st = act(s, { type: 'castSpell', player: 'p1', objectId: bolt, targets: [{ object: theirs }] }).state
    st = act(st, { type: 'moveObject', player: 'p2', objectId: theirs, to: 'hand' }).state // bounced in response
    const { state: after, events } = resolveTop(st)
    expect(after.objects[bolt]!.zone).toBe('graveyard')
    expect(after.stack).toEqual([])
    expect(events.some((e) => e.type === 'stackItemFizzled')).toBe(true)
    expect(events.some((e) => e.type === 'stackItemResolved')).toBe(false)
  })

  it('property: with several targets, the illegal ones are dropped and the spell still resolves', () => {
    const { s, mine, theirs, split } = setup()
    for (const gone of [mine, theirs]) {
      let st = act(s, { type: 'castSpell', player: 'p1', objectId: split, targets: [{ object: mine }, { object: theirs }] }).state
      st = act(st, { type: 'moveObject', player: st.objects[gone]!.owner, objectId: gone, to: 'graveyard' }).state
      const { events } = resolveTop(st)
      expect(events.some((e) => e.type === 'stackItemFizzled')).toBe(false)
      const resolved = events.find((e) => e.type === 'stackItemResolved') as { item: { targets?: Target[] } } | undefined
      expect(resolved?.item.targets).toEqual([{ object: gone === mine ? theirs : mine }])
    }
  })
})
