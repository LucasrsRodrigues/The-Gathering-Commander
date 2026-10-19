import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, planPayment, reduce, type CardRef, type GameState, type OracleFacts } from '../src'
import { act, keepAll } from './helpers'

const FIXTURE: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'oracle.json'), 'utf8'))
const card = (name: string): CardRef => {
  const facts = FIXTURE.find((f) => f.name === name)!
  return { name, typeLine: facts.typeLine, rules: deriveCardRules(facts) }
}

// p1 (Krenko, red identity) in main 1 with `board` on the battlefield (since an earlier turn) and `hand` in hand.
function game(board: string[], hand: string[] = ['Krenko, Mob Boss']): GameState {
  const names = [...board, ...hand.filter((n) => n !== 'Krenko, Mob Boss')]
  const deck = { commanders: [card('Krenko, Mob Boss')], cards: [...names.map(card), ...Array(40).fill(card('Wastes'))] }
  let s = keepAll(createGame({ seed: 2, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'block' }, players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }] }))
  const free = (name: string) => Object.values(s.objects).find((o) => o.owner === 'p1' && o.card.name === name && (o.zone === 'library' || o.zone === 'hand'))!.id
  for (const name of board) s = act(s, { type: 'moveObject', player: 'p1', objectId: free(name), to: 'battlefield' }).state
  for (const name of hand) if (name !== 'Krenko, Mob Boss') s = act(s, { type: 'moveObject', player: 'p1', objectId: free(name), to: 'hand' }).state
  // Two turns later every creature on the board has been there since p1's turn began.
  for (let turn = 0; turn < 2; turn++) {
    const active = s.turn.active
    while (s.turn.active === active) s = act(s, { type: 'advanceStep', player: s.turn.active }).state
  }
  while (s.turn.step !== 'main1') s = act(s, { type: 'advanceStep', player: 'p1' }).state
  return s
}
const idOf = (s: GameState, name: string) => Object.values(s.objects).find((o) => o.owner === 'p1' && o.card.name === name)!.id
const tapped = (s: GameState, plan: { objectId: string }[]) => plan.map((a) => s.objects[a.objectId]!.card.name).sort()

describe('planPayment (automatic payment)', () => {
  it('pays the commander with the right sources and casts in one action', () => {
    const s = game(['Command Tower', 'Arcane Signet', 'Sol Ring', 'Forest', 'Forest'])
    const krenko = idOf(s, 'Krenko, Mob Boss')
    const plan = planPayment(s, 'p1', krenko)!
    expect(tapped(s, plan)).toEqual(['Arcane Signet', 'Command Tower', 'Sol Ring'])
    const after = act(s, { type: 'castSpell', player: 'p1', objectId: krenko, payWith: plan }).state
    expect(after.objects[krenko]!.zone).toBe('stack')
    expect(Object.values(after.players.p1!.manaPool).every((n) => n === 0)).toBe(true)
  })

  it('spends inflexible and painless sources first', () => {
    const s = game(['City of Brass', 'Command Tower'], ['Lightning Bolt'])
    expect(tapped(s, planPayment(s, 'p1', idOf(s, 'Lightning Bolt'))!)).toEqual(['Command Tower'])
    const t = game(['Caves of Koilos', 'Forest'], ['Lightning Bolt'])
    expect(planPayment(t, 'p1', idOf(t, 'Lightning Bolt'))).toBeNull() // nothing makes red
  })

  it('Signets are tapped after a source that pays their {1}', () => {
    const s = game(['Dimir Signet', 'Wastes'], ['Dark Ritual'])
    const plan = planPayment(s, 'p1', idOf(s, 'Dark Ritual'))!
    expect(plan.map((a) => s.objects[a.objectId]!.card.name)).toEqual(['Wastes', 'Dimir Signet'])
    expect(act(s, { type: 'castSpell', player: 'p1', objectId: idOf(s, 'Dark Ritual'), payWith: plan }).state.players.p1!.manaPool.U).toBe(1)
  })

  it('hybrid symbols take whichever color is there', () => {
    const s = game(['Forest', 'Forest', 'Sol Ring'], ['Kitchen Finks'])
    expect(planPayment(s, 'p1', idOf(s, 'Kitchen Finks'))).not.toBeNull()
  })

  it('a creature that just arrived is not used', () => {
    let s = game(['Command Tower', 'Sol Ring', 'Command Tower'])
    const elves = Object.values(s.objects).find((o) => o.owner === 'p1' && o.zone === 'library')!.id
    s = { ...s, objects: { ...s.objects, [elves]: { ...s.objects[elves]!, card: card('Llanowar Elves') } } }
    s = act(s, { type: 'moveObject', player: 'p1', objectId: elves, to: 'battlefield' }).state
    const plan = planPayment(s, 'p1', idOf(s, 'Krenko, Mob Boss'))
    expect(plan?.some((a) => a.objectId === elves)).toBeFalsy()
  })

  it('casting with payWith is all or nothing', () => {
    let s = game(['Command Tower', 'Arcane Signet', 'Sol Ring'])
    const krenko = idOf(s, 'Krenko, Mob Boss')
    const plan = planPayment(s, 'p1', krenko)!
    s = act(s, { type: 'tap', player: 'p1', objectId: plan[2]!.objectId }).state
    const result = reduce(s, { type: 'castSpell', player: 'p1', objectId: krenko, payWith: plan })
    expect(result.ok).toBe(false)
    expect(s.objects[plan[0]!.objectId]!.tapped).toBe(false)
  })

  it('stays fast with a big board', () => {
    const board = [...Array(12).fill('Forest'), ...Array(6).fill('Command Tower'), ...Array(6).fill('City of Brass'), ...Array(6).fill('Dimir Signet')]
    const s = game(board, ['Krenko, Mob Boss'])
    const krenko = idOf(s, 'Krenko, Mob Boss')
    const start = performance.now()
    for (let i = 0; i < 20; i++) planPayment(s, 'p1', krenko)
    expect((performance.now() - start) / 20).toBeLessThan(5)
  })
})
