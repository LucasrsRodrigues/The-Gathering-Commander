import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, planPayment, planPaymentFromView, viewFor, type CardRef, type GameState, type OracleFacts } from '../src'
import { act, keepAll } from './helpers'

const FIXTURE: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'oracle.json'), 'utf8'))
const facts = (name: string) => FIXTURE.find((f) => f.name === name)!
const card = (name: string): CardRef => ({ name, typeLine: facts(name).typeLine, rules: deriveCardRules(facts(name)) })
const giant: CardRef = { name: 'Big Green', typeLine: 'Creature — Giant', rules: deriveCardRules({ name: 'Big Green', typeLine: 'Creature — Giant', manaCost: '{G}{G}{G}{G}', oracleText: '', keywords: [], colorIdentity: ['G'], power: '4', toughness: '4' }) }

describe('variable mana (épico 11, T11.4) — reading the real Oracle', () => {
  it('reads "an amount of {G} equal to its power" and "for each X on the battlefield / you control"', () => {
    expect(card('Marwyn, the Nurturer').rules!.manaAbilities).toEqual([{ produces: { kind: 'dynamic', color: 'G', amount: { kind: 'power', of: 'self' } } }])
    expect(card('Priest of Titania').rules!.manaAbilities[0]!.produces).toEqual({ kind: 'dynamic', color: 'G', amount: { kind: 'count', what: { subtypes: ['Elf'] }, zone: 'battlefield' } })
    expect(card('Elvish Archdruid').rules!.manaAbilities[0]!.produces).toMatchObject({ amount: { what: { subtypes: ['Elf'], controller: 'you' } } })
    expect(card("Gaea's Cradle").rules!.manaAbilities[0]!.produces).toMatchObject({ amount: { what: { types: ['creature'], controller: 'you' } } })
    expect(card('Cabal Coffers').rules!.manaAbilities[0]).toMatchObject({ extraCost: { generic: 2 }, produces: { color: 'B', amount: { what: { subtypes: ['Swamp'] } } } })
  })

  it('the mana lines no longer count as unrecognized: Priest and Cradle are automated', () => {
    expect(card('Priest of Titania').rules).toMatchObject({ coverage: 'automated' })
    expect(card('Priest of Titania').rules!.hasUnrecognizedMana).toBeUndefined()
    expect(card("Gaea's Cradle").rules!.coverage).toBe('automated')
    expect(card('Marwyn, the Nurturer').rules).toMatchObject({ coverage: 'partial', manualText: ['Whenever another Elf you control enters, put a +1/+1 counter on Marwyn.'] })
    expect(card('Elvish Archdruid').rules!.manualText).toEqual(['Other Elf creatures you control get +1/+1.']) // anthem: wave 3
  })
})

function game(manaRules: 'block' | 'off' = 'off'): GameState {
  const names = ['Marwyn, the Nurturer', 'Priest of Titania', 'Elvish Archdruid', "Gaea's Cradle", 'Llanowar Elves']
  const deck = { commanders: [card('Marwyn, the Nurturer')], cards: [...names.slice(1).map(card), giant, ...Array(60).fill(card('Forest'))] }
  return keepAll(createGame({
    seed: 5, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules, combatRules: 'off' },
    players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }],
  }))
}
function put(state: GameState, name: string, player = 'p1'): [GameState, string] {
  const id = Object.values(state.objects).find((o) => o.owner === player && o.card.name === name && o.zone !== 'battlefield')!.id
  return [act(state, { type: 'moveObject', player, objectId: id, to: 'battlefield' }).state, id]
}
const pool = (s: GameState, p = 'p1') => Object.fromEntries(Object.entries(s.players[p]!.manaPool).filter(([, n]) => n))

describe('variable mana in play', () => {
  it('Marwyn adds as much as her power, counters included', () => {
    let [s, marwyn] = put(game(), 'Marwyn, the Nurturer')
    s = act(s, { type: 'addCounter', player: 'p1', objectId: marwyn, counter: '+1/+1', delta: 2 }).state
    expect(pool(act(s, { type: 'activateMana', player: 'p1', objectId: marwyn, abilityIndex: 0 }).state)).toEqual({ G: 3 })
  })

  it('Priest counts every Elf on the battlefield; Archdruid only yours', () => {
    let [s, priest] = put(game(), 'Priest of Titania')
    let archdruid: string
    ;[s, archdruid] = put(s, 'Elvish Archdruid')
    ;[s] = put(s, 'Llanowar Elves', 'p2')
    expect(pool(act(s, { type: 'activateMana', player: 'p1', objectId: priest, abilityIndex: 0 }).state)).toEqual({ G: 3 })
    expect(pool(act(s, { type: 'activateMana', player: 'p1', objectId: archdruid, abilityIndex: 0 }).state)).toEqual({ G: 2 })
  })

  it('a tapped-out Elf with power 0 adds nothing (no negative mana)', () => {
    let [s, marwyn] = put(game(), 'Marwyn, the Nurturer')
    s = act(s, { type: 'addCounter', player: 'p1', objectId: marwyn, counter: '-1/-1', delta: 3 }).state
    expect(pool(act(s, { type: 'activateMana', player: 'p1', objectId: marwyn, abilityIndex: 0 }).state)).toEqual({})
  })

  it('the automatic payment uses the amount right now, from the state and from the player view', () => {
    let s = game('block')
    let marwyn: string
    ;[s, marwyn] = put(s, 'Marwyn, the Nurturer')
    s = act(s, { type: 'addCounter', player: 'p1', objectId: marwyn, counter: '+1/+1', delta: 3 }).state // power 4
    // summoning sickness: wait a turn cycle
    while (s.turn.active === 'p1') s = act(s, { type: 'advanceStep', player: s.turn.active }).state
    while (s.turn.active !== 'p1') s = act(s, { type: 'advanceStep', player: s.turn.active }).state
    const big = Object.values(s.objects).find((o) => o.owner === 'p1' && o.card.name === 'Big Green')!.id
    s = act(s, { type: 'moveObject', player: 'p1', objectId: big, to: 'hand' }).state // the player sees it in hand
    expect(planPayment(s, 'p1', big)).toEqual([{ objectId: marwyn, abilityIndex: 0 }]) // {G}{G}{G}{G} from Marwyn alone
    expect(planPaymentFromView(viewFor(s, 'p1'), 'p1', big)).toEqual([{ objectId: marwyn, abilityIndex: 0 }])
  })
})
