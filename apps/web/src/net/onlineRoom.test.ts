import { createGame, viewFor, type CardRef } from '@gathering-hall/engine'
import type { ServerMessage } from '@gathering-hall/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnlineRoom, type SocketLike, type TokenStore } from './onlineRoom'

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  sent: Record<string, unknown>[] = []
  readonly url: string
  constructor(url: string) {
    this.url = url
  }
  send(data: string) { this.sent.push(JSON.parse(data)) }
  close() { this.onclose?.() }
  serverSends(msg: ServerMessage) { this.onmessage?.({ data: JSON.stringify(msg) }) }
}

const ROOM = 'abcdefghijklmnopqrstuv'
const bear: CardRef = { name: 'Bear', typeLine: 'Creature' }
const game = createGame({
  seed: 1, startingPlayer: 'p1',
  players: [1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, deck: { commanders: [], cards: Array(20).fill(bear) } })),
})

function memoryTokens(): TokenStore {
  const map = new Map<string, string>()
  return { get: (r) => map.get(r) ?? null, set: (r, t) => void map.set(r, t) }
}

function setup(tokens = memoryTokens()) {
  const sockets: FakeSocket[] = []
  const room = new OnlineRoom(ROOM, { url: 'ws://server', tokens, connect: (url) => { const s = new FakeSocket(url); sockets.push(s); return s } })
  return { room, sockets, tokens }
}

afterEach(() => vi.useRealTimers())

describe('OnlineRoom', () => {
  it('says hello with the stored token and keeps the token it is given', () => {
    const tokens = memoryTokens()
    tokens.set(ROOM, 'TOKEN_FROM_BEFORE_xxxxx')
    const { room, sockets } = setup(tokens)
    expect(sockets[0]!.url).toBe(`ws://server/ws?room=${ROOM}`)
    sockets[0]!.onopen!()
    expect(sockets[0]!.sent[0]).toEqual({ v: 1, t: 'hello', room: ROOM, token: 'TOKEN_FROM_BEFORE_xxxxx' })
    sockets[0]!.serverSends({ v: 1, t: 'welcome', token: 'NEW_TOKEN_xxxxxxxxxxxxx', seat: null, player: null, host: false })
    expect(tokens.get(ROOM)).toBe('NEW_TOKEN_xxxxxxxxxxxxx')
    expect(room.snapshot().connection).toBe('online')
    room.close()
  })

  it('renders server views, ignores stale ones and logs events', () => {
    const { room, sockets } = setup()
    sockets[0]!.onopen!()
    const view = viewFor(game, 'p1')
    sockets[0]!.serverSends({ v: 1, t: 'state', version: 2, view, events: [] })
    expect(room.view().viewer).toBe('p1')
    sockets[0]!.serverSends({ v: 1, t: 'state', version: 3, view, events: [{ type: 'handKept', player: 'p1' }] })
    expect(room.getLog().map((l) => l.text)).toEqual(['P1 manteve a mão.'])
    sockets[0]!.serverSends({ v: 1, t: 'state', version: 1, view: viewFor(game, 'p2'), events: [] })
    expect(room.view().viewer).toBe('p1')
    room.close()
  })

  it('sends intents with increasing seq and surfaces refusals', () => {
    const { room, sockets } = setup()
    const errors: string[] = []
    room.onError = (m) => errors.push(m)
    sockets[0]!.onopen!()
    room.dispatch({ type: 'passPriority' })
    room.dispatch({ type: 'draw', count: 1 })
    expect(sockets[0]!.sent.slice(1)).toEqual([
      { v: 1, t: 'act', seq: 1, action: { type: 'passPriority' } },
      { v: 1, t: 'act', seq: 2, action: { type: 'draw', count: 1 } },
    ])
    sockets[0]!.serverSends({ v: 1, t: 'rejected', seq: 2, error: { code: 'notYourPriority', message: 'Você não tem prioridade agora.' } })
    expect(errors).toEqual(['Você não tem prioridade agora.'])
    room.close()
  })

  it('reconnects with backoff after the connection drops', () => {
    vi.useFakeTimers()
    const { room, sockets } = setup()
    sockets[0]!.onopen!()
    sockets[0]!.onclose!()
    expect(room.snapshot().connection).toBe('offline')
    vi.advanceTimersByTime(500)
    expect(sockets).toHaveLength(2)
    sockets[1]!.onopen!()
    expect(room.snapshot().connection).toBe('online')
    room.close()
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(2) // closing on purpose never reconnects
  })

  it('does not queue actions while offline', () => {
    const { room, sockets } = setup()
    const errors: string[] = []
    room.onError = (m) => errors.push(m)
    room.dispatch({ type: 'passPriority' })
    expect(sockets[0]!.sent).toEqual([])
    expect(errors).toHaveLength(1)
    room.close()
  })
})
