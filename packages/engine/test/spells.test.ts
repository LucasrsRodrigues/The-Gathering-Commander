import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createGame, deriveCardRules, planPayment, replay, type Action, type CardRef, type GameEvent, type GameState, type OracleFacts,
} from '../src'
import { act, keepAll } from './helpers'

const load = (file: string): OracleFacts[] => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', file), 'utf8'))
const ALL = [...load('spells.json'), ...load('oracle.json')]
const facts = (name: string) => ALL.find((f) => f.name === name)!
const card = (name: string): CardRef => ({ name, typeLine: facts(name).typeLine, rules: deriveCardRules(facts(name)) })
const coverage = (name: string) => card(name).rules!.coverage

describe('wave 1 spells: reading the real Oracle (épico 11, T11.6)', () => {
  it('common spells are automated', () => {
    for (const name of ['Lightning Bolt', 'Shock', 'Murder', 'Fell', 'Go for the Throat', 'Disenchant', 'Wrath of God', 'Damnation', 'Pyroclasm',
      'Divination', 'Harmonize', "Night's Whisper", 'Sign in Blood', 'Infernal Grasp', "Krenko's Command", 'Raise the Alarm', 'Giant Growth', 'Unsummon']) {
      expect(coverage(name), name).toBe('automated')
    }
  })

  it('a line about casting before the effect keeps the effect automatic (partial)', () => {
    expect(card('Thrill of Possibility').rules).toMatchObject({ coverage: 'partial', manualText: ['As an additional cost to cast this spell, discard a card.'] })
    expect(card('Blasphemous Act').rules).toMatchObject({ coverage: 'partial', spell: { effects: [{ kind: 'damage', to: 'each creature' }] } })
  })

  it('a manual line before an automated one makes the whole spell manual (order matters)', () => {
    expect(card('Ponder').rules).toMatchObject({ coverage: 'manual' })
    expect(card('Ponder').rules!.spell).toBeUndefined()
  })

  it('on doubt, manual: consequences, modes, granted keywords and scry stay with the players', () => {
    for (const name of ['Swords to Plowshares', 'Beast Within', 'Path to Exile', 'Return to Nature', 'Rush of Adrenaline', 'Read the Bones', 'Chaos Warp']) {
      expect(coverage(name), name).toBe('manual')
    }
  })
})

// A two-player game; every card starts where the test puts it.
const BEAR: CardRef = { name: 'Test Bear', typeLine: 'Creature — Bear', rules: deriveCardRules({ name: 'Test Bear', typeLine: 'Creature — Bear', manaCost: '{1}{G}', oracleText: '', keywords: [], colorIdentity: ['G'], power: '2', toughness: '2' }) }
const WALL: CardRef = { name: 'Test Wall', typeLine: 'Creature — Wall', rules: { ...BEAR.rules!, keywords: ['indestructible'] } }
const SPELLS = ['Lightning Bolt', 'Divination', 'Wrath of God', "Krenko's Command", 'Giant Growth', 'Unsummon', "Night's Whisper", 'Big Score', 'Infernal Grasp', 'Blasphemous Act']
function game(): GameState {
  const deck = { commanders: [BEAR], cards: [...SPELLS.map(card), BEAR, WALL, ...Array(60).fill(BEAR)] }
  return keepAll(createGame({
    seed: 8, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'off', combatRules: 'block' }, // combat rules on: lethal damage kills
    players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }],
  }))
}
type Run = { state: GameState; events: GameEvent[]; actions: Action[] }
function run(s: GameState): Run {
  return { state: s, events: [], actions: [] }
}
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
function resolve(r: Run): Run {
  let out = r
  const depth = r.state.stack.length
  for (let i = 0; i < 8 && out.state.stack.length >= depth && out.state.priority; i++) out = step(out, { type: 'passPriority', player: out.state.priority.player })
  return out
}
const life = (s: GameState, p: string) => s.players[p]!.life
const hand = (s: GameState, p: string) => s.zones[p]!.hand.length

describe('wave 1 spells in play', () => {
  it('Lightning Bolt: 3 damage to a creature (it dies) or to a player', () => {
    let [r, bolt] = put(run(game()), 'p1', 'Lightning Bolt', 'hand')
    let bear: string
    ;[r, bear] = put(r, 'p2', 'Test Bear', 'battlefield')
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: bolt, targets: [{ object: bear }] }))
    expect(r.state.objects[bear]?.zone ?? 'gone').not.toBe('battlefield')
    expect(r.state.objects[bolt]!.zone).toBe('graveyard')
    expect(r.events.some((e) => e.type === 'abilityResolving')).toBe(true)
    let [r2, bolt2] = put(run(game()), 'p1', 'Lightning Bolt', 'hand')
    r2 = resolve(step(r2, { type: 'castSpell', player: 'p1', objectId: bolt2, targets: [{ player: 'p2' }] }))
    expect(life(r2.state, 'p2')).toBe(37)
  })

  it('Divination and Night\'s Whisper draw (and lose life)', () => {
    let [r, div] = put(run(game()), 'p1', 'Divination', 'hand')
    let nw: string
    ;[r, nw] = put(r, 'p1', "Night's Whisper", 'hand')
    const before = hand(r.state, 'p1')
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: div }))
    expect(hand(r.state, 'p1')).toBe(before - 1 + 2)
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: nw }))
    expect(hand(r.state, 'p1')).toBe(before - 2 + 4)
    expect(life(r.state, 'p1')).toBe(38)
  })

  it('Wrath of God destroys every creature but the indestructible one', () => {
    let [r, wrath] = put(run(game()), 'p1', 'Wrath of God', 'hand')
    let mine: string, theirs: string, wall: string
    ;[r, mine] = put(r, 'p1', 'Test Bear', 'battlefield')
    ;[r, theirs] = put(r, 'p2', 'Test Bear', 'battlefield')
    ;[r, wall] = put(r, 'p2', 'Test Wall', 'battlefield')
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: wrath }))
    expect([mine, theirs].map((id) => r.state.objects[id]!.zone)).toEqual(['graveyard', 'graveyard'])
    expect(r.state.objects[wall]!.zone).toBe('battlefield')
  })

  it("Krenko's Command makes two 1/1 red Goblins; Giant Growth lasts until end of turn", () => {
    let [r, cmd] = put(run(game()), 'p1', "Krenko's Command", 'hand')
    let growth: string
    ;[r, growth] = put(r, 'p1', 'Giant Growth', 'hand')
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: cmd }))
    const goblins = r.state.battlefield.map((id) => r.state.objects[id]!).filter((o) => o.isToken)
    expect(goblins).toHaveLength(2)
    expect(goblins[0]!.card).toMatchObject({ name: 'Goblin', rules: { power: 1, toughness: 1, colorIdentity: ['R'], subtypes: ['Goblin'] } })
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: growth, targets: [{ object: goblins[0]!.id }] }))
    expect(r.state.objects[goblins[0]!.id]!.ptMods).toEqual([{ power: 3, toughness: 3 }])
  })

  it("Unsummon returns the creature to its owner's hand", () => {
    let [r, un] = put(run(game()), 'p1', 'Unsummon', 'hand')
    let bear: string
    ;[r, bear] = put(r, 'p2', 'Test Bear', 'battlefield')
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: un, targets: [{ object: bear }] }))
    expect(r.state.objects[bear]).toMatchObject({ zone: 'hand', owner: 'p2' })
  })

  it('Big Score: two cards and two Treasures; a Treasure is sacrificed for mana, never spent by the auto-pay', () => {
    let [r, score] = put(run(game()), 'p1', 'Big Score', 'hand')
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: score }))
    const treasures = r.state.battlefield.filter((id) => r.state.objects[id]!.card.name === 'Treasure')
    expect(treasures).toHaveLength(2)
    let bolt: string
    ;[r, bolt] = put(r, 'p1', 'Lightning Bolt', 'hand')
    expect(planPayment(r.state, 'p1', bolt)).toBeNull() // only Treasures: the player decides
    r = step(r, { type: 'activateMana', player: 'p1', objectId: treasures[0]!, abilityIndex: 0, color: 'R' })
    expect(r.state.players.p1!.manaPool.R).toBe(1)
    expect(r.state.objects[treasures[0]!]).toBeUndefined() // a sacrificed token ceases to exist
  })

  it('a partial card applies what was understood and leaves the rest in the log', () => {
    let [r, act13] = put(run(game()), 'p1', 'Blasphemous Act', 'hand')
    let bear: string
    ;[r, bear] = put(r, 'p2', 'Test Bear', 'battlefield')
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: act13 }))
    expect(r.state.objects[bear]!.zone).toBe('graveyard')
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'manualStep', text: expect.stringMatching(/costs \{1\} less/) }))
  })

  it('fitness: replaying the actions of a game with automated spells gives the same state', () => {
    const start = game()
    let [r, bolt] = put(run(start), 'p1', 'Lightning Bolt', 'hand')
    let grasp: string, bear: string
    ;[r, grasp] = put(r, 'p1', 'Infernal Grasp', 'hand')
    ;[r, bear] = put(r, 'p2', 'Test Bear', 'battlefield')
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: grasp, targets: [{ object: bear }] }))
    r = resolve(step(r, { type: 'castSpell', player: 'p1', objectId: bolt, targets: [{ player: 'p2' }] }))
    const again = replay(start, r.actions)
    expect(again.ok && again.state).toEqual(r.state)
    expect(life(r.state, 'p1')).toBe(38)
  })
})
