// The layer system (épico 12, T12.2) against the rules' own situations (CR 613), with test cards written by us.

import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, type Action, type CardRef, type ContinuousEffect, type GameState, type StaticAbility } from '../src'
import { boardOf, charsOf } from '../src/layers'
import { act, keepAll } from './helpers'

function card(name: string, typeLine: string, manaCost: string, statics: StaticAbility[] = [], pt?: [string, string], oracleText = ''): CardRef {
  const rules = deriveCardRules({ name, typeLine, manaCost, oracleText, keywords: [], colorIdentity: [], ...(pt ? { power: pt[0], toughness: pt[1] } : {}) })
  return { name, typeLine, rules: { ...rules, ...(statics.length ? { statics } : {}) } }
}
const fixed = (n: number) => ({ kind: 'fixed' as const, n })
const mine = { types: ['creature' as const], controller: 'you' as const }

const BEAR = card('Bear', 'Creature — Bear', '{1}{G}', [], ['2', '2'])
const TALL = card('Tall', 'Creature — Wall', '{1}{G}', [], ['1', '4'])
const ANTHEM = card('Anthem', 'Enchantment', '{2}{W}', [{ affects: { kind: 'objects', filter: mine }, changes: [{ kind: 'modifyPT', power: fixed(1), toughness: fixed(1) }], text: 'Creatures you control get +1/+1.' }])
const BASE = card('Base', 'Enchantment', '{2}{U}', [{ affects: { kind: 'objects', filter: mine }, changes: [{ kind: 'setPT', power: fixed(1), toughness: fixed(1) }], text: 'Creatures you control have base power and toughness 1/1.' }])
const SWITCH = card('Switch', 'Enchantment', '{2}{U}', [{ affects: { kind: 'objects', filter: { types: ['creature'] } }, changes: [{ kind: 'switchPT' }], text: 'Switch each creature\'s power and toughness.' }])
const FLYERS = card('Flyers', 'Enchantment', '{2}{U}', [{ affects: { kind: 'objects', filter: { types: ['creature'] } }, changes: [{ kind: 'addKeywords', keywords: ['flying'] }], text: 'Creatures have flying.' }])
const MARCH = card('March', 'Enchantment', '{3}{U}', [{
  affects: { kind: 'objects', filter: { types: ['artifact'] } },
  changes: [{ kind: 'addTypes', types: ['creature'] }, { kind: 'setPT', power: { kind: 'manaValue', of: 'affected' }, toughness: { kind: 'manaValue', of: 'affected' } }],
  text: 'Each artifact is an artifact creature with base power and toughness each equal to its mana value.',
}])
const ROCK = card('Rock', 'Artifact', '{3}')
const HUMILITY = card('Humility', 'Enchantment', '{2}{W}{W}', [{
  affects: { kind: 'objects', filter: { types: ['creature'] } },
  changes: [{ kind: 'loseAllAbilities' }, { kind: 'setPT', power: fixed(1), toughness: fixed(1) }],
  text: 'All creatures lose all abilities and have base power and toughness 1/1.',
}])
const OPALESCENCE = card('Opalescence', 'Enchantment', '{2}{W}{W}', [{
  affects: { kind: 'objects', filter: { types: ['enchantment'], other: true } },
  changes: [{ kind: 'addTypes', types: ['creature'] }, { kind: 'setPT', power: { kind: 'manaValue', of: 'affected' }, toughness: { kind: 'manaValue', of: 'affected' } }],
  text: 'Each other enchantment is a creature with base power and toughness each equal to its mana value.',
}])
const BLOOD_MOON = card('Blood Moon', 'Enchantment', '{2}{R}', [{
  affects: { kind: 'objects', filter: { types: ['land'], notSupertypes: ['basic'] } },
  changes: [{ kind: 'setTypes', subtypes: ['Mountain'], landTypes: true }], text: 'Nonbasic lands are Mountains.',
}])
const URBORG = card('Urborg', 'Legendary Land', '', [{
  affects: { kind: 'objects', filter: { types: ['land'] } },
  changes: [{ kind: 'addTypes', subtypes: ['Swamp'], landTypes: true }], text: 'Each land is a Swamp in addition to its other types.',
}])
const FOREST = card('Forest', 'Basic Land — Forest', '')
const GOYF = card('Goyf', 'Creature — Lhurgoyf', '{1}{G}', [{
  cda: true, affects: { kind: 'self' },
  changes: [{ kind: 'setPT', power: { kind: 'count', what: {}, zone: 'hand' }, toughness: { kind: 'count', what: {}, zone: 'hand' } }],
  text: 'Its power and toughness are each equal to the number of cards in your hand.',
}], ['0', '0'])

const ALL = [BEAR, TALL, ANTHEM, BASE, SWITCH, FLYERS, MARCH, ROCK, HUMILITY, OPALESCENCE, BLOOD_MOON, URBORG, FOREST, GOYF]
function game(): GameState {
  const deck = { commanders: [BEAR], cards: [...ALL, ...ALL, ...Array(40).fill(BEAR)] }
  return keepAll(createGame({ seed: 3, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'off', combatRules: 'off' }, players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }] }))
}
// Puts the named cards on the battlefield in this order (so their timestamps follow it). Returns their ids.
function put(s: GameState, owner: string, ...names: string[]): [GameState, string[]] {
  const ids: string[] = []
  for (const name of names) {
    const id = Object.values(s.objects).find((o) => o.owner === owner && o.card.name === name && o.zone !== 'battlefield' && !ids.includes(o.id))!.id
    s = act(s, { type: 'moveObject', player: owner, objectId: id, to: 'battlefield' } as Action).state
    ids.push(id)
  }
  return [s, ids]
}
const pt = (s: GameState, id: string) => { const c = charsOf(s, s.objects[id]!); return [c.power, c.toughness] }

describe('the layer system (épico 12, T12.2, CR 613)', () => {
  it('7b sets before 7c modifies, whatever the timestamps; counters are 7c; 7d switches last', () => {
    let [s, [anthem, bear, base]] = put(game(), 'p1', 'Anthem', 'Bear', 'Base')
    expect(pt(s, bear!)).toEqual([2, 2]) // base 1/1 (7b), then +1/+1 (7c) — the Anthem's earlier timestamp does not matter
    s = act(s, { type: 'addCounter', player: 'p1', objectId: bear!, counter: '+1/+1', delta: 1 } as Action).state
    expect(pt(s, bear!)).toEqual([3, 3])
    let tall: string | undefined
    ;[s, [tall]] = put(s, 'p2', 'Tall') // the opponent's: no Base, no Anthem
    ;[s] = put(s, 'p1', 'Switch')
    expect(pt(s, tall!)).toEqual([4, 1]) // 1/4 switched in 7d
    expect(pt(s, bear!)).toEqual([3, 3]) // 3/3 switched stays 3/3
    void anthem; void base
  })

  it('an anthem follows the board: new creatures get it, and it ends when its source leaves', () => {
    let [s, [anthem, bear]] = put(game(), 'p1', 'Anthem', 'Bear')
    let theirs: string | undefined
    ;[s, [theirs]] = put(s, 'p2', 'Bear')
    expect([pt(s, bear!), pt(s, theirs!)]).toEqual([[3, 3], [2, 2]]) // "you control"
    s = act(s, { type: 'moveObject', player: 'p1', objectId: anthem!, to: 'graveyard' } as Action).state
    expect(pt(s, bear!)).toEqual([2, 2])
  })

  it('layer 2 before 7c: a creature whose control changed gets its new controller\'s anthem', () => {
    let [s, [theirs]] = put(game(), 'p2', 'Bear')
    ;[s] = put(s, 'p1', 'Anthem')
    const steal: ContinuousEffect = { id: 'c1', source: null, controller: 'p1', timestamp: s.timestamp + 1, affects: { kind: 'ids', ids: [theirs!] }, change: { kind: 'control', to: 'sourceController' }, until: { kind: 'endOfTurn' } }
    s = { ...s, effects: [steal], timestamp: s.timestamp + 1 }
    expect(charsOf(s, s.objects[theirs!]!).controller).toBe('p1')
    expect(pt(s, theirs!)).toEqual([3, 3])
  })

  it('layer 4 before 6: an artifact made a creature gets "creatures have flying", even from an earlier effect', () => {
    let [s, [, , rock]] = put(game(), 'p1', 'Flyers', 'March', 'Rock')
    const c = charsOf(s, s.objects[rock!]!)
    expect(c.types).toEqual(['artifact', 'creature'])
    expect(c.keywords).toContain('flying')
    expect([c.power, c.toughness]).toEqual([3, 3]) // its mana value, per object
  })

  it('Humility and Opalescence: in 7b the later timestamp wins, and the abilities lost in 6 still finish applying (613.6)', () => {
    // Humility first: Opalescence (later) sets Humility to its mana value.
    let [s, [humility, opal, bear]] = put(game(), 'p1', 'Humility', 'Opalescence', 'Bear')
    expect(pt(s, humility!)).toEqual([4, 4])
    expect(charsOf(s, s.objects[humility!]!).statics).toEqual([]) // a creature now, it lost its own abilities…
    expect(pt(s, bear!)).toEqual([1, 1]) // …yet its effect still applies (it began in layer 6)
    expect(charsOf(s, s.objects[opal!]!).types).toEqual(['enchantment']) // "each other": not a creature
    // Opalescence first: Humility (later) makes every creature 1/1, itself included.
    let s2: GameState
    let ids: string[]
    ;[s2, ids] = put(game(), 'p1', 'Opalescence', 'Humility', 'Bear')
    expect([pt(s2, ids[1]!), pt(s2, ids[2]!)]).toEqual([[1, 1], [1, 1]])
  })

  it('Blood Moon and Urborg: Urborg depends on Blood Moon (it loses its ability), in either order (613.8)', () => {
    for (const order of [['Urborg', 'Blood Moon', 'Forest'], ['Blood Moon', 'Urborg', 'Forest']]) {
      const [s, ids] = put(game(), 'p1', ...order)
      const urborg = charsOf(s, s.objects[ids[order.indexOf('Urborg')]!]!)
      const forest = charsOf(s, s.objects[ids[order.indexOf('Forest')]!]!)
      expect(urborg.subtypes, order.join(' → ')).toEqual(['Mountain'])
      expect(urborg.manaAbilities).toEqual([{ produces: { kind: 'fixed', mana: { R: 1 } } }])
      expect(forest.subtypes, order.join(' → ')).toEqual(['Forest']) // Urborg's ability is gone: no Swamp
    }
  })

  it('without Blood Moon, Urborg makes every land a Swamp too, with the Swamp\'s mana', () => {
    const [s, [, forest]] = put(game(), 'p1', 'Urborg', 'Forest')
    const c = charsOf(s, s.objects[forest!]!)
    expect(c.subtypes).toEqual(['Forest', 'Swamp'])
    expect(c.manaAbilities.map((a) => a.produces)).toEqual([{ kind: 'fixed', mana: { G: 1 } }, { kind: 'fixed', mana: { B: 1 } }])
  })

  it('layer 1: a copy takes the printed values; counters and anthems on the copy apply on top', () => {
    let [s, [bear, goyf]] = put(game(), 'p1', 'Bear', 'Goyf')
    s = act(s, { type: 'addCounter', player: 'p1', objectId: bear!, counter: '+1/+1', delta: 2 } as Action).state // on the original only
    const copy: ContinuousEffect = { id: 'c1', source: goyf!, controller: 'p1', timestamp: s.timestamp + 1, affects: { kind: 'ids', ids: [goyf!] }, change: { kind: 'copy', of: bear! }, until: { kind: 'whileSourceOnBattlefield' } }
    s = { ...s, effects: [copy], timestamp: s.timestamp + 1 }
    expect(charsOf(s, s.objects[goyf!]!)).toMatchObject({ subtypes: ['Bear'], power: 2, toughness: 2, copyOf: bear })
    ;[s] = put(s, 'p1', 'Anthem')
    expect(pt(s, goyf!)).toEqual([3, 3])
  })

  it('7a: a characteristic-defining ability counts the board as it is, then the rest applies', () => {
    let [s, [goyf]] = put(game(), 'p1', 'Goyf', 'Anthem')
    const hand = s.zones.p1!.hand.length
    expect(pt(s, goyf!)).toEqual([hand + 1, hand + 1])
  })

  it('a set locked on resolution keeps the same objects: one that left and came back is a new object (CR 400.7, 611.2c)', () => {
    let [s, [bear]] = put(game(), 'p1', 'Bear')
    const pump: ContinuousEffect = { id: 'c1', source: null, controller: 'p1', timestamp: s.timestamp + 1, affects: { kind: 'ids', ids: [bear!] }, change: { kind: 'modifyPT', power: fixed(3), toughness: fixed(3) }, until: { kind: 'endOfTurn' } }
    s = { ...s, effects: [pump], timestamp: s.timestamp + 1 }
    expect(pt(s, bear!)).toEqual([5, 5])
    s = act(s, { type: 'moveObject', player: 'p1', objectId: bear!, to: 'hand' } as Action).state
    ;[s] = put(s, 'p1', 'Bear')
    expect(pt(s, bear!)).toEqual([2, 2])
  })

  it('"until end of turn" effects end in the cleanup step (CR 514.2)', () => {
    let [s, [bear]] = put(game(), 'p1', 'Bear')
    const pump: ContinuousEffect = { id: 'c1', source: null, controller: 'p1', timestamp: s.timestamp + 1, affects: { kind: 'ids', ids: [bear!] }, change: { kind: 'modifyPT', power: fixed(3), toughness: fixed(3) }, until: { kind: 'endOfTurn' } }
    s = { ...s, effects: [pump], timestamp: s.timestamp + 1 }
    for (let i = 0; i < 20 && s.turn.number === 1; i++) s = act(s, { type: 'advanceStep', player: s.turn.active } as Action).state
    expect(s.effects).toBeUndefined()
    expect(pt(s, bear!)).toEqual([2, 2])
  })

  it('budget: 100 permanents and 10 anthems in under 2 ms per board', () => {
    let s = game()
    const deck = { commanders: [BEAR], cards: [...Array(10).fill(ANTHEM), ...Array(89).fill(BEAR)] }
    s = keepAll(createGame({ seed: 5, startingPlayer: 'p1', players: ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, name: id, deck })) }))
    const objects = { ...s.objects }
    const battlefield: string[] = []
    for (const p of s.seats) {
      const lib = s.zones[p]!.library
      const anthems = lib.filter((id) => s.objects[id]!.card.name === 'Anthem').slice(0, p === 'p1' || p === 'p2' ? 5 : 0)
      const bears = lib.filter((id) => s.objects[id]!.card.name === 'Bear').slice(0, 25 - anthems.length)
      for (const id of [...anthems, ...bears]) { objects[id] = { ...objects[id]!, zone: 'battlefield' }; battlefield.push(id) }
    }
    s = { ...s, objects, battlefield }
    expect(battlefield).toHaveLength(100)
    boardOf(s)
    // The best of a few batches: the code's cost, not the machine's load (the suite runs files in parallel).
    const batches = Array.from({ length: 5 }, () => {
      const start = performance.now()
      for (let i = 0; i < 10; i++) boardOf({ ...s }) // a new state object each time: no cache hit
      return (performance.now() - start) / 10
    })
    expect(Math.min(...batches)).toBeLessThan(2)
    const someBear = battlefield.find((id) => s.objects[id]!.card.name === 'Bear' && s.objects[id]!.controller === 'p1')!
    expect(pt(s, someBear)).toEqual([7, 7])
  })
})
