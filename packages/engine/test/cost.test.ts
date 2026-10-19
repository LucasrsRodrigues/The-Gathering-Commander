import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, parseManaCost, reduce, type Action, type CardRef, type GameState, type ManaPool, type OracleFacts } from '../src'
import { findPayment } from '../src/cost'
import { act, keepAll } from './helpers'

const FIXTURE: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'oracle.json'), 'utf8'))
const card = (name: string): CardRef => {
  const facts = FIXTURE.find((f) => f.name === name)!
  return { name, typeLine: facts.typeLine, rules: deriveCardRules(facts) }
}
const pool = (p: Partial<ManaPool>): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...p })
const cost = (text: string) => parseManaCost(text)!

describe('findPayment (CR 107.4, 601.2f)', () => {
  it('colored and generic', () => {
    expect(findPayment(pool({ G: 4 }), cost('{2}{G}{G}'), 0, 0)).toMatchObject({ pool: pool({}), spent: { G: 4 }, life: 0 })
    expect(findPayment(pool({ G: 1, C: 3 }), cost('{2}{G}{G}'), 0, 0)).toBeNull()
    expect(findPayment(pool({ G: 2, C: 2, R: 1 }), cost('{2}{G}{G}'), 0, 0)?.pool).toEqual(pool({ R: 1 })) // colorless goes first
  })

  it('X and the commander tax add to the generic part', () => {
    expect(findPayment(pool({ R: 4 }), cost('{X}{R}'), 3, 0)).not.toBeNull()
    expect(findPayment(pool({ R: 4 }), cost('{X}{R}'), 4, 0)).toBeNull()
    expect(findPayment(pool({ R: 6 }), cost('{2}{R}{R}'), 0, 2)).not.toBeNull()
    expect(findPayment(pool({ R: 5 }), cost('{2}{R}{R}'), 0, 2)).toBeNull()
  })

  it('hybrid, two-brid and Phyrexian pick whatever works (mana before life)', () => {
    expect(findPayment(pool({ W: 2, C: 1 }), cost('{1}{G/W}{G/W}'), 0, 0)).not.toBeNull()
    expect(findPayment(pool({ G: 1, W: 1, C: 1 }), cost('{1}{G/W}{G/W}'), 0, 0)).not.toBeNull()
    expect(findPayment(pool({ C: 2 }), cost('{2/W}'), 0, 0)).not.toBeNull()
    expect(findPayment(pool({ U: 1 }), cost('{U/P}'), 0, 0)).toMatchObject({ spent: { U: 1 }, life: 0 })
    expect(findPayment(pool({}), cost('{U/P}'), 0, 0)).toMatchObject({ spent: {}, life: 2 })
  })
})

// Krenko ({2}{R}{R}) commanding; the hand gets whatever the test needs.
function game(manaRules: 'block' | 'warn' | 'off' = 'block'): GameState {
  const fireball: CardRef = { name: 'Test Fireball', typeLine: 'Sorcery', rules: { ...card('Lightning Bolt').rules!, types: ['sorcery'], cost: cost('{X}{R}') } }
  const deck = {
    commanders: [card('Krenko, Mob Boss')],
    cards: [card('Dark Ritual'), card('Ancestral Vision'), card('Lightning Bolt'), fireball, { name: 'Sem dados', typeLine: 'Artifact' }, ...Array(60).fill(card('Forest'))],
  }
  let s = keepAll(createGame({ seed: 4, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules }, players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }] }))
  for (const o of Object.values(s.objects)) {
    if (o.owner === 'p1' && o.zone === 'library' && o.card.name !== 'Forest') s = act(s, { type: 'moveObject', player: 'p1', objectId: o.id, to: 'hand' }).state
  }
  while (s.turn.step !== 'main1') s = act(s, { type: 'advanceStep', player: 'p1' }).state
  return s
}
const id = (s: GameState, name: string) => Object.values(s.objects).find((o) => o.owner === 'p1' && o.card.name === name)!.id
const withPool = (s: GameState, p: Partial<ManaPool>): GameState => ({ ...s, players: { ...s.players, p1: { ...s.players.p1!, manaPool: pool(p) } } })
const errorOf = (s: GameState, a: Action) => {
  const r = reduce(s, a)
  return r.ok ? 'ok' : (r.error.findings?.[0]?.code ?? r.error.code)
}

describe('casting pays the cost (CR 601.2f–h, 903.8)', () => {
  it('takes the cost from the pool and logs it', () => {
    const s = withPool(game(), { R: 2, C: 2 })
    const commander = id(s, 'Krenko, Mob Boss')
    const { state, events } = act(s, { type: 'castSpell', player: 'p1', objectId: commander })
    expect(state.players.p1!.manaPool).toEqual(pool({}))
    expect(events).toContainEqual(expect.objectContaining({ type: 'costPaid', cost: '{2}{R}{R}', mana: { R: 2, C: 2 } }))
  })

  it('the commander tax grows with each cast from the command zone', () => {
    let s = withPool(game(), { R: 4 })
    const commander = id(s, 'Krenko, Mob Boss')
    s = act(s, { type: 'castSpell', player: 'p1', objectId: commander }).state
    s = act(s, { type: 'moveObject', player: 'p1', objectId: commander, to: 'command' }).state
    const r = reduce(withPool(s, { R: 5 }), { type: 'castSpell', player: 'p1', objectId: commander })
    expect(!r.ok && r.error.message).toMatch(/\{4\}\{R\}\{R\}.*taxa de comandante \+2/)
    expect(errorOf(withPool(s, { R: 6 }), { type: 'castSpell', player: 'p1', objectId: commander })).toBe('ok')
  })

  it('X is paid as generic mana', () => {
    const s = withPool(game(), { R: 4 })
    const fireball = id(s, 'Test Fireball')
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: fireball, x: 4 })).toBe('notEnoughMana')
    expect(act(s, { type: 'castSpell', player: 'p1', objectId: fireball, x: 3 }).state.players.p1!.manaPool).toEqual(pool({}))
  })

  it('cards without a mana cost and cards without data', () => {
    const s = game()
    expect(errorOf(s, { type: 'castSpell', player: 'p1', objectId: id(s, 'Ancestral Vision') })).toBe('noManaCost')
    const { events } = act(s, { type: 'castSpell', player: 'p1', objectId: id(s, 'Sem dados') })
    expect(events).toContainEqual(expect.objectContaining({ type: 'manualCost' }))
  })

  it('warn casts anyway and logs it; off does not charge at all', () => {
    const warned = act(game('warn'), { type: 'castSpell', player: 'p1', objectId: id(game('warn'), 'Lightning Bolt') })
    expect(warned.events).toContainEqual(expect.objectContaining({ type: 'ruleBent', code: 'notEnoughMana' }))
    const off = withPool(game('off'), { R: 1 })
    const result = act(off, { type: 'castSpell', player: 'p1', objectId: id(off, 'Lightning Bolt') })
    expect(result.state.players.p1!.manaPool).toEqual(pool({ R: 1 }))
    expect(result.events.some((e) => e.type === 'costPaid')).toBe(false)
  })

  it('Dark Ritual adds {B}{B}{B} when it resolves', () => {
    let s = withPool(game(), { B: 1 })
    s = act(s, { type: 'castSpell', player: 'p1', objectId: id(s, 'Dark Ritual') }).state
    s = act(s, { type: 'passPriority', player: 'p1' }).state
    s = act(s, { type: 'passPriority', player: 'p2' }).state
    expect(s.players.p1!.manaPool).toEqual(pool({ B: 3 }))
  })
})
