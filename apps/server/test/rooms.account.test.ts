import type { ServerMessage } from '@gathering-hall/protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { AccountStore } from '../src/auth/accounts'
import { AuthService } from '../src/auth/routes'
import { DEFAULT_CONFIG, startServer } from '../src/server'
import { DbRoomStore } from '../src/store'
import { testDb } from './db.helpers'
import { deck } from './helpers'

const ORIGIN = 'http://localhost:5180'
const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
})

async function setup() {
  const db = await testDb()
  const accounts = new AccountStore(db)
  const auth = new AuthService(accounts, {
    publicUrl: ORIGIN, sessionSecret: 'x'.repeat(32),
    providers: [{ id: 'discord', clientId: 'c', clientSecret: 's', authorizeUrl: 'http://p/a', tokenUrl: 'http://p/t', profileUrl: 'http://p/m', scope: 'identify' }],
  })
  const server = await startServer({ ...DEFAULT_CONFIG, port: 0, allowedOrigins: [ORIGIN] }, new DbRoomStore(db), undefined, null, auth)
  cleanup.push(() => server.close()) // the database is closed by testDb
  const signIn = async (who: string) => {
    const r = await accounts.signIn({ provider: 'discord', providerUserId: who, name: who, avatarUrl: null }, null)
    if ('error' in r) throw new Error(r.error)
    return `gh_session=${await accounts.createSession(r.userId)}`
  }
  return { base: `127.0.0.1:${server.port}`, signIn }
}

function client(base: string, room: string, cookie?: string) {
  const ws = new WebSocket(`ws://${base}/ws?room=${room}`, { headers: { Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) } })
  const inbox: ServerMessage[] = []
  const waiters: { t: string; resolve: (m: ServerMessage) => void }[] = []
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString()) as ServerMessage
    const i = waiters.findIndex((w) => w.t === m.t)
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(m)
    else inbox.push(m)
  })
  cleanup.push(() => ws.close())
  return {
    open: new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    }),
    send: (m: object) => ws.send(JSON.stringify({ v: 1, ...m })),
    next: <T extends ServerMessage['t']>(t: T) => new Promise<Extract<ServerMessage, { t: T }>>((resolve) => {
      const i = inbox.findIndex((m) => m.t === t)
      if (i >= 0) return resolve(inbox.splice(i, 1)[0] as Extract<ServerMessage, { t: T }>)
      waiters.push({ t, resolve: resolve as (m: ServerMessage) => void })
    }),
    close: () => ws.close(),
  }
}

describe('rooms with accounts', () => {
  it('the host and a guest come back to their places from another device with the same account', async () => {
    const { base, signIn } = await setup()
    const hostCookie = await signIn('host')
    const res = await fetch(`http://${base}/api/rooms`, { method: 'POST', headers: { Origin: ORIGIN, Cookie: hostCookie } })
    const { room } = (await res.json()) as { room: string }

    // The host never uses the token it got: its account alone makes it host.
    const host = client(base, room, hostCookie)
    await host.open
    host.send({ t: 'hello', room })
    expect(await host.next('welcome')).toMatchObject({ host: true })

    const guestCookie = await signIn('guest')
    const pc = client(base, room, guestCookie)
    await pc.open
    pc.send({ t: 'hello', room })
    await pc.next('welcome')
    pc.send({ t: 'sit', seat: 1, name: 'Bia', deck })
    expect(await pc.next('welcome')).toMatchObject({ seat: 1 })
    pc.close()

    const tablet = client(base, room, guestCookie)
    await tablet.open
    tablet.send({ t: 'hello', room })
    expect(await tablet.next('welcome')).toMatchObject({ seat: 1, player: 'p2', host: false })

    // Without the cookie, the same device is a newcomer.
    const anon = client(base, room)
    await anon.open
    anon.send({ t: 'hello', room })
    expect(await anon.next('welcome')).toMatchObject({ seat: null, host: false })
  })
})
