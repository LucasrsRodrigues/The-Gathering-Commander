import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, migrateState, type CardRef, type CardRules, type GameState } from '../src'
import { evalValue, matchesFilter } from '../src/effects/value'
import { act, keepAll } from './helpers'

// Cards built by hand: the reader comes in T11.2+; here the model alone is under test.
const base = (name: string, typeLine: string, pt: [string, string] | null = null): CardRules => deriveCardRules({
  name, typeLine, manaCost: '{G}', oracleText: '', keywords: [], colorIdentity: ['G'], ...(pt ? { power: pt[0], toughness: pt[1] } : {}),
})
const elf = (name: string, extra: Partial<CardRules> = {}, pt: [string, string] = ['1', '1']): CardRef =>
  ({ name, typeLine: 'Creature — Elf Druid', rules: { ...base(name, 'Creature — Elf Druid', pt), ...extra } })

const MARWYN = elf('Nurturer Elf', {
  manaAbilities: [{ produces: { kind: 'dynamic', color: 'G', amount: { kind: 'power', of: 'self' } } }],
})
const PRIEST = elf('Counting Elf', {
  manaAbilities: [{ produces: { kind: 'dynamic', color: 'G', amount: { kind: 'count', what: { subtypes: ['elf'] }, zone: 'battlefield' } } }],
})
const AUTOMATED = elf('Model Elf', {
  coverage: 'partial', manualText: ['Something the reader does not know.'],
  spell: undefined,
  etb: [{ text: 'When ~ enters, draw a card.', effects: [{ kind: 'draw', who: 'you', amount: { kind: 'fixed', n: 1 } }] }],
  activated: [{
    text: '{T}: You gain 1 life for each Elf on the battlefield.', cost: { tap: true },
    effects: [{ kind: 'gainLife', who: 'you', amount: { kind: 'count', what: { subtypes: ['Elf'] }, zone: 'battlefield' } }],
  }],
})
const FOREST: CardRef = { name: 'Forest', typeLine: 'Basic Land — Forest', rules: base('Forest', 'Basic Land — Forest') }

function game(): GameState {
  const deck = { commanders: [elf('Leader Elf', {}, ['2', '2'])], cards: [MARWYN, PRIEST, AUTOMATED, ...Array(60).fill(FOREST)] }
  return keepAll(createGame({
    seed: 3, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'off', combatRules: 'off' },
    players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }],
  }))
}
function put(state: GameState, name: string, player = 'p1'): [GameState, string] {
  const id = Object.values(state.objects).find((o) => o.owner === player && o.card.name === name && o.zone !== 'battlefield')!.id
  return [act(state, { type: 'moveObject', player, objectId: id, to: 'battlefield' }).state, id]
}
const pool = (s: GameState) => Object.fromEntries(Object.entries(s.players.p1!.manaPool).filter(([, n]) => n))

describe('effect model (épico 11, T11.1)', () => {
  it('values: fixed, X, power of the source with counters, counters, counts', () => {
    let [s, marwyn] = put(game(), 'Nurturer Elf')
    ;[s] = put(s, 'Counting Elf')
    s = act(s, { type: 'addCounter', player: 'p1', objectId: marwyn, counter: '+1/+1', delta: 2 }).state
    const ctx = { controller: 'p1', sourceId: marwyn, x: 5 }
    expect(evalValue(s, ctx, { kind: 'fixed', n: 3 })).toBe(3)
    expect(evalValue(s, ctx, { kind: 'x' })).toBe(5)
    expect(evalValue(s, ctx, { kind: 'power', of: 'self' })).toBe(3)
    expect(evalValue(s, ctx, { kind: 'counters', counter: '+1/+1', of: 'self' })).toBe(2)
    expect(evalValue(s, ctx, { kind: 'count', what: { subtypes: ['Elf'] }, zone: 'battlefield' })).toBe(2)
    expect(evalValue(s, ctx, { kind: 'count', what: { subtypes: ['Elf'], other: true }, zone: 'battlefield' })).toBe(1)
    expect(evalValue(s, ctx, { kind: 'count', what: { types: ['land'] }, zone: 'hand' })).toBeGreaterThan(0)
  })

  it('filters narrow by type, subtype, controller, tapped and token', () => {
    let [s, mine] = put(game(), 'Nurturer Elf')
    let theirs: string
    ;[s, theirs] = put(s, 'Nurturer Elf', 'p2')
    const me = { controller: 'p1', sourceId: mine }
    const obj = (id: string) => s.objects[id]!
    expect(matchesFilter(s, obj(mine), { types: ['creature'], subtypes: ['ELF'] }, me)).toBe(true)
    expect(matchesFilter(s, obj(mine), { notTypes: ['creature'] }, me)).toBe(false)
    expect(matchesFilter(s, obj(theirs), { controller: 'opponent' }, me)).toBe(true)
    expect(matchesFilter(s, obj(theirs), { controller: 'you' }, me)).toBe(false)
    expect(matchesFilter(s, obj(mine), { other: true }, me)).toBe(false)
    expect(matchesFilter(s, obj(mine), { tapped: true }, me)).toBe(false)
    expect(matchesFilter(s, obj(mine), { token: false }, me)).toBe(true)
  })

  it('dynamic mana: equal to the source power, and one per Elf', () => {
    let [s, marwyn] = put(game(), 'Nurturer Elf')
    let priest: string
    ;[s, priest] = put(s, 'Counting Elf')
    s = act(s, { type: 'addCounter', player: 'p1', objectId: marwyn, counter: '+1/+1', delta: 3 }).state
    s = act(s, { type: 'activateMana', player: 'p1', objectId: marwyn, abilityIndex: 0 }).state
    expect(pool(s)).toEqual({ G: 4 })
    s = act(s, { type: 'activateMana', player: 'p1', objectId: priest, abilityIndex: 0 }).state
    expect(pool(s)).toEqual({ G: 6 }) // two Elves on the battlefield
  })

  it('fitness: the state stays serializable with the new rules on cards', () => {
    const s = game()
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
    const model = Object.values(s.objects).find((o) => o.card.name === 'Model Elf')!.card.rules!
    expect(model.etb?.[0]?.effects[0]).toEqual({ kind: 'draw', who: 'you', amount: { kind: 'fixed', n: 1 } })
    expect(model.coverage).toBe('partial')
  })

  it('old states and cards without the new rules work as before', () => {
    const s = game()
    expect(migrateState(JSON.parse(JSON.stringify(s)))).toEqual(s)
    const [after, forest] = put(s, 'Forest')
    expect(pool(act(after, { type: 'activateMana', player: 'p1', objectId: forest, abilityIndex: 0 }).state)).toEqual({ G: 1 })
    expect(FOREST.rules!.coverage).toBe('automated') // a basic land: the engine already does all it says
  })
})
