// Online protocol (v1). JSON over WebSocket. The server is authoritative: clients send intents,
// the server answers with views already filtered for that connection.

import type { ActionIntent, DeckInput, GameError, GameEvent, PlayerId, PlayerView } from '@gathering-hall/engine'
import type { Preset } from '@gathering-hall/formats'
import type { SkipDecision } from './skip'

export const PROTOCOL_VERSION = 1
export const MAX_MESSAGE_BYTES = 64 * 1024
export const MAX_SEATS = 4

// ---- client → server --------------------------------------------------------

export type ClientMessage =
  | { v: 1; t: 'hello'; room: string; token?: string; spectator?: boolean }
  | { v: 1; t: 'sit'; seat: number; name: string; deck: DeckInput }
  | { v: 1; t: 'stand' }
  | { v: 1; t: 'configure'; preset: Preset }
  | { v: 1; t: 'start' }
  | { v: 1; t: 'act'; seq: number; action: ActionIntent }
  | { v: 1; t: 'rematch' }
  | { v: 1; t: 'skip'; player: PlayerId } // host: answer for a player who left (skip.ts)
  | { v: 1; t: 'ping' }

// ---- server → client --------------------------------------------------------

export interface LobbySeat {
  index: number
  player: PlayerId // id the seat will have in the game: p1..p4
  name: string | null
  taken: boolean
  connected: boolean
  deckSize: number
  commanders: string[]
}

// A seated player who is disconnected, and for how long when the message was sent.
export interface AwayPlayer {
  player: PlayerId
  ms: number
}

export type RoomStatus = 'lobby' | 'playing' | 'ended'

export type ServerMessage =
  | { v: 1; t: 'welcome'; token?: string; seat: number | null; player: PlayerId | null; host: boolean }
  | { v: 1; t: 'lobby'; status: RoomStatus; seats: LobbySeat[]; preset: Preset }
  | { v: 1; t: 'state'; version: number; view: PlayerView; events: GameEvent[] }
  | { v: 1; t: 'rejected'; seq: number; error: GameError }
  | { v: 1; t: 'presence'; connected: PlayerId[]; away: AwayPlayer[] }
  | { v: 1; t: 'skipped'; player: PlayerId; decision: SkipDecision } // the host answered for this player
  | { v: 1; t: 'pong' }
  | { v: 1; t: 'error'; code: ProtocolErrorCode; message: string }

export type ProtocolErrorCode =
  | 'badMessage' | 'version' | 'noRoom' | 'notMember' | 'notHost' | 'wrongPhase' | 'seatTaken' | 'notSeated'
  | 'tooFewPlayers' | 'rateLimited' | 'roomFull' | 'deckInvalid' | 'cannotSkip'

export function serverError(code: ProtocolErrorCode, message: string): ServerMessage {
  return { v: 1, t: 'error', code, message }
}
