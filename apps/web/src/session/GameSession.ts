// The only place in the app that talks to the engine: keeps the current state, an undo history,
// a readable log and who is using the device right now (hot-seat).

import {
  eventsFor, reduce, viewFor, type Action, type ActionIntent, type GameError, type GameState, type PlayerId, type PlayerView,
} from '@gathering-hall/engine'
import { describeEvents } from './describe'

export interface LogEntry {
  id: number
  text: string
}

const MAX_HISTORY = 500
const MAX_LOG = 300

export class GameSession {
  private state: GameState
  private readonly history: GameState[] = []
  private log: LogEntry[] = []
  private logId = 0
  private confirmed: PlayerId | null
  private version = 0
  private readonly listeners = new Set<() => void>()
  readonly hotseat: boolean

  constructor(initial: GameState) {
    this.state = initial
    this.hotseat = initial.seats.length > 1
    this.confirmed = this.hotseat ? null : initial.seats[0]!
  }

  // ---- subscription (useSyncExternalStore) ----
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = () => this.version

  private changed() {
    this.version += 1
    this.listeners.forEach((l) => l())
  }

  // ---- reads ----
  getState(): GameState {
    return this.state
  }

  getLog(): LogEntry[] {
    return this.log
  }

  canUndo(): boolean {
    return this.history.length > 0
  }

  // Who should be holding the device: whoever the engine is waiting for.
  seat(): PlayerId {
    const s = this.state
    if (!this.hotseat) return s.seats[0]!
    if (s.status === 'ended') return this.confirmed ?? s.seats[0]!
    return s.pending?.player ?? s.priority?.player ?? s.turn.active
  }

  needsCurtain(): boolean {
    return this.hotseat && this.state.status !== 'ended' && this.confirmed !== this.seat()
  }

  confirmSeat() {
    this.confirmed = this.seat()
    this.changed()
  }

  view(): PlayerView {
    return viewFor(this.state, this.needsCurtain() ? null : this.seat())
  }

  // ---- writes ----
  dispatch(action: ActionIntent & { player?: PlayerId }): GameError | null {
    const full = { ...action, player: action.player ?? this.seat() } as Action
    const result = reduce(this.state, full)
    if (!result.ok) return result.error
    this.history.push(this.state)
    if (this.history.length > MAX_HISTORY) this.history.shift()
    const viewer = this.seat()
    const lines = describeEvents(eventsFor(result.events, viewer), result.state, this.state, viewer)
    this.state = result.state
    this.appendLog(lines)
    this.changed()
    return null
  }

  undo(): boolean {
    const previous = this.history.pop()
    if (!previous) return false
    this.state = previous
    this.appendLog(['↩ Ação desfeita.'])
    this.changed()
    return true
  }

  private appendLog(lines: string[]) {
    if (!lines.length) return
    this.log = [...this.log, ...lines.map((text) => ({ id: ++this.logId, text }))].slice(-MAX_LOG)
  }
}
