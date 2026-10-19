import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, viewFor, type CardRef, type GameState, type OracleFacts, type RuleLevel } from '../src'
import { act, keepAll } from './helpers'

const FIXTURE: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'oracle.json'), 'utf8'))
const card = (name: string): CardRef => {
  const facts = FIXTURE.find((f) => f.name === name)!
  return { name, typeLine: facts.typeLine, rules: deriveCardRules(facts) }
}
const indestructibleBear: CardRef = { name: 'Test Wall', typeLine: 'Creature — Wall', rules: { ...card('Vampire Nighthawk').rules!, keywords: ['indestructible'] } }
const ONBOARD = ['Vampire Nighthawk', 'Ajani, Mentor of Heroes', 'Tarmogoyf', 'Test Wall', 'Grave Titan']

function game(combatRules: RuleLevel = 'block'): GameState {
  const deck = { commanders: [card('Krenko, Mob Boss')], cards: [...ONBOARD.slice(0, 3).map(card), indestructibleBear, card('Grave Titan'), ...Array(40).fill(card('Wastes'))] }
  let s = keepAll(createGame({ seed: 7, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'off', combatRules }, players: [{ id: 'p1', name: 'Ana', deck }] }))
  for (const name of ONBOARD) {
    const id = Object.values(s.objects).find((o) => o.card.name === name)!.id
    s = act(s, { type: 'moveObject', player: 'p1', objectId: id, to: 'battlefield' }).state
  }
  return s
}
const id = (s: GameState, name: string) => Object.values(s.objects).find((o) => o.card.name === name)!.id
const zone = (s: GameState, name: string) => s.objects[id(s, name)]!.zone

describe('damage and state-based actions (CR 120, 704.5f–i)', () => {
  it('a creature dies when marked damage reaches its toughness', () => {
    let s = game()
    s = act(s, { type: 'dealDamage', player: 'p1', objectId: id(s, 'Vampire Nighthawk'), amount: 2 }).state
    expect(zone(s, 'Vampire Nighthawk')).toBe('battlefield')
    const { state, events } = act(s, { type: 'dealDamage', player: 'p1', objectId: id(s, 'Vampire Nighthawk'), amount: 1 })
    expect(zone(state, 'Vampire Nighthawk')).toBe('graveyard')
    expect(events).toContainEqual(expect.objectContaining({ type: 'destroyed', reason: 'damage' }))
  })

  it('deathtouch damage is lethal; Indestructible survives damage but not 0 toughness', () => {
    let s = game()
    s = act(s, { type: 'dealDamage', player: 'p1', objectId: id(s, 'Grave Titan'), amount: 1, deathtouch: true }).state
    expect(zone(s, 'Grave Titan')).toBe('graveyard')
    s = act(s, { type: 'dealDamage', player: 'p1', objectId: id(s, 'Test Wall'), amount: 10 }).state
    expect(zone(s, 'Test Wall')).toBe('battlefield')
    s = act(s, { type: 'adjustPT', player: 'p1', objectId: id(s, 'Test Wall'), power: 0, toughness: -3 }).state
    expect(zone(s, 'Test Wall')).toBe('graveyard')
  })

  it('a planeswalker enters with its loyalty and leaves at 0', () => {
    let s = game()
    expect(s.objects[id(s, 'Ajani, Mentor of Heroes')]!.counters).toEqual({ lealdade: 4 })
    s = act(s, { type: 'dealDamage', player: 'p1', objectId: id(s, 'Ajani, Mentor of Heroes'), amount: 4 }).state
    expect(zone(s, 'Ajani, Mentor of Heroes')).toBe('graveyard')
  })

  it('+1/+1 and -1/-1 counters cancel out; P/T shows in the view', () => {
    let s = game()
    const hawk = id(s, 'Vampire Nighthawk')
    s = act(s, { type: 'addCounter', player: 'p1', objectId: hawk, counter: '+1/+1', delta: 2 }).state
    s = act(s, { type: 'addCounter', player: 'p1', objectId: hawk, counter: '-1/-1', delta: 1 }).state
    expect(s.objects[hawk]!.counters).toEqual({ '+1/+1': 1 })
    s = act(s, { type: 'adjustPT', player: 'p1', objectId: hawk, power: 2, toughness: 0 }).state
    expect(viewFor(s, 'p1').objects[hawk]).toMatchObject({ power: 5, toughness: 4, damage: 0 })
  })

  it("'*' P/T and cards without data are left to the players", () => {
    let s = game()
    s = act(s, { type: 'dealDamage', player: 'p1', objectId: id(s, 'Tarmogoyf'), amount: 5 }).state
    expect(zone(s, 'Tarmogoyf')).toBe('battlefield')
    expect(viewFor(s, 'p1').objects[id(s, 'Tarmogoyf')]).toMatchObject({ power: null, toughness: null, damage: 5 })
  })

  it('damage and "until end of turn" effects wear off in cleanup', () => {
    let s = game()
    const hawk = id(s, 'Vampire Nighthawk')
    s = act(s, { type: 'dealDamage', player: 'p1', objectId: hawk, amount: 2 }).state
    s = act(s, { type: 'adjustPT', player: 'p1', objectId: hawk, power: 3, toughness: 3 }).state
    const turn = s.turn.number
    while (s.turn.number === turn) {
      s = s.pending?.kind === 'declareAttackers'
        ? act(s, { type: 'declareAttackers', player: 'p1', attacks: [] }).state
        : act(s, { type: 'advanceStep', player: 'p1' }).state
    }
    expect(s.objects[hawk]).toMatchObject({ damage: 0, ptMods: [], deathtouchDamage: false })
  })

  it('with combat rules off nothing dies on its own', () => {
    let s = game('off')
    s = act(s, { type: 'dealDamage', player: 'p1', objectId: id(s, 'Vampire Nighthawk'), amount: 9 }).state
    expect(zone(s, 'Vampire Nighthawk')).toBe('battlefield')
  })
})
