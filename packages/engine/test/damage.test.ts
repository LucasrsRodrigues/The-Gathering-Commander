import { describe, expect, it } from 'vitest'
import { createGame, reduce, type Action, type Attack, type Block, type CardRef, type CardRules, type DamageAssignment, type GameState, type Keyword } from '../src'
import { nextRandom } from '../src/rng'
import { act, keepAll } from './helpers'

const creature = (name: string, power: number, toughness: number, keywords: Keyword[] = []): CardRef => {
  const rules: CardRules = { types: ['creature'], supertypes: [], subtypes: [], cost: null, power, toughness, loyalty: null, keywords, manaAbilities: [], colorIdentity: [] }
  return { name, typeLine: 'Creature — Test', rules }
}
const BOSS = { ...creature('Boss', 3, 3), typeLine: 'Legendary Creature — Test' }

// p1 attacks with `mine`, p2 defends with `theirs`; returns p1's second turn at declare attackers.
function game(mine: CardRef[], theirs: CardRef[], opts: { commanderOnBoard?: boolean } = {}): GameState {
  let s = keepAll(createGame({
    seed: 5, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules: 'off', combatRules: 'block' },
    players: [
      { id: 'p1', name: 'Ana', deck: { commanders: [BOSS], cards: [...mine, ...Array(30).fill(creature('Filler', 0, 1))] } },
      { id: 'p2', name: 'Bia', deck: { commanders: [BOSS], cards: [...theirs, ...Array(30).fill(creature('Filler', 0, 1))] } },
    ],
  }))
  const put = (owner: string, name: string) => {
    const id = Object.values(s.objects).find((o) => o.owner === owner && o.card.name === name && o.zone !== 'battlefield')!.id
    s = act(s, { type: 'moveObject', player: owner, objectId: id, to: 'battlefield' }).state
  }
  mine.forEach((c) => put('p1', c.name))
  theirs.forEach((c) => put('p2', c.name))
  if (opts.commanderOnBoard) put('p1', 'Boss')
  for (let t = 0; t < 2; t++) {
    const turn = s.turn.number
    while (s.turn.number === turn) {
      if (s.pending?.kind === 'declareAttackers') s = act(s, { type: 'declareAttackers', player: s.pending.player, attacks: [] }).state
      else s = act(s, { type: 'advanceStep', player: s.turn.active }).state
    }
  }
  while (s.pending?.kind !== 'declareAttackers') s = act(s, { type: 'advanceStep', player: 'p1' }).state
  return s
}

const id = (s: GameState, owner: string, name: string) => Object.values(s.objects).find((o) => o.owner === owner && o.card.name === name && o.zone === 'battlefield')!.id

// Declares, blocks and walks to the damage confirmation.
function fight(s: GameState, attacks: (s: GameState) => Attack[], blocks: (s: GameState) => Block[] = () => []): GameState {
  s = act(s, { type: 'declareAttackers', player: 'p1', attacks: attacks(s) }).state
  s = act(s, { type: 'advanceStep', player: 'p1' }).state
  if (s.pending?.kind === 'declareBlockers') s = act(s, { type: 'declareBlockers', player: 'p2', blocks: blocks(s) }).state
  return act(s, { type: 'advanceStep', player: 'p1' }).state
}
const proposal = (s: GameState) => (s.pending?.kind === 'confirmDamage' ? s.pending.proposal : null)
const confirm = (s: GameState, assignments = proposal(s)!.assignments) => act(s, { type: 'assignDamage', player: 'p1', assignments }).state
const codeOf = (s: GameState, a: Action) => {
  const r = reduce(s, a)
  return r.ok ? 'ok' : (r.error.findings?.[0]?.code ?? r.error.code)
}
const zone = (s: GameState, owner: string, name: string) => Object.values(s.objects).find((o) => o.owner === owner && o.card.name === name && o.zone !== 'library' && o.zone !== 'hand')?.zone

describe('combat damage (CR 510)', () => {
  it('unblocked attackers hit the player; the active player confirms', () => {
    let s = fight(game([creature('Bear', 2, 2)], []), (g) => [{ attacker: id(g, 'p1', 'Bear'), target: 'p2' }])
    expect(proposal(s)).toEqual({ phase: 'regular', assignments: [{ source: id(s, 'p1', 'Bear'), to: 'p2', amount: 2 }] })
    s = confirm(s)
    expect(s.players.p2!.life).toBe(38)
    expect(s.priority?.player).toBe('p1')
  })

  it('attacker and blocker damage each other; lethal damage kills', () => {
    let s = game([creature('Bear', 2, 2)], [creature('Pup', 1, 1)])
    s = confirm(fight(s, (g) => [{ attacker: id(g, 'p1', 'Bear'), target: 'p2' }], (g) => [{ blocker: id(g, 'p2', 'Pup'), attacker: id(g, 'p1', 'Bear') }]))
    expect(zone(s, 'p2', 'Pup')).toBe('graveyard')
    expect(s.objects[id(s, 'p1', 'Bear')]!.damage).toBe(1)
    expect(s.players.p2!.life).toBe(40)
  })

  it('Trample with Deathtouch needs only 1 on each blocker', () => {
    const s = fight(game([creature('Wurm', 4, 4, ['trample', 'deathtouch'])], [creature('Wall', 0, 6)]),
      (g) => [{ attacker: id(g, 'p1', 'Wurm'), target: 'p2' }], (g) => [{ blocker: id(g, 'p2', 'Wall'), attacker: id(g, 'p1', 'Wurm') }])
    expect(proposal(s)!.assignments.filter((a) => a.source === id(s, 'p1', 'Wurm'))).toEqual([
      { source: id(s, 'p1', 'Wurm'), to: id(s, 'p2', 'Wall'), amount: 1 },
      { source: id(s, 'p1', 'Wurm'), to: 'p2', amount: 3 },
    ])
    const after = confirm(s)
    expect(zone(after, 'p2', 'Wall')).toBe('graveyard')
    expect(after.players.p2!.life).toBe(37)
  })

  it('the attacker may reorder damage within the rules, never beyond them', () => {
    const s = fight(game([creature('Ogre', 3, 3)], [creature('Pup', 1, 1), creature('Cub', 1, 1)]),
      (g) => [{ attacker: id(g, 'p1', 'Ogre'), target: 'p2' }],
      (g) => [{ blocker: id(g, 'p2', 'Pup'), attacker: id(g, 'p1', 'Ogre') }, { blocker: id(g, 'p2', 'Cub'), attacker: id(g, 'p1', 'Ogre') }])
    const [ogre, pup, cub] = [id(s, 'p1', 'Ogre'), id(s, 'p2', 'Pup'), id(s, 'p2', 'Cub')]
    const blockers = proposal(s)!.assignments.filter((a) => a.source !== ogre)
    const withOgre = (parts: DamageAssignment[]) => ({ type: 'assignDamage' as const, player: 'p1', assignments: [...parts, ...blockers] })
    expect(codeOf(s, withOgre([{ source: ogre, to: pup, amount: 2 }, { source: ogre, to: cub, amount: 1 }]))).toBe('ok')
    expect(codeOf(s, withOgre([{ source: ogre, to: pup, amount: 0 }, { source: ogre, to: cub, amount: 3 }]))).toBe('damageAssignment')
    expect(codeOf(s, withOgre([{ source: ogre, to: pup, amount: 1 }, { source: ogre, to: cub, amount: 1 }, { source: ogre, to: 'p2', amount: 1 }]))).toBe('damageAssignment')
    expect(codeOf(s, withOgre([{ source: ogre, to: pup, amount: 1 }]))).toBe('damageAssignment') // less than its power
    expect(codeOf(s, withOgre([{ source: ogre, to: id(s, 'p1', 'Ogre'), amount: 3 }]))).toBe('invalidSelection')
  })

  it('first strike deals damage first: the blocker dies before striking back', () => {
    let s = fight(game([creature('Knight', 2, 2, ['firstStrike'])], [creature('Bear', 2, 2)]),
      (g) => [{ attacker: id(g, 'p1', 'Knight'), target: 'p2' }], (g) => [{ blocker: id(g, 'p2', 'Bear'), attacker: id(g, 'p1', 'Knight') }])
    expect(proposal(s)!.phase).toBe('first')
    s = confirm(s)
    expect(zone(s, 'p2', 'Bear')).toBe('graveyard')
    s = act(s, { type: 'advanceStep', player: 'p1' }).state // the regular damage step: nothing left to deal
    expect(s.turn.step).toBe('combatDamage')
    expect(s.pending).toBeNull()
    expect(s.objects[id(s, 'p1', 'Knight')]!.damage).toBe(0)
  })

  it('double strike deals damage in both steps; Lifelink gains that much', () => {
    let s = fight(game([creature('Duelist', 2, 2, ['doubleStrike', 'lifelink'])], []), (g) => [{ attacker: id(g, 'p1', 'Duelist'), target: 'p2' }])
    s = confirm(s)
    s = act(s, { type: 'advanceStep', player: 'p1' }).state
    expect(proposal(s)!.phase).toBe('regular')
    s = confirm(s)
    expect(s.players.p2!.life).toBe(36)
    expect(s.players.p1!.life).toBe(44)
  })

  it('a commander\'s combat damage counts toward 21 automatically', () => {
    let s = game([], [], { commanderOnBoard: true })
    const boss = id(s, 'p1', 'Boss')
    s = confirm(fight(s, () => [{ attacker: boss, target: 'p2' }]))
    expect(s.players.p2).toMatchObject({ life: 37, commanderDamage: { [boss]: 3 } })
  })

  it('preventing damage is an exception the others approve', () => {
    const s = fight(game([creature('Bear', 2, 2)], []), (g) => [{ attacker: id(g, 'p1', 'Bear'), target: 'p2' }])
    const bear = id(s, 'p1', 'Bear')
    const prevented = act(s, { type: 'requestException', player: 'p1', action: { type: 'assignDamage', assignments: [{ source: bear, to: 'p2', amount: 0 }] }, reason: 'Fog' }).state
    expect(prevented.players.p2!.life).toBe(40)
  })
})

describe('the proposed damage is always legal (fitness function)', () => {
  it('random fights: the proposal is accepted and each source deals exactly its power', () => {
    const pool = [
      creature('A1', 1, 1), creature('A2', 3, 2, ['trample']), creature('A3', 2, 4, ['deathtouch']), creature('A4', 4, 4, ['firstStrike']),
      creature('A5', 5, 3, ['trample', 'deathtouch']), creature('A6', 2, 2, ['doubleStrike']),
    ]
    const blockersPool = [creature('B1', 1, 1), creature('B2', 2, 3), creature('B3', 0, 5), creature('B4', 3, 3, ['firstStrike']), creature('B5', 1, 4, ['deathtouch'])]
    for (let seed = 1; seed <= 12; seed++) {
      let rng = seed
      const rand = () => { const [r, n] = nextRandom(rng); rng = n; return r }
      let s = game(pool, blockersPool)
      const attackers = pool.filter(() => rand() < 0.7).map((c) => id(s, 'p1', c.name))
      if (!attackers.length) continue
      s = act(s, { type: 'declareAttackers', player: 'p1', attacks: attackers.map((a) => ({ attacker: a, target: 'p2' })) }).state
      s = act(s, { type: 'advanceStep', player: 'p1' }).state
      if (s.pending?.kind === 'declareBlockers') {
        const blocks = blockersPool.filter(() => rand() < 0.7).map((c) => ({ blocker: id(s, 'p2', c.name), attacker: attackers[Math.floor(rand() * attackers.length)]! }))
        s = act(s, { type: 'declareBlockers', player: 'p2', blocks }).state
      }
      s = act(s, { type: 'advanceStep', player: 'p1' }).state
      for (let guard = 0; guard < 3 && s.turn.step === 'combatDamage'; guard++) {
        const p = proposal(s)
        if (p) {
          for (const source of new Set(p.assignments.map((a) => a.source))) {
            const total = p.assignments.filter((a) => a.source === source).reduce((n, a) => n + a.amount, 0)
            const obj = s.objects[source]!
            expect(total, `${obj.card.name} seed ${seed}`).toBe(obj.card.rules!.power)
          }
          expect(codeOf(s, { type: 'assignDamage', player: 'p1', assignments: p.assignments }), `seed ${seed}`).toBe('ok')
          s = confirm(s)
        }
        s = act(s, { type: 'advanceStep', player: 'p1' }).state
      }
    }
  })
})
