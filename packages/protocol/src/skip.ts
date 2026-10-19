// Skipping a player who left (online): when the game waits on a decision from someone who is disconnected,
// the host may answer it for them with the default answer, once they have been away for SKIP_AFTER_MS.
// Shared by the server (which enforces it) and the web (which shows the button).

import type { PendingDecision, PlayerId, PriorityState } from '@gathering-hall/engine'

export const SKIP_AFTER_MS = 30_000

// What the default answer was, for the log.
export type SkipDecision = PendingDecision['kind'] | 'priority'

export interface WaitingGame {
  status: 'mulligan' | 'playing' | 'ended'
  seats: PlayerId[]
  players: Record<PlayerId, { lost: boolean }>
  pending: PendingDecision | null
  priority: PriorityState | null
}

// The players the game is waiting on right now, and for what.
export function waitingOn(game: WaitingGame): { player: PlayerId; decision: SkipDecision }[] {
  if (game.status === 'ended') return []
  const pending = game.pending
  if (pending?.kind === 'exception') {
    return game.seats
      .filter((id) => id !== pending.player && !game.players[id]?.lost && !pending.approvals.includes(id))
      .map((player) => ({ player, decision: 'exception' }))
  }
  if (pending?.kind === 'declareBlockers') return pending.players.map((player) => ({ player, decision: 'declareBlockers' }))
  if (pending) return [{ player: pending.player, decision: pending.kind }]
  if (game.priority) return [{ player: game.priority.player, decision: 'priority' }]
  return []
}
