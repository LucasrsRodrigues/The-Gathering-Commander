// Saved games from older engine versions (épico 09, req. 39). Online rooms keep their state on disk across deploys,
// so a game started before turn rules existed must keep opening — with the new rules switched off, so it does not
// start blocking actions halfway through.

import { emptyPool } from './create'
import { defaultStops } from './ruleset'
import { SCHEMA_VERSION, type GameState } from './types'

// Returns the state in the current schema, or null when it is not a game state this engine knows.
export function migrateState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const state = raw as { schemaVersion?: unknown }
  if (state.schemaVersion === SCHEMA_VERSION) return raw as GameState
  if (state.schemaVersion === 1) return fromV1(raw as V1State)
  return null
}

type V1State = Omit<GameState, 'schemaVersion' | 'options'> & { schemaVersion: 1 }

function fromV1(s: V1State): GameState {
  const players = Object.fromEntries(Object.entries(s.players).map(([id, p]) => [id, {
    ...p, manaPool: emptyPool(), landsPlayed: 0, lastTurnStarted: 0, stops: defaultStops(), passUntil: null,
  }]))
  const objects = Object.fromEntries(Object.entries(s.objects).map(([id, o]) => [id, {
    ...o, damage: 0, deathtouchDamage: false, controlledSince: 0, ptMods: [],
  }]))
  return {
    ...s,
    schemaVersion: SCHEMA_VERSION,
    ruleset: { ...s.ruleset, landsPerTurn: 1, timingRules: 'off', manaRules: 'off', combatRules: 'off' },
    options: { exceptionApproval: 'vote' },
    players,
    objects,
    turn: { ...s.turn, combat: null },
  } as GameState
}
