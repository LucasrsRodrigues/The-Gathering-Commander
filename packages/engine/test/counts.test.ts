import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, type Action, type CardRef, type GameEvent, type GameState, type OracleFacts } from '../src'
import { act, keepAll } from './helpers'

const ALL: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'counts.json'), 'utf8'))
const facts = (name: string) => ALL.find((f) => f.name === name)!
const card = (name: string): CardRef => ({ name, typeLine: facts(name).typeLine, rules: deriveCardRules(facts(name)) })
const custom = (name: string, typeLine: string, oracleText: string, pt?: [string, string]): CardRef =>
  ({ name, typeLine, rules: deriveCardRules({ name, typeLine, manaCost: '{1}', oracleText, keywords: [], colorIdentity: [], ...(pt ? { power: pt[0], toughness: pt[1] } : {}) }) })

describe('counts in effects: reading the real Oracle (épico 11, T11.11)', () => {
  it('"for each", "where X is the number of" and subtypes are automated', () => {
    for (const name of ['Wellwisher', 'Krenko, Mob Boss', 'Collective Unconscious', 'Siege-Gang Commander', 'Elvish Promenade']) {
      expect(card(name).rules!.coverage, name).toBe('automated')
    }
    expect(card('Wellwisher').rules!.activated![0]!.effects).toEqual([
      { kind: 'gainLife', who: 'you', amount: { kind: 'count', what: { subtypes: ['Elf'] }, zone: 'battlefield' } },
    ])
    expect(card('Krenko, Mob Boss').rules!.activated![0]!.effects[0]).toMatchObject({
      kind: 'token', amount: { kind: 'count', what: { subtypes: ['Goblin'], controller: 'you' }, zone: 'battlefield' },
    })
    expect(card('Siege-Gang Commander').rules!.activated![0]!.cost.sacrifice).toEqual({ subtypes: ['Goblin'] })
  })

  it('on doubt, manual: "with power 4 or greater", devotion, "player or planeswalker"', () => {
    expect(card('Shamanic Revelation').rules).toMatchObject({ coverage: 'partial', manualText: [expect.stringContaining('power 4 or greater')] })
    for (const name of ['Gray Merchant of Asphodel', 'Goblin War Strike', "Ezuri's Predation"]) expect(card(name).rules!.coverage, name).toBe('manual')
  })
})

const ELF = custom('Test Elf', 'Creature — Elf', '', ['1', '1'])
const SAGE = custom('Test Sage', 'Creature — Human Wizard', '{T}: This creature deals damage equal to the number of cards in your hand to any target.', ['1', '1'])
const CARDS = ['Wellwisher', 'Krenko, Mob Boss', 'Collective Unconscious']
function game(): GameState {
  const deck = { commanders: [ELF], cards: [...CARDS.map(card), SAGE, ...Array(60).fill(ELF)] }
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
const life = (s: GameState, p: string) => s.players[p]!.life

describe('counts in play', () => {
  it('Wellwisher gains 1 life per Elf on the battlefield, counting itself and the opponent\'s', () => {
    let [r, wellwisher] = put(run(game()), 'p1', 'Wellwisher', 'battlefield')
    ;[r] = put(r, 'p1', 'Test Elf', 'battlefield')
    ;[r] = put(r, 'p2', 'Test Elf', 'battlefield')
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: wellwisher, index: 0 }), 0)
    expect(life(r.state, 'p1')).toBe(43)
  })

  it('Krenko makes one Goblin per Goblin I control (itself included)', () => {
    let [r, krenko] = put(run(game()), 'p1', 'Krenko, Mob Boss', 'battlefield')
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: krenko, index: 0 }), 0)
    const goblins = () => r.state.battlefield.filter((id) => r.state.objects[id]!.isToken).length
    expect(goblins()).toBe(1)
    r = step(r, { type: 'untap', player: 'p1', objectId: krenko })
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: krenko, index: 0 }), 0)
    expect(goblins()).toBe(3)
  })

  it('Collective Unconscious draws per creature; damage equal to the cards in hand', () => {
    let [r, cu] = put(run(game()), 'p1', 'Collective Unconscious', 'hand')
    ;[r] = put(r, 'p1', 'Test Elf', 'battlefield')
    ;[r] = put(r, 'p1', 'Test Elf', 'battlefield')
    const before = r.state.zones.p1!.hand.length
    r = resolveTo(step(r, { type: 'castSpell', player: 'p1', objectId: cu }), 0)
    expect(r.state.zones.p1!.hand.length).toBe(before - 1 + 2)
    let sage: string
    ;[r, sage] = put(r, 'p1', 'Test Sage', 'battlefield')
    const cards = r.state.zones.p1!.hand.length
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: sage, index: 0, targets: [{ player: 'p2' }] }), 0)
    expect(life(r.state, 'p2')).toBe(40 - cards)
  })
})
