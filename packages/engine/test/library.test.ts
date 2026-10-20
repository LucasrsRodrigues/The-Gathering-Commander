import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, reduce, replay, viewFor, type Action, type CardRef, type GameEvent, type GameState, type OracleFacts } from '../src'
import { act, expectError, keepAll } from './helpers'

const ALL: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'library.json'), 'utf8'))
const facts = (name: string) => ALL.find((f) => f.name === name)!
const card = (name: string): CardRef => ({ name, typeLine: facts(name).typeLine, rules: deriveCardRules(facts(name)) })
const basic = (name: string): CardRef => ({ name, typeLine: `Basic Land — ${name}`, rules: deriveCardRules({ name, typeLine: `Basic Land — ${name}`, manaCost: '', oracleText: '', keywords: [], colorIdentity: [] }) })

describe('searches, scry, surveil and investigate: reading the real Oracle (épico 11, T11.12)', () => {
  it('the common ones are automated', () => {
    for (const name of ['Cultivate', "Kodama's Reach", 'Rampant Growth', 'Farseek', "Nature's Lore", 'Three Visits', 'Wood Elves', 'Sakura-Tribe Elder',
      'Demonic Tutor', 'Temple of Epiphany', 'Undercity Sewers', 'Opt', 'Preordain', 'Thraben Inspector', 'Evolving Wilds', 'Explosive Vegetation']) {
      expect(card(name).rules!.coverage, name).toBe('automated')
    }
    expect(card('Cultivate').rules!.spell!.effects).toEqual([
      { kind: 'search', filter: { types: ['land'], supertypes: ['basic'] }, to: 'split', tapped: true, amount: { kind: 'fixed', n: 2 } },
    ])
    expect(card('Farseek').rules!.spell!.effects[0]).toMatchObject({ filter: { subtypes: ['Plains', 'Island', 'Swamp', 'Mountain'] }, to: 'battlefield', tapped: true })
    expect(card('Preordain').rules!.spell!.effects.map((e) => e.kind)).toEqual(['scry', 'draw'])
  })

  it('on doubt, manual: "put the card on top" and Ponder\'s free order', () => {
    for (const name of ['Worldly Tutor', 'Ponder']) expect(card(name).rules!.coverage, name).toBe('manual')
  })
})

const BEAR: CardRef = { name: 'Test Bear', typeLine: 'Creature — Bear', rules: deriveCardRules({ name: 'Test Bear', typeLine: 'Creature — Bear', manaCost: '{1}{G}', oracleText: '', keywords: [], colorIdentity: ['G'], power: '2', toughness: '2' }) }
const CARDS = ['Rampant Growth', 'Cultivate', 'Opt', 'Undercity Sewers', 'Thraben Inspector']
function game(): GameState {
  const deck = { commanders: [BEAR], cards: [...CARDS.map(card), ...Array(5).fill(basic('Forest')), ...Array(3).fill(basic('Island')), ...Array(50).fill(BEAR)] }
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
const libraryOf = (s: GameState, p: string) => s.zones[p]!.library
const start = () => run(game())

describe('library choices in play', () => {
  it('Rampant Growth: only basic lands can be picked, the land enters tapped, the library is shuffled, then it resolves', () => {
    let [r, growth] = put(start(), 'p1', 'Rampant Growth', 'hand')
    r = resolveTo(step(r, { type: 'castSpell', player: 'p1', objectId: growth }), 0)
    const pending = r.state.pending
    expect(pending).toMatchObject({ kind: 'searchLibrary', player: 'p1', count: 1, to: 'battlefield', tapped: true })
    if (pending?.kind !== 'searchLibrary') throw new Error('no search')
    const basics = libraryOf(r.state, 'p1').filter((id) => r.state.objects[id]!.card.typeLine?.startsWith('Basic Land'))
    expect(pending.cards.toSorted()).toEqual(basics.toSorted()) // every basic land in the library, nothing else
    expect(pending.cards.every((id) => r.state.objects[id]!.card.typeLine?.startsWith('Basic Land'))).toBe(true)
    expect(r.state.stack.map((i) => i.objectId)).toEqual([growth]) // still resolving
    // Hidden information: only the searcher sees the cards.
    expect(viewFor(r.state, 'p2').pending).toMatchObject({ kind: 'searchLibrary', cards: [] })
    expect(viewFor(r.state, 'p2').objects[pending.cards[0]!]).toBeUndefined()
    expect(viewFor(r.state, 'p1').objects[pending.cards[0]!]?.card?.name).toMatch(/Forest|Island/)
    const bear = libraryOf(r.state, 'p1').find((id) => r.state.objects[id]!.card.name === 'Test Bear')!
    expectError(r.state, { type: 'searchLibrary', player: 'p1', objectIds: [bear] }, 'invalidSelection')
    expectError(r.state, { type: 'searchLibrary', player: 'p1', objectIds: pending.cards.slice(0, 2) }, 'invalidSelection')
    expectError(r.state, { type: 'searchLibrary', player: 'p2', objectIds: [] }, 'notYourDecision')
    expectError(r.state, { type: 'passPriority', player: 'p1' }, 'notYourDecision')
    const land = pending.cards[0]!
    r = step(r, { type: 'searchLibrary', player: 'p1', objectIds: [land] })
    expect(r.state.objects[land]).toMatchObject({ zone: 'battlefield', tapped: true })
    expect(r.events.some((e) => e.type === 'libraryShuffled')).toBe(true)
    expect(r.state.objects[growth]!.zone).toBe('graveyard')
    expect([r.state.stack, r.state.pending]).toEqual([[], null])
  })

  it('Cultivate: one land to the battlefield tapped, the other to hand; finding nothing is fine too', () => {
    let [r, cultivate] = put(start(), 'p1', 'Cultivate', 'hand')
    r = resolveTo(step(r, { type: 'castSpell', player: 'p1', objectId: cultivate }), 0)
    const cards = r.state.pending?.kind === 'searchLibrary' ? r.state.pending.cards : []
    const nothing = reduce(r.state, { type: 'searchLibrary', player: 'p1', objectIds: [] })
    expect(nothing.ok && nothing.state.objects[cultivate]!.zone).toBe('graveyard')
    r = step(r, { type: 'searchLibrary', player: 'p1', objectIds: [cards[0]!, cards[1]!] })
    expect(r.state.objects[cards[0]!]).toMatchObject({ zone: 'battlefield', tapped: true })
    expect(r.state.objects[cards[1]!]!.zone).toBe('hand')
  })

  it('Opt: the card looked at goes to the bottom, then the next one is drawn', () => {
    let [r, opt] = put(start(), 'p1', 'Opt', 'hand')
    r = resolveTo(step(r, { type: 'castSpell', player: 'p1', objectId: opt }), 0)
    const top = libraryOf(r.state, 'p1').at(-1)!
    const second = libraryOf(r.state, 'p1').at(-2)!
    expect(r.state.pending).toMatchObject({ kind: 'scry', cards: [top], count: 1 })
    expectError(r.state, { type: 'arrangeTop', player: 'p1', top: [], away: [] }, 'invalidSelection')
    r = step(r, { type: 'arrangeTop', player: 'p1', top: [], away: [top] })
    expect(libraryOf(r.state, 'p1')[0]).toBe(top)
    expect(r.state.objects[second]!.zone).toBe('hand')
    expect(r.state.objects[opt]!.zone).toBe('graveyard')
  })

  it('Undercity Sewers: surveil when it enters puts the card in the graveyard', () => {
    let [r, sewers] = put(start(), 'p1', 'Undercity Sewers', 'hand')
    r = resolveTo(step(r, { type: 'playLand', player: 'p1', objectId: sewers }), 0)
    const top = libraryOf(r.state, 'p1').at(-1)!
    expect(r.state.pending).toMatchObject({ kind: 'surveil', cards: [top] })
    r = step(r, { type: 'arrangeTop', player: 'p1', top: [], away: [top] })
    expect(r.state.objects[top]!.zone).toBe('graveyard')
    expect(r.state.stack).toEqual([])
  })

  it('Thraben Inspector investigates; the Clue draws a card when sacrificed', () => {
    let [r, inspector] = put(start(), 'p1', 'Thraben Inspector', 'hand')
    r = resolveTo(step(r, { type: 'castSpell', player: 'p1', objectId: inspector }), 0)
    const clue = r.state.battlefield.find((id) => r.state.objects[id]!.card.name === 'Clue')!
    expect(r.state.objects[clue]!.card.rules!.activated).toHaveLength(1)
    const before = r.state.zones.p1!.hand.length
    r = resolveTo(step(r, { type: 'activateAbility', player: 'p1', objectId: clue, index: 0 }), 0)
    expect(r.state.objects[clue]).toBeUndefined() // a token that leaves ceases to exist
    expect(r.state.zones.p1!.hand.length).toBe(before + 1)
  })

  it('replays to the same state, the choice included', () => {
    const begin = start()
    let [r, growth] = put(begin, 'p1', 'Rampant Growth', 'hand')
    r = resolveTo(step(r, { type: 'castSpell', player: 'p1', objectId: growth }), 0)
    const land = r.state.pending?.kind === 'searchLibrary' ? r.state.pending.cards[2]! : ''
    r = step(r, { type: 'searchLibrary', player: 'p1', objectIds: [land] })
    const again = replay(begin.state, r.actions)
    expect(again.ok && again.state).toEqual(r.state)
  })
})
