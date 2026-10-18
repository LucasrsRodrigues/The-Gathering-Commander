import { reduce } from './reduce'
import type { Action, GameError, GameState } from './types'

export type ReplayResult =
  | { ok: true; state: GameState }
  | { ok: false; error: GameError; index: number; state: GameState }

// Re-applies a recorded list of actions. Same initial state + same actions = same final state.
export function replay(initial: GameState, actions: readonly Action[]): ReplayResult {
  let state = initial
  for (let i = 0; i < actions.length; i++) {
    const result = reduce(state, actions[i]!)
    if (!result.ok) return { ok: false, error: result.error, index: i, state }
    state = result.state
  }
  return { ok: true, state }
}
