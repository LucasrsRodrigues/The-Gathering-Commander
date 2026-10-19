import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, reduce, type Action, type CardRef, type CardRules, type GameState, type Keyword, type OracleFacts } from '../src'
import { act, keepAll } from './helpers'

const FIXTURE: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'oracle.json'), 'utf8'))
const card = (name: string): CardRef => {
  const facts = FIXTURE.find((f) => f.name === name)!
  return { name, typeLine: facts.typeLine, rules: deriveCardRules(facts) }
}
const creature = (name: string, power: number, toughness: number, keywords: Keyword[] = []): CardRef => {
  const rules: CardRules = { types: ['creature'], supertypes: [], subtypes: [], cost: null, power, toughness, loyalty: null, keywords, manaAbilities: [], colorIdentity: [] }
  return { name, typeLine: 'Creature — Test', rules }
}
const BOARD: Record<string, CardRef[]> = {
  p1: [card('Serra Angel'), creature('Bear', 2, 2), creature('Brute', 3, 3, ['menace']), creature('Wall', 0, 4, ['defender'])],
  p2: [creature('Ranger', 1, 3, ['reach']), creature('Pup', 1, 1), creature('Cub', 1, 1)],
  p3: [creature('Guard', 2, 2)],
}

// p1's second turn, at declare attackers; every board creature has been there since before it.
function game(players = 2, opts: { approval?: 'auto' | 'vote' } = {}): GameState {
  const seats = ['p1', 'p2', 'p3'].slice(0, players)
  let s = keepAll(createGame({
    seed: 3, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'off', combatRules: 'block' }, options: { exceptionApproval: opts.approval ?? 'auto' },
    players: seats.map((id) => ({ id, name: id, deck: { commanders: [card('Krenko, Mob Boss')], cards: [...BOARD[id]!, card('Questing Beast'), ...Array(40).fill(card('Wastes'))] } })),
  }))
  for (const p of seats) {
    for (const ref of BOARD[p]!) {
      const id = Object.values(s.objects).find((o) => o.owner === p && o.card.name === ref.name && o.zone !== 'battlefield')!.id
      s = act(s, { type: 'moveObject', player: p, objectId: id, to: 'battlefield' }).state
    }
  }
  for (let turns = 0; turns < players; turns++) s = nextTurn(s)
  return toAttackers(s)
}

function step(s: GameState): GameState {
  if (s.pending?.kind === 'declareAttackers') return act(s, { type: 'declareAttackers', player: s.pending.player, attacks: [] }).state
  if (s.pending?.kind === 'declareBlockers') return act(s, { type: 'declareBlockers', player: s.pending.player, blocks: [] }).state
  return act(s, { type: 'advanceStep', player: s.turn.active }).state
}
function nextTurn(s: GameState): GameState {
  const turn = s.turn.number
  while (s.turn.number === turn) s = step(s)
  return s
}
function toAttackers(s: GameState): GameState {
  while (s.pending?.kind !== 'declareAttackers') s = act(s, { type: 'advanceStep', player: s.turn.active }).state
  return s
}
const id = (s: GameState, owner: string, name: string) => Object.values(s.objects).find((o) => o.owner === owner && o.card.name === name)!.id
const codeOf = (s: GameState, a: Action) => {
  const r = reduce(s, a)
  return r.ok ? 'ok' : (r.error.findings?.[0]?.code ?? r.error.code)
}

describe('declaring attackers (CR 508)', () => {
  it('the step waits for the active player and nothing else happens meanwhile', () => {
    const s = game()
    expect(s.pending).toEqual({ kind: 'declareAttackers', player: 'p1' })
    expect(s.priority).toBeNull()
    expect(codeOf(s, { type: 'draw', player: 'p1', count: 1 })).toBe('notYourDecision')
    expect(codeOf(s, { type: 'declareAttackers', player: 'p2', attacks: [] })).toBe('notYourDecision')
  })

  it('attacking taps the creature unless it has Vigilance; priority comes back to the attacker', () => {
    const s = game()
    const angel = id(s, 'p1', 'Serra Angel')
    const bear = id(s, 'p1', 'Bear')
    const { state, events } = act(s, { type: 'declareAttackers', player: 'p1', attacks: [{ attacker: angel, target: 'p2' }, { attacker: bear, target: 'p2' }] })
    expect(state.objects[angel]!.tapped).toBe(false)
    expect(state.objects[bear]!.tapped).toBe(true)
    expect(state.turn.combat?.attacks).toHaveLength(2)
    expect(state.priority?.player).toBe('p1')
    expect(events).toContainEqual(expect.objectContaining({ type: 'attackersDeclared', player: 'p1' }))
  })

  it('no attackers skips blockers and damage (CR 508.8)', () => {
    const s = act(game(), { type: 'declareAttackers', player: 'p1', attacks: [] }).state
    expect(s.turn.step).toBe('endCombat')
  })

  it('Defender and summoning sickness stop attacks; Haste does not', () => {
    let s = game()
    expect(codeOf(s, { type: 'declareAttackers', player: 'p1', attacks: [{ attacker: id(s, 'p1', 'Wall'), target: 'p2' }] })).toBe('defender')
    s = { ...s, pending: null }
    const beast = Object.values(s.objects).find((o) => o.owner === 'p1' && o.card.name === 'Questing Beast')!.id
    const bear2 = s.zones.p1!.library.find((o) => s.objects[o]!.card.name === 'Wastes')!
    s = act({ ...s, priority: { player: 'p1', passed: [] } }, { type: 'moveObject', player: 'p1', objectId: beast, to: 'battlefield' }).state
    s = { ...s, pending: { kind: 'declareAttackers', player: 'p1' }, priority: null }
    expect(codeOf(s, { type: 'declareAttackers', player: 'p1', attacks: [{ attacker: beast, target: 'p2' }] })).toBe('ok') // Haste
    s = { ...s, objects: { ...s.objects, [beast]: { ...s.objects[beast]!, card: creature('Fresh', 2, 2) } } }
    expect(codeOf(s, { type: 'declareAttackers', player: 'p1', attacks: [{ attacker: beast, target: 'p2' }] })).toBe('summoningSick')
    expect(bear2).toBeDefined()
  })

  it('only your creatures, only at opponents', () => {
    const s = game()
    expect(codeOf(s, { type: 'declareAttackers', player: 'p1', attacks: [{ attacker: id(s, 'p1', 'Bear'), target: 'p1' }] })).toBe('invalidAction')
    expect(codeOf(s, { type: 'declareAttackers', player: 'p1', attacks: [{ attacker: id(s, 'p2', 'Pup'), target: 'p2' }] })).toBe('invalidAction')
  })

  it('a creature that should not attack can, as an approved exception', () => {
    const s = game(2, { approval: 'vote' })
    const wall = id(s, 'p1', 'Wall')
    const request: Action = { type: 'requestException', player: 'p1', action: { type: 'declareAttackers', attacks: [{ attacker: wall, target: 'p2' }] }, reason: 'Efeito sem script' }
    const asked = act(s, request).state
    expect(asked.pending).toMatchObject({ kind: 'exception', resume: { kind: 'declareAttackers' } })
    expect(act(asked, { type: 'answerException', player: 'p2', approve: false }).state.pending).toEqual({ kind: 'declareAttackers', player: 'p1' })
    expect(act(asked, { type: 'answerException', player: 'p2', approve: true }).state.turn.combat?.attacks).toEqual([{ attacker: wall, target: 'p2' }])
  })
})

describe('declaring blockers (CR 509)', () => {
  function attacked(players: number, attacks: (s: GameState) => { attacker: string; target: string }[]) {
    let s = game(players)
    s = act(s, { type: 'declareAttackers', player: 'p1', attacks: attacks(s) }).state
    return act(s, { type: 'advanceStep', player: 'p1' }).state
  }

  it('only attacked players declare, one after another', () => {
    const s = attacked(3, (g) => [{ attacker: id(g, 'p1', 'Bear'), target: 'p2' }, { attacker: id(g, 'p1', 'Brute'), target: 'p3' }])
    expect(s.pending).toEqual({ kind: 'declareBlockers', player: 'p2', players: ['p2', 'p3'] })
    const after = act(s, { type: 'declareBlockers', player: 'p3', blocks: [] }).state
    expect(after.pending).toEqual({ kind: 'declareBlockers', player: 'p2', players: ['p2'] })
    const done = act(after, { type: 'declareBlockers', player: 'p2', blocks: [{ blocker: id(s, 'p2', 'Pup'), attacker: id(s, 'p1', 'Bear') }] }).state
    expect(done.pending).toBeNull()
    expect(done.priority?.player).toBe('p1')
    expect(done.turn.combat?.damageOrder).toEqual({ [id(s, 'p1', 'Bear')]: [id(s, 'p2', 'Pup')] })
  })

  it('Flying needs Flying or Reach to block; Menace needs two blockers', () => {
    const s = attacked(2, (g) => [{ attacker: id(g, 'p1', 'Serra Angel'), target: 'p2' }, { attacker: id(g, 'p1', 'Brute'), target: 'p2' }])
    const [angel, brute, ranger, pup, cub] = [id(s, 'p1', 'Serra Angel'), id(s, 'p1', 'Brute'), id(s, 'p2', 'Ranger'), id(s, 'p2', 'Pup'), id(s, 'p2', 'Cub')]
    expect(codeOf(s, { type: 'declareBlockers', player: 'p2', blocks: [{ blocker: pup, attacker: angel }] })).toBe('flying')
    expect(codeOf(s, { type: 'declareBlockers', player: 'p2', blocks: [{ blocker: ranger, attacker: angel }] })).toBe('ok')
    expect(codeOf(s, { type: 'declareBlockers', player: 'p2', blocks: [{ blocker: pup, attacker: brute }] })).toBe('menace')
    expect(codeOf(s, { type: 'declareBlockers', player: 'p2', blocks: [{ blocker: pup, attacker: brute }, { blocker: cub, attacker: brute }] })).toBe('ok')
  })

  it('cannot block twice, block for someone else, or block what is not attacking', () => {
    const s = attacked(3, (g) => [{ attacker: id(g, 'p1', 'Bear'), target: 'p2' }])
    const [bear, pup] = [id(s, 'p1', 'Bear'), id(s, 'p2', 'Pup')]
    expect(codeOf(s, { type: 'declareBlockers', player: 'p2', blocks: [{ blocker: pup, attacker: bear }, { blocker: pup, attacker: bear }] })).toBe('invalidAction')
    expect(codeOf(s, { type: 'declareBlockers', player: 'p3', blocks: [] })).toBe('notYourDecision')
    expect(codeOf(s, { type: 'declareBlockers', player: 'p2', blocks: [{ blocker: pup, attacker: id(s, 'p1', 'Brute') }] })).toBe('invalidAction')
  })

  it('a player with nothing untapped to block with is not asked', () => {
    let s = game(2)
    for (const name of ['Ranger', 'Pup', 'Cub']) s = { ...s, objects: { ...s.objects, [id(s, 'p2', name)]: { ...s.objects[id(s, 'p2', name)]!, tapped: true } } }
    s = act(s, { type: 'declareAttackers', player: 'p1', attacks: [{ attacker: id(s, 'p1', 'Bear'), target: 'p2' }] }).state
    s = act(s, { type: 'advanceStep', player: 'p1' }).state
    expect(s.turn.step).toBe('declareBlockers')
    expect(s.pending).toBeNull()
    expect(s.priority?.player).toBe('p1')
  })
})
