import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, replay, type Action, type CardRef, type GameEvent, type GameState, type OracleFacts, type Ruleset } from '../src'
import { act, expectError, keepAll } from './helpers'

const ALL: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'activated.json'), 'utf8'))
const facts = (name: string) => ALL.find((f) => f.name === name)!
const card = (name: string): CardRef => ({ name, typeLine: facts(name).typeLine, rules: deriveCardRules(facts(name)) })
const custom = (name: string, typeLine: string, oracleText: string, pt?: [string, string]): CardRef =>
  ({ name, typeLine, rules: deriveCardRules({ name, typeLine, manaCost: '{1}', oracleText, keywords: [], colorIdentity: [], ...(pt ? { power: pt[0], toughness: pt[1] } : {}) }) })

describe('activated abilities: reading the real Oracle (épico 11, T11.10)', () => {
  it('costs and effects the engine knows are automated', () => {
    for (const name of ['Mind Stone', "Commander's Sphere", 'Goblin Bombardment', 'Mogg Fanatic', 'Shivan Dragon', 'Bloodthrone Vampire', 'Seal of Fire', 'Prodigal Sorcerer']) {
      expect(card(name).rules!.coverage, name).toBe('automated')
    }
    expect(card('Mind Stone').rules!.activated).toEqual([{
      text: '{1}, {T}, Sacrifice this artifact: Draw a card.',
      cost: { mana: expect.objectContaining({ generic: 1 }), tap: true, sacrifice: 'self' },
      effects: [{ kind: 'draw', who: 'you', amount: { kind: 'fixed', n: 1 } }],
    }])
    expect(card('Goblin Bombardment').rules!.activated![0]).toMatchObject({ cost: { sacrifice: { types: ['creature'] } }, targets: [{ kind: 'any' }] })
    expect(card('Shivan Dragon').rules!.activated![0]).toMatchObject({ effects: [{ kind: 'pump', what: 'self', power: { n: 1 }, toughness: { n: 0 } }] })
  })

  it('other lines of the card stay manual (partial); searches and scry stay manual', () => {
    expect(card('Carrion Feeder').rules).toMatchObject({ coverage: 'partial', activated: [{ effects: [{ kind: 'counters', what: 'self' }] }] })
    expect(card('Walking Ballista').rules).toMatchObject({ coverage: 'partial', activated: [{ cost: { mana: { generic: 4 } } }] })
    for (const name of ["Wayfarer's Bauble", 'Viscera Seer', "Ashnod's Altar"]) expect(card(name).rules!.activated, name).toBeUndefined()
    expect(custom('Test Sage', 'Creature — Human', '{1}: Draw a card. Activate only as a sorcery.', ['1', '1']).rules!.activated![0]!.sorcerySpeed).toBe(true)
    expect(custom('Test Limit', 'Creature — Human', '{1}: Draw a card. Activate only once each turn.', ['1', '1']).rules!.activated).toBeUndefined()
  })
})

const BEAR: CardRef = custom('Test Bear', 'Creature — Bear', '', ['2', '2'])
const FOREST: CardRef = { name: 'Forest', typeLine: 'Basic Land — Forest', rules: deriveCardRules({ name: 'Forest', typeLine: 'Basic Land — Forest', manaCost: '', oracleText: '({T}: Add {G}.)', keywords: [], colorIdentity: ['G'] }) }
const SAGE = custom('Test Sage', 'Creature — Human', '{1}: Draw a card. Activate only as a sorcery.', ['1', '1'])
const LOOTER = custom('Test Looter', 'Creature — Human', 'Discard a card: This creature gets +1/+1 until end of turn.', ['1', '1'])
const PACT = custom('Test Pact', 'Enchantment', 'Pay 2 life: Draw a card.')
const CARDS = ['Mind Stone', 'Goblin Bombardment', 'Mogg Fanatic', 'Shivan Dragon', 'Prodigal Sorcerer']
function game(): GameState {
  const deck = { commanders: [BEAR], cards: [...CARDS.map(card), SAGE, LOOTER, PACT, FOREST, ...Array(60).fill(BEAR)] }
  return keepAll(createGame({
    seed: 8, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'off', combatRules: 'block' },
    players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }],
  }))
}
type Run = { state: GameState; events: GameEvent[]; actions: Action[] }
const run = (s: GameState): Run => ({ state: s, events: [], actions: [] })
function step(r: Run, action: Action): Run {
  const out = act(r.state, action)
  return { state: out.state, events: [...r.events, ...out.events], actions: [...r.actions, action] }
}
const find = (s: GameState, owner: string, name: string, notIn?: string) =>
  Object.values(s.objects).find((o) => o.owner === owner && o.card.name === name && o.zone !== notIn)!.id
function put(r: Run, owner: string, name: string, to: 'hand' | 'battlefield'): [Run, string] {
  const id = find(r.state, owner, name, to)
  return [step(r, { type: 'moveObject', player: owner, objectId: id, to }), id]
}
function resolveTo(r: Run, depth: number): Run {
  let out = r
  for (let i = 0; i < 12 && out.state.stack.length > depth && out.state.priority && !out.state.pending; i++) {
    out = step(out, { type: 'passPriority', player: out.state.priority.player })
  }
  return out
}
// The same game with some rules switched on (the test sets the table up with them off).
const withRules = (r: Run, rules: Partial<Ruleset>): Run => ({ ...r, state: { ...r.state, ruleset: { ...r.state.ruleset, ...rules } } })
const life = (s: GameState, p: string) => s.players[p]!.life
const hand = (s: GameState, p: string) => s.zones[p]!.hand.length
const start = () => run(game())

describe('activating in play', () => {
  it('Prodigal Sorcerer: {T} taps it, the ability goes on the stack with its target and resolves', () => {
    let [r, sorcerer] = put(start(), 'p1', 'Prodigal Sorcerer', 'battlefield')
    r = step(r, { type: 'activateAbility', player: 'p1', objectId: sorcerer, index: 0, targets: [{ player: 'p2' }] })
    expect(r.state.objects[sorcerer]!.tapped).toBe(true)
    expect(r.state.stack).toMatchObject([{ kind: 'ability', sourceId: sorcerer, ability: { from: 'activated', index: 0 }, targets: [{ player: 'p2' }] }])
    expectError(r.state, { type: 'activateAbility', player: 'p1', objectId: sorcerer, index: 0, targets: [{ player: 'p2' }] }, 'invalidAction') // already tapped
    r = resolveTo(r, 0)
    expect(life(r.state, 'p2')).toBe(39)
  })

  it('with the rules on: summoning sickness for {T}, sorcery speed and priority', () => {
    let [r, sorcerer] = put(start(), 'p1', 'Prodigal Sorcerer', 'battlefield')
    let sage: string
    ;[r, sage] = put(r, 'p1', 'Test Sage', 'battlefield')
    const on = withRules(r, { timingRules: 'block' })
    expectError(on.state, { type: 'activateAbility', player: 'p1', objectId: sorcerer, index: 0, targets: [{ player: 'p2' }] }, 'ruleBlocked')
    const sorcery = { ...on.state, turn: { ...on.state.turn, step: 'upkeep' as const } }
    expectError(sorcery, { type: 'activateAbility', player: 'p1', objectId: sage, index: 0 }, 'ruleBlocked')
    const theirs = { ...on.state, priority: { player: 'p2', passed: [] } }
    expectError(theirs, { type: 'activateAbility', player: 'p1', objectId: sage, index: 0 }, 'ruleBlocked')
    expectError(r.state, { type: 'activateAbility', player: 'p2', objectId: sorcerer, index: 0, targets: [{ player: 'p1' }] }, 'notAllowed') // not theirs
  })

  it('Mind Stone: pays {1} with a Forest tapped first, taps and sacrifices itself, then draws', () => {
    let [r, stone] = put(start(), 'p1', 'Mind Stone', 'battlefield')
    let forest: string
    ;[r, forest] = put(r, 'p1', 'Forest', 'battlefield')
    r = withRules(r, { manaRules: 'block' })
    expectError(r.state, { type: 'activateAbility', player: 'p1', objectId: stone, index: 0 }, 'ruleBlocked') // no mana
    expectError(r.state, { type: 'activateAbility', player: 'p1', objectId: stone, index: 0, payWith: [{ objectId: stone, abilityIndex: 0 }] }, 'invalidAction')
    const before = hand(r.state, 'p1')
    r = step(r, { type: 'activateAbility', player: 'p1', objectId: stone, index: 0, payWith: [{ objectId: forest, abilityIndex: 0 }] })
    expect(r.state.objects[forest]!.tapped).toBe(true)
    expect(r.state.objects[stone]!.zone).toBe('graveyard')
    expect(r.state.players.p1!.manaPool.G).toBe(0)
    expect(r.state.stack[0]!.snapshot?.text).toBe('{1}, {T}, Sacrifice this artifact: Draw a card.')
    r = resolveTo(r, 0)
    expect(hand(r.state, 'p1')).toBe(before + 1)
  })

  it('Goblin Bombardment: the creature to sacrifice is chosen, and only a creature I control fits', () => {
    let [r, bombardment] = put(start(), 'p1', 'Goblin Bombardment', 'battlefield')
    let bear: string, theirs: string
    ;[r, bear] = put(r, 'p1', 'Test Bear', 'battlefield')
    ;[r, theirs] = put(r, 'p2', 'Test Bear', 'battlefield')
    const go = (sacrifice?: string[]): Action => ({ type: 'activateAbility', player: 'p1', objectId: bombardment, index: 0, targets: [{ player: 'p2' }], ...(sacrifice ? { sacrifice } : {}) })
    expectError(r.state, go(), 'invalidAction')
    expectError(r.state, go([bombardment]), 'invalidAction')
    expectError(r.state, go([theirs]), 'invalidAction')
    r = resolveTo(step(r, go([bear])), 0)
    expect(r.state.objects[bear]!.zone).toBe('graveyard')
    expect(life(r.state, 'p2')).toBe(39)
  })

  it('Mogg Fanatic sacrifices itself and still deals its damage; Shivan Dragon pumps itself', () => {
    let [r, fanatic] = put(start(), 'p1', 'Mogg Fanatic', 'battlefield')
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: fanatic, index: 0, targets: [{ player: 'p2' }] }), 0)
    expect(r.state.objects[fanatic]!.zone).toBe('graveyard')
    expect(life(r.state, 'p2')).toBe(39)
    let dragon: string
    ;[r, dragon] = put(r, 'p1', 'Shivan Dragon', 'battlefield')
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: dragon, index: 0 }), 0)
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: dragon, index: 0 }), 0)
    expect(r.state.objects[dragon]!.ptMods).toEqual([{ power: 1, toughness: 0 }, { power: 1, toughness: 0 }])
  })

  it('discarding and paying life as costs', () => {
    let [r, looter] = put(start(), 'p1', 'Test Looter', 'battlefield')
    let pact: string
    ;[r, pact] = put(r, 'p1', 'Test Pact', 'battlefield')
    const card = r.state.zones.p1!.hand[0]!
    expectError(r.state, { type: 'activateAbility', player: 'p1', objectId: looter, index: 0 }, 'invalidAction')
    expectError(r.state, { type: 'activateAbility', player: 'p1', objectId: looter, index: 0, discard: [pact] }, 'invalidAction') // not in hand
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: looter, index: 0, discard: [card] }), 0)
    expect(r.state.objects[card]!.zone).toBe('graveyard')
    expect(r.state.objects[looter]!.ptMods).toEqual([{ power: 1, toughness: 1 }])
    const before = hand(r.state, 'p1')
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: pact, index: 0 }), 0)
    expect([life(r.state, 'p1'), hand(r.state, 'p1')]).toEqual([38, before + 1])
    const poor = { ...r.state, players: { ...r.state.players, p1: { ...r.state.players.p1!, life: 1 } } }
    expectError(poor, { type: 'activateAbility', player: 'p1', objectId: pact, index: 0 }, 'invalidAction') // CR 119.4
  })

  it('without targets it goes on the stack to be done by hand; replays to the same state', () => {
    const begin = start()
    let [r, sorcerer] = put(begin, 'p1', 'Prodigal Sorcerer', 'battlefield')
    r = step(r, { type: 'activateAbility', player: 'p1', objectId: sorcerer, index: 0 })
    expect(r.state.stack[0]!.manual).toBe(true)
    r = resolveTo(r, 0)
    expect(life(r.state, 'p2')).toBe(40)
    const again = replay(begin.state, r.actions)
    expect(again.ok && again.state).toEqual(r.state)
  })
})
