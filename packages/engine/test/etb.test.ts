import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createGame, deriveCardRules, reduce, replay, type Action, type CardRef, type CardRules, type GameEvent, type GameState, type OracleFacts, type TokenDef,
} from '../src'
import { act, expectError, keepAll } from './helpers'

const load = (file: string): OracleFacts[] => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', file), 'utf8'))
const ALL = load('etb.json')
const facts = (name: string) => ALL.find((f) => f.name === name)!
const card = (name: string): CardRef => ({ name, typeLine: facts(name).typeLine, rules: deriveCardRules(facts(name)) })
const coverage = (name: string) => card(name).rules!.coverage

describe('"when this enters": reading the real Oracle (épico 11, T11.7)', () => {
  it('common ETB creatures and lands are automated', () => {
    for (const name of ['Elvish Visionary', 'Flametongue Kavu', "Man-o'-War", 'Ravenous Chupacabra', 'Bloodfell Caves', 'Goblin Instigator',
      'Llanowar Visionary', 'Siege Rhino', 'Wall of Omens', 'Cloudkin Seer']) {
      expect(coverage(name), name).toBe('automated')
    }
    expect(card('Flametongue Kavu').rules!.etb).toEqual([{
      text: 'When this creature enters, it deals 4 damage to target creature.',
      targets: [{ kind: 'object', filter: { types: ['creature'] }, count: 1 }],
      effects: [{ kind: 'damage', to: 'target', amount: { kind: 'fixed', n: 4 } }],
    }])
  })

  it('the ETB is automated even when another line is manual (partial)', () => {
    expect(card('Thragtusk').rules).toMatchObject({ coverage: 'partial', etb: [{ effects: [{ kind: 'gainLife', amount: { n: 5 } }] }] })
    expect(card('Mulldrifter').rules).toMatchObject({ coverage: 'partial', etb: [{ effects: [{ kind: 'draw', amount: { n: 2 } }] }] })
  })

  it('"you may", lists with commas and searches stay manual', () => {
    for (const name of ['Solemn Simulacrum', 'Reclamation Sage', 'Acidic Slime']) {
      expect(card(name).rules!.etb, name).toBeUndefined()
    }
  })
})

// A two-player game, mana and timing off (the test puts cards where it wants): cast, then everyone passes.
const BEAR: CardRef = { name: 'Test Bear', typeLine: 'Creature — Bear', rules: deriveCardRules({ name: 'Test Bear', typeLine: 'Creature — Bear', manaCost: '{1}{G}', oracleText: '', keywords: [], colorIdentity: ['G'], power: '2', toughness: '2' }) }
const TWICE: CardRef = {
  name: 'Test Twice', typeLine: 'Creature — Elf',
  rules: deriveCardRules({ name: 'Test Twice', typeLine: 'Creature — Elf', manaCost: '{G}', oracleText: 'When this creature enters, draw a card.\nWhen this creature enters, you gain 2 life.', keywords: [], colorIdentity: ['G'], power: '1', toughness: '1' }),
}
const SPROUT: TokenDef = {
  name: 'Sprout', types: ['creature'], subtypes: ['Plant'], colors: ['G'], power: 0, toughness: 1, keywords: [], manaAbilities: [],
  etb: [{ text: 'When this creature enters, draw a card.', effects: [{ kind: 'draw', who: 'you', amount: { kind: 'fixed', n: 1 } }] }],
}
const SPROUTS: CardRef = {
  name: 'Test Sprouts', typeLine: 'Sorcery',
  rules: { ...(BEAR.rules as CardRules), types: ['sorcery'], subtypes: [], power: null, toughness: null, coverage: 'automated', spell: { text: 'Create two Sprouts.', effects: [{ kind: 'token', token: SPROUT, amount: { kind: 'fixed', n: 2 } }] } },
}
const CARDS = ['Elvish Visionary', 'Flametongue Kavu', 'Ravenous Chupacabra', 'Bloodfell Caves', 'Siege Rhino']
function game(): GameState {
  const deck = { commanders: [BEAR], cards: [...CARDS.map(card), TWICE, SPROUTS, ...Array(60).fill(BEAR)] }
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
// Everyone passes until the stack is down to `depth` (or a choice is pending).
function resolveTo(r: Run, depth: number): Run {
  let out = r
  for (let i = 0; i < 12 && out.state.stack.length > depth && out.state.priority && !out.state.pending; i++) {
    out = step(out, { type: 'passPriority', player: out.state.priority.player })
  }
  return out
}
// Everyone passes until the top item resolved (something else may be on top afterwards, like its trigger).
function resolveOne(r: Run): Run {
  let out = r
  const top = r.state.stack.at(-1)?.id
  for (let i = 0; i < 12 && out.state.stack.at(-1)?.id === top && out.state.priority && !out.state.pending; i++) {
    out = step(out, { type: 'passPriority', player: out.state.priority.player })
  }
  return out
}
const life = (s: GameState, p: string) => s.players[p]!.life
const hand = (s: GameState, p: string) => s.zones[p]!.hand.length
const start = () => run(game())

describe('"when this enters" in play', () => {
  it('Elvish Visionary: the trigger goes on the stack when it enters, then draws', () => {
    let [r, elf] = put(start(), 'p1', 'Elvish Visionary', 'hand')
    r = step(r, { type: 'castSpell', player: 'p1', objectId: elf })
    const before = hand(r.state, 'p1')
    r = resolveOne(r) // the creature resolves; its trigger is now the only item
    expect(r.state.objects[elf]!.zone).toBe('battlefield')
    expect(r.state.stack).toMatchObject([{ kind: 'ability', sourceId: elf, controller: 'p1', ability: { from: 'etb', index: 0 } }])
    expect(r.state.priority?.player).toBe('p1') // CR 117.3b: the active player gets priority with the trigger on the stack
    r = resolveTo(r, 0)
    expect(hand(r.state, 'p1')).toBe(before + 1)
  })

  it('Flametongue Kavu: the targets are asked before the trigger goes on the stack, and only legal ones count', () => {
    let [r, kavu] = put(start(), 'p1', 'Flametongue Kavu', 'hand')
    let bear: string
    ;[r, bear] = put(r, 'p2', 'Test Bear', 'battlefield')
    r = resolveOne(step(r, { type: 'castSpell', player: 'p1', objectId: kavu }))
    expect(r.state.pending).toMatchObject({ kind: 'chooseTargets', player: 'p1', trigger: { sourceId: kavu, index: 0 } })
    expect(r.state.stack).toEqual([])
    expectError(r.state, { type: 'passPriority', player: 'p1' }, 'notYourDecision')
    expectError(r.state, { type: 'chooseTargets', player: 'p2', targets: [{ object: bear }] }, 'notYourDecision')
    expectError(r.state, { type: 'chooseTargets', player: 'p1', targets: [{ player: 'p2' }] }, 'invalidTarget')
    expectError(r.state, { type: 'chooseTargets', player: 'p1', targets: [] }, 'invalidTarget')
    r = step(r, { type: 'chooseTargets', player: 'p1', targets: [{ object: bear }] })
    expect(r.state.pending).toBeNull()
    expect(r.state.stack).toMatchObject([{ sourceId: kavu, targets: [{ object: bear }] }])
    r = resolveTo(r, 0)
    expect(r.state.objects[bear]!.zone).toBe('graveyard')
  })

  it('without a legal target the trigger is removed without effect (CR 603.3d)', () => {
    let [r, chupa] = put(start(), 'p1', 'Ravenous Chupacabra', 'hand')
    ;[r] = put(r, 'p1', 'Test Bear', 'battlefield') // my own creature is not "an opponent controls"
    r = resolveTo(step(r, { type: 'castSpell', player: 'p1', objectId: chupa }), 0)
    expect(r.state.pending).toBeNull()
    expect(r.state.stack).toEqual([])
    expect(r.events).toContainEqual({ type: 'triggerSkipped', sourceId: chupa, text: 'When this creature enters, destroy target creature an opponent controls.' })
  })

  it('a target that leaves before the trigger resolves makes it fizzle', () => {
    let [r, kavu] = put(start(), 'p1', 'Flametongue Kavu', 'hand')
    let bear: string
    ;[r, bear] = put(r, 'p2', 'Test Bear', 'battlefield')
    r = resolveOne(step(r, { type: 'castSpell', player: 'p1', objectId: kavu }))
    r = step(r, { type: 'chooseTargets', player: 'p1', targets: [{ object: bear }] })
    r = step(r, { type: 'moveObject', player: 'p2', objectId: bear, to: 'hand' })
    r = resolveTo(r, 0)
    expect(r.events.some((e) => e.type === 'stackItemFizzled')).toBe(true)
    expect(r.state.objects[kavu]!.damage).toBe(0)
  })

  it('"manual" puts the trigger on the stack to be done by hand', () => {
    let [r, kavu] = put(start(), 'p1', 'Flametongue Kavu', 'hand')
    r = resolveOne(step(r, { type: 'castSpell', player: 'p1', objectId: kavu }))
    expect(r.state.pending?.kind).toBe('chooseTargets') // alone, the Kavu must target itself
    r = step(r, { type: 'chooseTargets', player: 'p1', targets: [], manual: true })
    expect(r.state.stack).toMatchObject([{ sourceId: kavu, manual: true }])
    r = resolveTo(r, 0)
    expect(r.state.objects[kavu]!.zone).toBe('battlefield')
    expect(r.state.objects[kavu]!.damage).toBe(0)
  })

  it('two triggers of one card resolve in text order', () => {
    let [r, elf] = put(start(), 'p1', 'Test Twice', 'hand')
    r = resolveOne(step(r, { type: 'castSpell', player: 'p1', objectId: elf }))
    expect(r.state.stack.map((i) => i.ability?.index)).toEqual([1, 0]) // the first line on top
    const from = r.events.length
    r = resolveTo(r, 0)
    const order = r.events.slice(from).filter((e) => e.type === 'cardsDrawn' || e.type === 'lifeChanged').map((e) => e.type)
    expect(order).toEqual(['cardsDrawn', 'lifeChanged'])
    expect(life(r.state, 'p1')).toBe(42)
  })

  it('tokens that enter trigger too', () => {
    let [r, sprouts] = put(start(), 'p1', 'Test Sprouts', 'hand')
    r = step(r, { type: 'castSpell', player: 'p1', objectId: sprouts })
    const before = hand(r.state, 'p1')
    r = resolveOne(r)
    expect(r.state.stack).toHaveLength(2)
    expect(r.state.stack.every((i) => r.state.objects[i.sourceId!]?.isToken)).toBe(true)
    r = resolveTo(r, 0)
    expect(hand(r.state, 'p1')).toBe(before + 2)
  })

  it('a land that enters triggers too (Bloodfell Caves), and Siege Rhino drains', () => {
    let [r, caves] = put(start(), 'p1', 'Bloodfell Caves', 'hand')
    r = resolveTo(step(r, { type: 'playLand', player: 'p1', objectId: caves }), 0)
    expect(r.state.objects[caves]!.tapped).toBe(true)
    expect(life(r.state, 'p1')).toBe(41)
    let rhino: string
    ;[r, rhino] = put(r, 'p1', 'Siege Rhino', 'hand')
    r = resolveTo(step(r, { type: 'castSpell', player: 'p1', objectId: rhino }), 0)
    expect([life(r.state, 'p1'), life(r.state, 'p2')]).toEqual([44, 37])
  })

  it('replays to the same state, choices included (determinism)', () => {
    const begin = start()
    let [r, kavu] = put(begin, 'p1', 'Flametongue Kavu', 'hand')
    let bear: string
    ;[r, bear] = put(r, 'p2', 'Test Bear', 'battlefield')
    r = resolveOne(step(r, { type: 'castSpell', player: 'p1', objectId: kavu }))
    r = resolveTo(step(r, { type: 'chooseTargets', player: 'p1', targets: [{ object: bear }] }), 0)
    const again = replay(begin.state, r.actions)
    expect(again.ok && again.state).toEqual(r.state)
  })

  it('a player who concedes while choosing leaves the choice behind', () => {
    let [r, kavu] = put(start(), 'p1', 'Flametongue Kavu', 'hand')
    r = resolveOne(step(r, { type: 'castSpell', player: 'p1', objectId: kavu }))
    const out = reduce(r.state, { type: 'concede', player: 'p1' })
    expect(out.ok && out.state.pending).toBeNull()
  })
})
