import type { CardRules } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { manaInfoOf } from './manaInfo'
import { addCard, cardsMatching, deckStats, newDeck, toggleCategory, type CardInfo } from './model'

const cost = (colored: Record<string, number>, extra: Partial<CardRules['cost'] & object> = {}) => ({ generic: 0, colored, hybrid: [], twoBrid: [], phyrexian: [], x: 0, ...extra })
const rules = (r: Partial<CardRules>): CardRules => ({
  types: [], supertypes: [], subtypes: [], cost: null, power: null, toughness: null, loyalty: null, keywords: [], manaAbilities: [], colorIdentity: [], ...r,
})

// A deck checked by hand: Krenko (2R… = {2}{R}{R}), Lightning Bolt ({R}), Boros Charm ({R}{W}), Kitchen hybrid ({R/W}),
// Sol Ring ({1}: adds {C}{C}), Arcane Signet (any color of the commander), 10 Mountain, 1 Sacred Foundry (R or W).
const info = new Map<string, CardInfo>([
  ['krenko', { typeLine: 'Legendary Creature — Goblin', manaValue: 4, colorIdentity: ['R'], mana: manaInfoOf(rules({ cost: cost({ R: 2 }, { generic: 2 }) }), '', '') }],
  ['bolt', { typeLine: 'Instant', manaValue: 1, colorIdentity: ['R'], mana: manaInfoOf(rules({ cost: cost({ R: 1 }) }), '', '') }],
  ['charm', { typeLine: 'Instant', manaValue: 2, colorIdentity: ['R', 'W'], mana: manaInfoOf(rules({ cost: cost({ R: 1, W: 1 }) }), '', '') }],
  ['hybrid', { typeLine: 'Creature — Soldier', manaValue: 1, colorIdentity: ['R', 'W'], mana: manaInfoOf(rules({ cost: cost({}, { hybrid: [['R', 'W']] }) }), '', '') }],
  ['sol', { typeLine: 'Artifact', manaValue: 1, colorIdentity: [], mana: manaInfoOf(rules({ cost: cost({}, { generic: 1 }), manaAbilities: [{ produces: { kind: 'fixed', mana: { C: 2 } } }] }), '', '') }],
  ['signet', { typeLine: 'Artifact', manaValue: 2, colorIdentity: [], mana: manaInfoOf(rules({ cost: cost({}, { generic: 2 }), manaAbilities: [{ produces: { kind: 'commanderIdentity' } }] }), '', '') }],
  ['mountain', { typeLine: 'Basic Land — Mountain', manaValue: 0, colorIdentity: ['R'], mana: manaInfoOf(undefined, '({T}: Add {R}.)', 'Basic Land — Mountain') }],
  ['foundry', { typeLine: 'Land — Mountain Plains', manaValue: 0, colorIdentity: ['R', 'W'], mana: manaInfoOf(undefined, '', 'Land — Mountain Plains') }],
  ['big', { typeLine: 'Creature — Dragon', manaValue: 9, colorIdentity: ['R'], mana: manaInfoOf(undefined, '', '') }],
])

function sample() {
  let d = addCard(newDeck('d', 'D', 0), { oracleId: 'krenko', name: 'Krenko' }, 'commanders', 0)
  for (const id of ['bolt', 'charm', 'hybrid', 'sol', 'signet', 'foundry', 'big']) d = addCard(d, { oracleId: id, name: id }, 'cards', 0)
  d = addCard(d, { oracleId: 'mountain', name: 'mountain' }, 'cards', 0, 10)
  d = addCard(d, { oracleId: 'bolt', name: 'bolt' }, 'maybe', 0, 4) // never counted
  return toggleCategory(toggleCategory(d, 'cards', ['bolt', 'charm'], 'Remoção', true, 1), 'cards', ['sol', 'signet'], 'Ramp', true, 1)
}

describe('deck stats (épico 10, T10.8)', () => {
  it('match a deck counted by hand, ignoring the Talvez list', () => {
    const s = deckStats(sample(), info, ['R'])
    expect(s.total).toBe(18)
    expect(s.lands).toBe(11)
    expect(s.curve).toEqual([0, 3, 2, 0, 1, 0, 0, 1]) // bolt, hybrid, sol | charm, signet | krenko | big (7+)
    expect(s.averageManaValue).toBe(2.86) // (4+1+2+1+1+2+9)/7
    expect(s.averageWithLands).toBe(1.11) // 20/18
    expect(s.pips).toEqual({ W: 2, U: 0, B: 0, R: 5, G: 0 }) // krenko 2, bolt 1, charm 1+1W, hybrid 1+1W
    expect(s.sources).toMatchObject({ R: 12, W: 1, C: 1 }) // 10 Mountain + Foundry + Signet (commander is red) | Foundry | Sol Ring
    expect(s.types).toMatchObject({ creature: 3, instant: 2, artifact: 2, land: 11 })
    expect(s.categories).toEqual([{ name: 'Ramp', count: 2 }, { name: 'Remoção', count: 2 }]) // no order set: alphabetical
  })

  it('"any color" sources count for every color of the commander', () => {
    expect(deckStats(sample(), info, ['R', 'W']).sources.W).toBe(2) // Foundry + Signet
  })

  it('a clicked number highlights exactly the cards it counts', () => {
    const d = sample()
    expect(cardsMatching(d, info, { kind: 'mv', mv: 1 }).sort()).toEqual(['bolt', 'hybrid', 'sol'])
    expect(cardsMatching(d, info, { kind: 'mv', mv: 7 })).toEqual(['big'])
    expect(cardsMatching(d, info, { kind: 'pip', color: 'W' }).sort()).toEqual(['charm', 'hybrid'])
    expect(cardsMatching(d, info, { kind: 'source', color: 'W' }, ['R']).sort()).toEqual(['foundry'])
    expect(cardsMatching(d, info, { kind: 'type', group: 'land' }).sort()).toEqual(['foundry', 'mountain'])
    expect(cardsMatching(d, info, { kind: 'category', name: 'ramp' }).sort()).toEqual(['signet', 'sol'])
  })

  it('reads sources from the Oracle text when the catalog has no rules', () => {
    expect(manaInfoOf(undefined, '{T}: Add {W} or {U}.', 'Land')).toEqual({ pips: {}, sources: ['W', 'U'], anyColor: false })
    expect(manaInfoOf(undefined, '{T}: Add one mana of any color.', 'Artifact').anyColor).toBe(true)
  })
})
