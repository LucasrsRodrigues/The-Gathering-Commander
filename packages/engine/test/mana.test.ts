import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, reduce, type Action, type CardRef, type GameEvent, type GameState, type OracleFacts } from '../src'
import { nextRandom } from '../src/rng'
import { act, keepAll } from './helpers'

const FIXTURE: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'oracle.json'), 'utf8'))
const card = (name: string): CardRef => {
  const facts = FIXTURE.find((f) => f.name === name)!
  return { name, typeLine: facts.typeLine, rules: deriveCardRules(facts) }
}
const SOURCES = ['Forest', 'Command Tower', 'Caves of Koilos', 'Mana Confluence', 'Llanowar Elves', 'Dimir Signet', 'Exotic Orchard', 'Sol Ring']

// Two players with Krenko (red identity); every source starts in p1's hand.
function game(manaRules: 'block' | 'warn' | 'off' = 'block'): GameState {
  const deck = { commanders: [card('Krenko, Mob Boss')], cards: [...SOURCES.map(card), ...Array(60).fill(card('Forest'))] }
  return keepAll(createGame({
    seed: 9, startingPlayer: 'p1', ruleset: { timingRules: 'off', manaRules, combatRules: 'off' },
    players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }],
  }))
}

// Puts the named source onto p1's battlefield (a free manual move with timing off).
function onBattlefield(state: GameState, name: string, player = 'p1'): [GameState, string] {
  const id = Object.values(state.objects).find((o) => o.owner === player && o.card.name === name && o.zone !== 'battlefield')!.id
  return [act(state, { type: 'moveObject', player, objectId: id, to: 'battlefield' }).state, id]
}

// Turns pass until it is `player`'s turn again (summoning sickness wears off).
function nextOwnTurn(state: GameState): GameState {
  let s = state
  const me = s.turn.active
  do s = act(s, { type: 'advanceStep', player: s.turn.active }).state
  while (s.turn.active === me)
  do s = act(s, { type: 'advanceStep', player: s.turn.active }).state
  while (s.turn.active !== me)
  return s
}

const errorOf = (s: GameState, a: Action) => {
  const r = reduce(s, a)
  return r.ok ? 'ok' : (r.error.findings?.[0]?.code ?? r.error.code)
}
const pool = (s: GameState, p = 'p1') => Object.fromEntries(Object.entries(s.players[p]!.manaPool).filter(([, n]) => n))

describe('mana abilities (CR 605)', () => {
  it('a basic land adds its mana; the pool empties when the step ends', () => {
    let [s, forest] = onBattlefield(game(), 'Forest')
    const { state, events } = act(s, { type: 'activateMana', player: 'p1', objectId: forest, abilityIndex: 0 })
    expect(pool(state)).toEqual({ G: 1 })
    expect(state.objects[forest]!.tapped).toBe(true)
    expect(events).toContainEqual({ type: 'manaAdded', player: 'p1', mana: { G: 1 }, source: forest })
    s = act(state, { type: 'advanceStep', player: 'p1' })
      .state
    expect(pool(s)).toEqual({})
  })

  it('Command Tower makes mana of the commander identity only', () => {
    const [s, tower] = onBattlefield(game(), 'Command Tower')
    expect(pool(act(s, { type: 'activateMana', player: 'p1', objectId: tower, abilityIndex: 0 }).state)).toEqual({ R: 1 })
    expect(errorOf(s, { type: 'activateMana', player: 'p1', objectId: tower, abilityIndex: 0, color: 'G' })).toBe('invalidAction')
  })

  it('pain lands: colorless for free, a color for 1 life; Mana Confluence pays life', () => {
    let [s, caves] = onBattlefield(game(), 'Caves of Koilos')
    expect(errorOf(s, { type: 'activateMana', player: 'p1', objectId: caves, abilityIndex: 1 })).toBe('invalidAction') // which color?
    const colored = act(s, { type: 'activateMana', player: 'p1', objectId: caves, abilityIndex: 1, color: 'B' }).state
    expect(pool(colored)).toEqual({ B: 1 })
    expect(colored.players.p1!.life).toBe(39)
    expect(act(s, { type: 'activateMana', player: 'p1', objectId: caves, abilityIndex: 0 }).state.players.p1!.life).toBe(40)
    let confluence: string
    ;[s, confluence] = onBattlefield(s, 'Mana Confluence')
    s = act(s, { type: 'activateMana', player: 'p1', objectId: confluence, abilityIndex: 0, color: 'U' }).state
    expect(s.players.p1!.life).toBe(39)
  })

  it('a new creature waits for its controller\'s next turn to tap for mana', () => {
    let [s, elves] = onBattlefield(game(), 'Llanowar Elves')
    expect(errorOf(s, { type: 'activateMana', player: 'p1', objectId: elves, abilityIndex: 0 })).toBe('summoningSick')
    s = nextOwnTurn(s)
    expect(pool(act(s, { type: 'activateMana', player: 'p1', objectId: elves, abilityIndex: 0 }).state)).toEqual({ G: 1 })
  })

  it('Signets take their extra cost from the pool', () => {
    let [s, signet] = onBattlefield(game(), 'Dimir Signet')
    expect(errorOf(s, { type: 'activateMana', player: 'p1', objectId: signet, abilityIndex: 0 })).toBe('notEnoughMana')
    let forest: string
    ;[s, forest] = onBattlefield(s, 'Forest')
    s = act(s, { type: 'activateMana', player: 'p1', objectId: forest, abilityIndex: 0 }).state
    s = act(s, { type: 'activateMana', player: 'p1', objectId: signet, abilityIndex: 0 }).state
    expect(pool(s)).toEqual({ U: 1, B: 1 })
  })

  it('unrecognized sources declare their mana; recognized ones cannot', () => {
    let [s, orchard] = onBattlefield(game(), 'Exotic Orchard')
    expect(errorOf(s, { type: 'activateMana', player: 'p1', objectId: orchard, abilityIndex: 0 })).toBe('invalidAction')
    const { state, events } = act(s, { type: 'declareMana', player: 'p1', objectId: orchard, mana: { W: 1 } })
    expect(pool(state)).toEqual({ W: 1 })
    expect(events).toContainEqual({ type: 'manaDeclared', player: 'p1', objectId: orchard })
    let ring: string
    ;[s, ring] = onBattlefield(s, 'Sol Ring')
    expect(errorOf(s, { type: 'declareMana', player: 'p1', objectId: ring, mana: { C: 5 } })).toBe('invalidAction')
    expect(errorOf(s, { type: 'declareMana', player: 'p1', objectId: orchard, mana: { C: 21 } })).toBe('invalidAmount')
  })

  it('only the controller taps, once, and without needing priority', () => {
    let [s, forest] = onBattlefield(game(), 'Forest', 'p2')
    expect(errorOf(s, { type: 'activateMana', player: 'p1', objectId: forest, abilityIndex: 0 })).toBe('notAllowed')
    s = act(s, { type: 'passPriority', player: 'p2' }).state // p1 holds priority now
    expect(s.priority?.player).toBe('p1')
    s = act(s, { type: 'activateMana', player: 'p2', objectId: forest, abilityIndex: 0 }).state
    expect(s.priority?.player).toBe('p1') // a mana ability does not take priority
    expect(errorOf(s, { type: 'activateMana', player: 'p2', objectId: forest, abilityIndex: 0 })).toBe('invalidAction')
  })

  it('with mana rules off, summoning sickness does not stop mana', () => {
    const [s, elves] = onBattlefield(game('off'), 'Llanowar Elves')
    expect(errorOf(s, { type: 'activateMana', player: 'p1', objectId: elves, abilityIndex: 0 })).toBe('ok')
  })
})

describe('conservation of mana (fitness function)', () => {
  it('the pool always equals the mana added since it last emptied', () => {
    for (const seed of [1, 2, 3]) {
      let s = game('warn')
      for (const name of SOURCES) s = onBattlefield(s, name)[0]
      let rng = seed
      const expected: Record<string, Record<string, number>> = { p1: {}, p2: {} }
      for (let i = 0; i < 80; i++) {
        const [r, next] = nextRandom(rng)
        rng = next
        const untapped = s.battlefield.filter((id) => !s.objects[id]!.tapped && s.objects[id]!.controller === 'p1')
        const id = untapped[Math.floor(r * untapped.length)]
        const action: Action = r < 0.15 || !id
          ? { type: 'advanceStep', player: s.turn.active }
          : s.objects[id]!.card.rules?.hasUnrecognizedMana
            ? { type: 'declareMana', player: 'p1', objectId: id, mana: { C: 2 } }
            : { type: 'activateMana', player: 'p1', objectId: id, abilityIndex: 0, color: 'R' }
        const result = reduce(s, action)
        if (!result.ok) continue
        for (const e of result.events as GameEvent[]) {
          if (e.type === 'manaEmptied') expected[e.player] = {}
          if (e.type === 'manaAdded') for (const [t, n] of Object.entries(e.mana)) expected[e.player]![t] = (expected[e.player]![t] ?? 0) + n
        }
        s = result.state
        // Signets spend from the pool: count what they took.
        if (action.type === 'activateMana' && s.objects[action.objectId]!.card.rules?.manaAbilities[0]?.extraCost) {
          expected.p1 = Object.fromEntries(Object.entries(s.players.p1!.manaPool).filter(([, n]) => n))
        }
        expect(pool(s, 'p1')).toEqual(Object.fromEntries(Object.entries(expected.p1!).filter(([, n]) => n)))
      }
    }
  })
})
