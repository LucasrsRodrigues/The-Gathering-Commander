// What the table and HUD need from a game session. Implemented by the local session (engine in the
// browser: goldfish, hot-seat) and by the online session (server is authoritative).

import type { ActionIntent, GameError, PlayerId, PlayerView } from '@gathering-hall/engine'

export interface LogEntry {
  id: number
  text: string
}

export type ConnectionStatus = 'local' | 'connecting' | 'online' | 'offline'

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
  connection(): ConnectionStatus
  presence(): PlayerId[] | null // connected players online; null when local
}
