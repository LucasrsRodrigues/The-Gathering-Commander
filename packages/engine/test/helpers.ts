import { expect } from 'vitest'
import { createGame, reduce, STEPS } from '../src'
import type { Action, CardRef, GameConfig, GameEvent, GameState, Ruleset } from '../src'

export const LAND: CardRef = { name: 'Test Land', typeLine: 'Basic Land — Forest' }
export const CREATURE: CardRef = { name: 'Test Bear', typeLine: 'Creature — Bear' }
export const INSTANT: CardRef = { name: 'Test Bolt', typeLine: 'Instant' }
export const COMMANDER: CardRef = { name: 'Test Commander', typeLine: 'Legendary Creature — Human' }

export function deck(size = 99) {
  const cards = Array.from({ length: size }, (_, i) => (i % 3 === 0 ? LAND : i % 3 === 1 ? CREATURE : INSTANT))
  return { commanders: [COMMANDER], cards }
}

export function newGame(players = 4, opts: { seed?: number; ruleset?: Partial<Ruleset>; deckSize?: number } = {}) {
  const config: GameConfig = {
    seed: opts.seed ?? 42,
    startingPlayer: 'p1',
    // Most tests exercise the sandbox mechanics; turn-rule tests ask for their level explicitly.
    ruleset: { timingRules: 'off', manaRules: 'off', combatRules: 'off', ...opts.ruleset },
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `Jogador ${i + 1}`, deck: deck(opts.deckSize) })),
  }
  return stopEverywhere(createGame(config))
}

// Most tests walk the turn step by step: players stop everywhere (no automatic passing) unless a test says otherwise.
export function stopEverywhere(state: GameState): GameState {
  const all = [...STEPS]
  const players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p, stops: { own: all, others: all, passAfterOwnSpell: false } }]))
  return { ...state, players }
}

export function act(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const result = reduce(state, action)
  if (!result.ok) throw new Error(`${action.type} falhou: ${result.error.code} ${result.error.message}`)
  return { state: result.state, events: result.events }
}

export function expectError(state: GameState, action: Action, code: string) {
  const result = reduce(state, action)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe(code)
}

// Everyone keeps their opening hand: the game is then in turn 1, upkeep of p1.
export function keepAll(state: GameState): GameState {
  let s = state
  while (s.status === 'mulligan' && s.pending) s = act(s, { type: 'keepHand', player: s.pending.player }).state
  return s
}

export function started(players = 4, opts: Parameters<typeof newGame>[1] = {}) {
  return keepAll(newGame(players, opts))
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

export function handOf(state: GameState, player: string) {
  return state.zones[player]!.hand
}

export function firstInHand(state: GameState, player: string, typePrefix: string) {
  const id = handOf(state, player).find((id) => state.objects[id]!.card.typeLine?.startsWith(typePrefix))
  if (!id) throw new Error(`sem ${typePrefix} na mão de ${player}`)
  return id
}
