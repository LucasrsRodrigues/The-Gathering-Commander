// Client side of an online room: one WebSocket with automatic reconnection, the lobby state, and a
// GameSessionPort for the table once the game starts. The server is authoritative: this never runs
// the engine, it sends intents and renders the views it receives.

import type { ActionIntent, DeckInput, PlayerId, PlayerView } from '@gathering-hall/engine'
import type { Preset } from '@gathering-hall/formats'
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage, type SkipDecision } from '@gathering-hall/protocol'
import { describeEvents } from '../session/describe'
import type { BlockedAction, ConnectionStatus, GameSessionPort, LogEntry } from '../session/port'

export interface SocketLike {
  onopen: (() => void) | null
  onmessage: ((e: { data: unknown }) => void) | null
  onclose: (() => void) | null
  send(data: string): void
  close(): void
}

export interface TokenStore {
  get(room: string): string | null
  set(room: string, token: string): void
}

export const localTokenStore: TokenStore = {
  get: (room) => {
    try {
      return localStorage.getItem(`gh-room-token:${room}`)
    } catch {
      return null
    }
  },
  set: (room, token) => {
    try {
      localStorage.setItem(`gh-room-token:${room}`, token)
    } catch {
      // Private mode: reconnecting after a reload will join as a new member.
    }
  },
}

export type LobbyMessage = Extract<ServerMessage, { t: 'lobby' }>
export type WelcomeMessage = Extract<ServerMessage, { t: 'welcome' }>

export interface RoomSnapshot {
  connection: ConnectionStatus
  welcome: WelcomeMessage | null
  lobby: LobbyMessage | null
  view: PlayerView | null
  error: string | null
}

const MAX_BACKOFF_MS = 10_000
const PING_MS = 20_000
const MAX_LOG = 300

// What the host answered for a player who left (log line).
const SKIPPED: Record<SkipDecision, string> = {
  mulligan: 'manteve a mão',
  bottomCards: 'pôs as últimas cartas da mão no fundo',
  declareAttackers: 'não atacou',
  declareBlockers: 'não bloqueou',
  confirmDamage: 'confirmou o dano proposto',
  discard: 'descartou as últimas cartas da mão',
  exception: 'recusou o pedido de exceção',
  priority: 'passou a prioridade',
}

export class OnlineRoom implements GameSessionPort {
  readonly roomId: string
  private readonly connect: (url: string) => SocketLike
  private readonly tokens: TokenStore
  private readonly url: string
  private socket: SocketLike | null = null
  private snap: RoomSnapshot = { connection: 'connecting', welcome: null, lobby: null, view: null, error: null }
  private connected: PlayerId[] = []
  private awaySince = new Map<PlayerId, number>() // seated players who left, by when (this browser's clock)
  private log: LogEntry[] = []
  private logId = 0
  private seq = 0
  private readonly sent = new Map<number, ActionIntent>() // recent actions by seq, to offer exceptions when blocked
  private blockedAction: BlockedAction | null = null
  private version = 0
  private attempts = 0
  private closed = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private readonly listeners = new Set<() => void>()
  onError: (message: string) => void = () => {}
  onState: (view: PlayerView) => void = () => {}

  constructor(roomId: string, opts: { url: string; connect: (url: string) => SocketLike; tokens?: TokenStore }) {
    this.roomId = roomId
    this.url = opts.url
    this.connect = opts.connect
    this.tokens = opts.tokens ?? localTokenStore
    this.open()
  }

  // ---- lobby commands ----
  sit(seat: number, name: string, deck: DeckInput) { this.send({ v: 1, t: 'sit', seat, name, deck }) }
  stand() { this.send({ v: 1, t: 'stand' }) }
  configure(preset: Preset) { this.send({ v: 1, t: 'configure', preset }) }
  start() { this.send({ v: 1, t: 'start' }) }
  rematch() { this.send({ v: 1, t: 'rematch' }) }
  skip(player: PlayerId) { this.send({ v: 1, t: 'skip', player }) }
  awayMs(player: PlayerId): number | null {
    const since = this.awaySince.get(player)
    return since === undefined ? null : Date.now() - since
  }

  close() {
    this.closed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.socket?.close()
  }

  snapshot = (): RoomSnapshot => this.snap

  setHandlers(handlers: { onError?: (message: string) => void; onState?: (view: PlayerView) => void }) {
    if (handlers.onError) this.onError = handlers.onError
    if (handlers.onState) this.onState = handlers.onState
  }

  // Re-render after something outside the protocol changed (e.g. card images just arrived).
  touch() {
    this.update({})
  }

  // ---- GameSessionPort ----
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getVersion = () => this.version
  view(): PlayerView {
    if (!this.snap.view) throw new Error('a partida ainda não começou')
    return this.snap.view
  }
  seat(): PlayerId {
    const view = this.view()
    return view.viewer ?? view.seats[0]!
  }
  needsCurtain() { return false }
  confirmSeat() {}
  dispatch(action: ActionIntent) {
    this.send({ v: 1, t: 'act', seq: ++this.seq, action })
    this.sent.set(this.seq, action)
    if (this.sent.size > 20) this.sent.delete(this.sent.keys().next().value!)
    return null
  }
  blocked() { return this.blockedAction }
  dismissBlocked() {
    this.blockedAction = null
    this.update({})
  }
  canUndo() { return false }
  undo() { return false }
  getLog() { return this.log }
  connection() { return this.snap.connection }
  presence() { return this.connected }

  // ---- transport ----
  private open() {
    const ws = this.connect(`${this.url}/ws?room=${encodeURIComponent(this.roomId)}`)
    this.socket = ws
    ws.onopen = () => {
      this.attempts = 0
      const token = this.tokens.get(this.roomId)
      this.send({ v: 1, t: 'hello', room: this.roomId, ...(token ? { token } : {}) })
      this.update({ connection: 'online', error: null })
      this.pingTimer = setInterval(() => this.send({ v: 1, t: 'ping' }), PING_MS)
    }
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      try {
        this.receive(JSON.parse(e.data) as ServerMessage)
      } catch {
        // Ignore anything that is not a protocol message.
      }
    }
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer)
      if (this.closed) return
      this.update({ connection: 'offline' })
      // Exponential backoff: 0.5 s, 1 s, 2 s … up to 10 s.
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts++)
      this.retryTimer = setTimeout(() => this.open(), delay)
    }
  }

  private send(msg: ClientMessage) {
    if (this.snap.connection !== 'online' && msg.t !== 'hello') {
      this.onError('Sem conexão com a sala; tentando reconectar…')
      return
    }
    this.socket?.send(JSON.stringify(msg))
  }

  private receive(msg: ServerMessage) {
    if (msg.v !== PROTOCOL_VERSION) {
      this.update({ error: 'O servidor foi atualizado. Recarregue a página.' })
      return
    }
    switch (msg.t) {
      case 'welcome':
        if (msg.token) this.tokens.set(this.roomId, msg.token)
        this.update({ welcome: msg })
        return
      case 'lobby':
        this.update({ lobby: msg, ...(msg.status === 'lobby' ? { view: null } : {}) })
        return
      case 'state': {
        const before = this.snap.view
        if (before && this.lastVersion >= msg.version) return // stale
        this.lastVersion = msg.version
        if (before) this.appendLog(describeEvents(msg.events, msg.view, before, msg.view.viewer))
        this.update({ view: msg.view })
        this.onState(msg.view)
        return
      }
      case 'rejected': {
        const action = this.sent.get(msg.seq)
        if (msg.error.code === 'ruleBlocked' && action) {
          this.blockedAction = { action, error: msg.error }
          this.update({})
        } else this.onError(msg.error.message)
        return
      }
      case 'presence':
        this.connected = msg.connected
        this.awaySince = new Map(msg.away.map((a) => [a.player, Date.now() - a.ms]))
        this.update({})
        return
      case 'skipped': {
        const name = this.snap.view?.players[msg.player]?.name ?? msg.player
        this.appendLog([`Quem criou a sala respondeu por ${name}, que está fora: ${SKIPPED[msg.decision]}.`])
        this.update({})
        return
      }
      case 'error':
        if (msg.code === 'noRoom') this.update({ error: msg.message })
        else this.onError(msg.message)
        return
      default:
        return
    }
  }

  private lastVersion = -1

  private appendLog(lines: string[]) {
    if (!lines.length) return
    this.log = [...this.log, ...lines.map((text) => ({ id: ++this.logId, text }))].slice(-MAX_LOG)
  }

  private update(patch: Partial<RoomSnapshot>) {
    this.snap = { ...this.snap, ...patch }
    this.version += 1
    this.listeners.forEach((l) => l())
  }
}

export async function createRoom(serverHttp: string): Promise<{ room: string; token: string }> {
  const res = await fetch(`${serverHttp}/api/rooms`, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer' })
  const body = (await res.json().catch(() => ({}))) as { room?: string; token?: string; error?: string }
  if (!res.ok || !body.room || !body.token) throw new Error(body.error ?? `O servidor respondeu ${res.status}.`)
  return { room: body.room, token: body.token }
}
