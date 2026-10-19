// RoomCore: one online room (lobby + game) as a pure actor. It receives decoded client messages and
// returns the messages to send, already filtered per connection. No sockets, no storage, no clock:
// those come from the adapter (deps), so the room is fully testable and replayable.

import {
  createGame, eventsFor, reduce, viewFor, type Action, type DeckInput, type GameEvent, type GameState, type PlayerId,
} from '@gathering-hall/engine'
import { officialPreset, resolvePreset, type Preset } from '@gathering-hall/formats'
import {
  MAX_SEATS, serverError, type ClientMessage, type LobbySeat, type RoomStatus, type ServerMessage,
} from '@gathering-hall/protocol'

export interface RoomDeps {
  newToken(): string // 128-bit random, base64url
  hash(token: string): string
  seed(): number
  now(): number
}

export interface Member {
  tokenHash: string
  host: boolean
  seat: number | null
}

export interface SeatState {
  name: string
  deck: DeckInput
  member: string // tokenHash
}

export interface RoomSnapshot {
  schema: 1
  id: string
  createdAt: number
  lastActive: number
  preset: Preset
  members: Member[]
  seats: (SeatState | null)[]
  status: RoomStatus
  initial: GameState | null // for replay
  game: GameState | null
  actions: Action[]
  version: number
}

export interface Outgoing {
  to: string // connection id
  msg: ServerMessage
}

interface Conn {
  member: string | null // tokenHash; null = spectator
}

const MAX_MEMBERS = 24
export const playerOf = (seat: number): PlayerId => `p${seat + 1}`

export class Room {
  private s: RoomSnapshot
  private readonly deps: RoomDeps
  private readonly conns = new Map<string, Conn>()

  constructor(snapshot: RoomSnapshot, deps: RoomDeps) {
    this.s = snapshot
    this.deps = deps
  }

  static create(id: string, deps: RoomDeps): { room: Room; hostToken: string } {
    const hostToken = deps.newToken()
    const now = deps.now()
    const room = new Room({
      schema: 1, id, createdAt: now, lastActive: now, preset: officialPreset(),
      members: [{ tokenHash: deps.hash(hostToken), host: true, seat: null }],
      seats: Array(MAX_SEATS).fill(null), status: 'lobby', initial: null, game: null, actions: [], version: 0,
    }, deps)
    return { room, hostToken }
  }

  snapshot(): RoomSnapshot {
    return this.s
  }

  get connectionCount(): number {
    return this.conns.size
  }

  disconnect(connId: string): Outgoing[] {
    if (!this.conns.delete(connId)) return []
    return this.broadcast(() => this.presence())
  }

  receive(connId: string, msg: ClientMessage): Outgoing[] {
    this.s = { ...this.s, lastActive: this.deps.now() }
    if (msg.t === 'hello') return this.hello(connId, msg.token, msg.spectator ?? false)
    if (msg.t === 'ping') return [{ to: connId, msg: { v: 1, t: 'pong' } }]

    const conn = this.conns.get(connId)
    const member = conn?.member ? this.s.members.find((m) => m.tokenHash === conn.member) : undefined
    if (!member) return [this.err(connId, 'notMember', 'Entre na sala antes.')]

    switch (msg.t) {
      case 'sit': return this.sit(connId, member, msg.seat, msg.name, msg.deck)
      case 'stand': return this.stand(connId, member)
      case 'configure':
        if (!member.host) return [this.err(connId, 'notHost', 'Só quem criou a sala muda as regras.')]
        if (this.s.status !== 'lobby') return [this.err(connId, 'wrongPhase', 'A partida já começou.')]
        this.s = { ...this.s, preset: msg.preset }
        return this.broadcast(() => this.lobby())
      case 'start': return this.start(connId, member)
      case 'act': return this.act(connId, member, msg.seq, msg.action)
      case 'rematch':
        if (!member.host) return [this.err(connId, 'notHost', 'Só quem criou a sala pode recomeçar.')]
        if (this.s.status !== 'ended') return [this.err(connId, 'wrongPhase', 'A partida ainda não acabou.')]
        this.s = { ...this.s, status: 'lobby', initial: null, game: null, actions: [] }
        return this.broadcast(() => this.lobby())
      default:
        return []
    }
  }

  // ---- handlers -------------------------------------------------------------

  private hello(connId: string, token: string | undefined, spectator: boolean): Outgoing[] {
    const known = token ? this.s.members.find((m) => m.tokenHash === this.deps.hash(token)) : undefined
    let issued: string | undefined
    let member = known
    if (!member && !spectator) {
      if (this.s.members.length >= MAX_MEMBERS) return [this.err(connId, 'roomFull', 'A sala está cheia.')]
      issued = this.deps.newToken()
      member = { tokenHash: this.deps.hash(issued), host: false, seat: null }
      this.s = { ...this.s, members: [...this.s.members, member] }
    }
    this.conns.set(connId, { member: member?.tokenHash ?? null })
    const out: Outgoing[] = [{
      to: connId,
      msg: {
        v: 1, t: 'welcome', ...(issued ? { token: issued } : {}),
        seat: member?.seat ?? null, player: member?.seat != null ? playerOf(member.seat) : null, host: member?.host ?? false,
      },
    }, { to: connId, msg: this.lobby() }]
    if (this.s.game) out.push({ to: connId, msg: this.stateFor(connId, []) })
    return [...out, ...this.broadcast(() => this.presence())]
  }

  private sit(connId: string, member: Member, seat: number, name: string, deck: DeckInput): Outgoing[] {
    if (this.s.status !== 'lobby') return [this.err(connId, 'wrongPhase', 'A partida já começou.')]
    const current = this.s.seats[seat]
    if (current && current.member !== member.tokenHash) return [this.err(connId, 'seatTaken', 'Esse lugar já está ocupado.')]
    const seats = this.s.seats.map((s, i) => (s?.member === member.tokenHash && i !== seat ? null : s))
    seats[seat] = { name, deck, member: member.tokenHash }
    this.updateMember(member, { seat })
    this.s = { ...this.s, seats }
    return [this.welcomeAgain(connId, member.tokenHash), ...this.broadcast(() => this.lobby()), ...this.broadcast(() => this.presence())]
  }

  private stand(connId: string, member: Member): Outgoing[] {
    if (this.s.status !== 'lobby') return [this.err(connId, 'wrongPhase', 'A partida já começou.')]
    this.s = { ...this.s, seats: this.s.seats.map((s) => (s?.member === member.tokenHash ? null : s)) }
    this.updateMember(member, { seat: null })
    return [this.welcomeAgain(connId, member.tokenHash), ...this.broadcast(() => this.lobby())]
  }

  private start(connId: string, member: Member): Outgoing[] {
    if (!member.host) return [this.err(connId, 'notHost', 'Só quem criou a sala pode começar.')]
    if (this.s.status !== 'lobby') return [this.err(connId, 'wrongPhase', 'A partida já começou.')]
    const seated = this.s.seats.flatMap((s, i) => (s ? [{ ...s, index: i }] : []))
    if (seated.length < 2) return [this.err(connId, 'tooFewPlayers', 'Precisa de pelo menos 2 jogadores sentados.')]
    let game: GameState
    try {
      game = createGame({
        seed: this.deps.seed(),
        ruleset: resolvePreset(this.s.preset).ruleset,
        players: seated.map((s) => ({ id: playerOf(s.index), name: s.name, deck: s.deck })),
      })
    } catch {
      return [this.err(connId, 'badMessage', 'Não foi possível criar a partida com esses decks.')]
    }
    this.s = { ...this.s, status: 'playing', initial: game, game, actions: [], version: this.s.version + 1 }
    return [...this.broadcast(() => this.lobby()), ...this.broadcast((id) => this.stateFor(id, []))]
  }

  private act(connId: string, member: Member, seq: number, intent: Extract<ClientMessage, { t: 'act' }>['action']): Outgoing[] {
    const game = this.s.game
    if (this.s.status !== 'playing' || !game) return [this.err(connId, 'wrongPhase', 'Não há partida em andamento.')]
    const player = member.seat != null ? playerOf(member.seat) : null
    if (!player || !game.seats.includes(player)) return [this.err(connId, 'notSeated', 'Você está assistindo; sente num lugar na próxima partida.')]
    // The acting player always comes from the connection's seat, never from the client.
    const action = { ...intent, player } as Action
    const result = reduce(game, action)
    if (!result.ok) return [{ to: connId, msg: { v: 1, t: 'rejected', seq, error: result.error } }]
    this.s = {
      ...this.s, game: result.state, actions: [...this.s.actions, action], version: this.s.version + 1,
      status: result.state.status === 'ended' ? 'ended' : 'playing',
    }
    const out = this.broadcast((id) => this.stateFor(id, result.events))
    return this.s.status === 'ended' ? [...out, ...this.broadcast(() => this.lobby())] : out
  }

  // ---- messages -----------------------------------------------------------

  private viewerOf(connId: string): PlayerId | null {
    const hash = this.conns.get(connId)?.member
    const seat = this.s.members.find((m) => m.tokenHash === hash)?.seat
    const player = seat != null ? playerOf(seat) : null
    return player && this.s.game?.seats.includes(player) ? player : null
  }

  // Each connection gets only what its seat may see (spectators: public information only).
  private stateFor(connId: string, events: GameEvent[]): ServerMessage {
    const viewer = this.viewerOf(connId)
    return { v: 1, t: 'state', version: this.s.version, view: viewFor(this.s.game!, viewer), events: eventsFor(events, viewer) }
  }

  private lobby(): ServerMessage {
    const connected = new Set([...this.conns.values()].map((c) => c.member))
    const seats: LobbySeat[] = this.s.seats.map((s, index) => ({
      index, player: playerOf(index), name: s?.name ?? null, taken: !!s, connected: !!s && connected.has(s.member),
      deckSize: s ? s.deck.commanders.length + s.deck.cards.length : 0,
      commanders: s?.deck.commanders.map((c) => c.name) ?? [],
    }))
    return { v: 1, t: 'lobby', status: this.s.status, seats, preset: this.s.preset }
  }

  private presence(): ServerMessage {
    const connected = new Set([...this.conns.values()].map((c) => c.member))
    const players = this.s.seats.flatMap((s, i) => (s && connected.has(s.member) ? [playerOf(i)] : []))
    return { v: 1, t: 'presence', connected: players }
  }

  private welcomeAgain(connId: string, hash: string): Outgoing {
    const m = this.s.members.find((x) => x.tokenHash === hash)!
    return { to: connId, msg: { v: 1, t: 'welcome', seat: m.seat, player: m.seat != null ? playerOf(m.seat) : null, host: m.host } }
  }

  private broadcast(build: (connId: string) => ServerMessage): Outgoing[] {
    return [...this.conns.keys()].map((to) => ({ to, msg: build(to) }))
  }

  private updateMember(member: Member, patch: Partial<Member>) {
    this.s = { ...this.s, members: this.s.members.map((m) => (m.tokenHash === member.tokenHash ? { ...m, ...patch } : m)) }
  }

  private err(to: string, code: Parameters<typeof serverError>[0], message: string): Outgoing {
    return { to, msg: serverError(code, message) }
  }
}
