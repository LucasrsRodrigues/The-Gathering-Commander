import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerMessage } from '@gathering-hall/protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { DEFAULT_CONFIG, startServer, type RunningServer } from '../src/server'
import { SqliteRoomStore } from '../src/store'
import { deck } from './helpers'

const ORIGIN = 'http://localhost:5180'
const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
})

async function boot(dbPath: string, overrides = {}): Promise<{ server: RunningServer; base: string }> {
  const store = new SqliteRoomStore(dbPath)
  const server = await startServer({ ...DEFAULT_CONFIG, port: 0, allowedOrigins: [ORIGIN], ...overrides }, store)
  cleanup.push(() => store.close(), () => server.close())
  return { server, base: `127.0.0.1:${server.port}` }
}

// Minimal test client: collects every server message and waits for the next one of a type.
function client(base: string, room: string) {
  const ws = new WebSocket(`ws://${base}/ws?room=${room}`, { headers: { Origin: ORIGIN } })
  const inbox: ServerMessage[] = []
  const waiters: { t: string; resolve: (m: ServerMessage) => void }[] = []
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString()) as ServerMessage
    const i = waiters.findIndex((w) => w.t === m.t)
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(m)
    else inbox.push(m)
  })
  const open = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  cleanup.push(() => ws.close())
  return {
    open,
    send: (m: object) => ws.send(JSON.stringify({ v: 1, ...m })),
    next: <T extends ServerMessage['t']>(t: T) => new Promise<Extract<ServerMessage, { t: T }>>((resolve) => {
      const i = inbox.findIndex((m) => m.t === t)
      if (i >= 0) return resolve(inbox.splice(i, 1)[0] as Extract<ServerMessage, { t: T }>)
      waiters.push({ t, resolve: resolve as (m: ServerMessage) => void })
    }),
    close: () => ws.close(),
  }
}

async function createRoom(base: string, origin = ORIGIN) {
  return fetch(`http://${base}/api/rooms`, { method: 'POST', headers: { Origin: origin } })
}

describe('online server', () => {
  it('plays through a real socket, survives a restart and lets the player reconnect', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-server-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const db = join(dir, 'rooms.db')
    const { base, server } = await boot(db)

    const res = await createRoom(base)
    expect(res.status).toBe(201)
    const { room, token: hostToken } = (await res.json()) as { room: string; token: string }

    const host = client(base, room)
    await host.open
    host.send({ t: 'hello', room, token: hostToken })
    expect(await host.next('welcome')).toMatchObject({ host: true })
    host.send({ t: 'sit', seat: 0, name: 'Host', deck })

    const guest = client(base, room)
    await guest.open
    guest.send({ t: 'hello', room })
    const guestToken = (await guest.next('welcome')).token!
    guest.send({ t: 'sit', seat: 1, name: 'Guest', deck })
    await guest.next('lobby')

    host.send({ t: 'start' })
    const state = await guest.next('state')
    expect(state.view.viewer).toBe('p2')
    expect(state.view.players.p1!.hand).toEqual([]) // never the other hand

    // Restart the whole process: the game must come back from SQLite.
    host.close()
    guest.close()
    await server.close()
    const again = await boot(db)
    const back = client(again.base, room)
    await back.open
    back.send({ t: 'hello', room, token: guestToken })
    expect(await back.next('welcome')).toMatchObject({ seat: 1, player: 'p2' })
    const restored = await back.next('state')
    expect(restored.view.players.p2!.hand).toEqual(state.view.players.p2!.hand)
  })

  it('refuses other origins, unknown rooms and malformed messages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-server-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const { base } = await boot(join(dir, 'rooms.db'))

    expect((await createRoom(base, 'https://evil.example')).status).toBe(403)

    const ghost = client(base, 'AAAAAAAAAAAAAAAAAAAAAA')
    await ghost.open
    expect(await ghost.next('error')).toMatchObject({ code: 'noRoom' })

    const { room } = (await (await createRoom(base)).json()) as { room: string }
    const c = client(base, room)
    await c.open
    c.send({ t: 'act', seq: 1, action: { type: 'winGame' } })
    expect(await c.next('error')).toMatchObject({ code: 'badMessage' })

    const evil = new WebSocket(`ws://${base}/ws?room=${room}`, { headers: { Origin: 'https://evil.example' } })
    await expect(new Promise((resolve, reject) => { evil.once('open', resolve); evil.once('error', reject) })).rejects.toThrow()
  })

  it('limits how many rooms one IP can create', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-server-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const { base } = await boot(join(dir, 'rooms.db'), { roomsPerIpPerHour: 2 })
    expect((await createRoom(base)).status).toBe(201)
    expect((await createRoom(base)).status).toBe(201)
    expect((await createRoom(base)).status).toBe(429)
  })
})
