// What the table and HUD need from a game session. Implemented by the local session (engine in the
// browser: goldfish, hot-seat) and by the online session (server is authoritative).

import type { ActionIntent, GameError, PlayerId, PlayerView } from '@gathering-hall/engine'

export interface LogEntry {
  id: number
  text: string
}

export type ConnectionStatus = 'local' | 'connecting' | 'online' | 'offline'

// An action a house rule blocked (épico 09): the table offers "Fazer mesmo assim" for it.
export interface BlockedAction {
  action: ActionIntent
  error: GameError
}

export interface GameSessionPort {
  subscribe(listener: () => void): () => void
  getVersion(): number
  view(): PlayerView
  seat(): PlayerId // perspective at the table (a spectator watches from the first seat)
  needsCurtain(): boolean
  confirmSeat(): void
  // Local sessions answer errors right away; online ones return null and report refusals via onError.
  dispatch(action: ActionIntent): GameError | null
  canUndo(): boolean
  undo(): boolean
  getLog(): LogEntry[]
  blocked(): BlockedAction | null
  dismissBlocked(): void
  connection(): ConnectionStatus
  presence(): PlayerId[] | null // connected players online; null when local
}
