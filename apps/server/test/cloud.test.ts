import { officialPreset } from '@gathering-hall/formats'
import { describe, expect, it } from 'vitest'
import { AccountStore } from '../src/auth/accounts'
import { AuthService } from '../src/auth/routes'
import { CloudStore, LIMITS } from '../src/cloud/store'
import { DEFAULT_CONFIG, startServer } from '../src/server'
import { DbRoomStore } from '../src/store'
import { testDb } from './db.helpers'
import { afterEach } from 'vitest'

const deck = (id: string, name: string, updatedAt: number) => ({ schemaVersion: 1, id, name, commanders: [], cards: [{ oracleId: 'o1', name: 'Sol Ring', count: 1 }], createdAt: 1, updatedAt })

async function userAndStore() {
  const db = await testDb()
  const accounts = new AccountStore(db)
  const signed = await accounts.signIn({ provider: 'discord', providerUserId: String(Math.random()), name: 'Ana', avatarUrl: null }, null)
  const userId = 'userId' in signed ? signed.userId : ''
  return { db, accounts, cloud: new CloudStore(db), userId }
}

describe('cloud store: last write wins', () => {
  it('keeps the newest edit and answers older ones with the server version', async () => {
    const { cloud, userId } = await userAndStore()
    expect((await cloud.put(userId, 'deck', 'd1', deck('d1', 'v1', 100), 100, 1000)).status).toBe('ok')
    const stale = await cloud.put(userId, 'deck', 'd1', deck('d1', 'old', 90), 90, 1001)
    expect(stale).toMatchObject({ status: 'conflict', doc: { updatedAt: 100, data: { name: 'v1' } } })
    expect((await cloud.put(userId, 'deck', 'd1', deck('d1', 'v2', 200), 200, 1002)).status).toBe('ok')
    expect((await cloud.changesSince(userId, 0, 2000)).decks).toEqual([{ id: 'd1', data: deck('d1', 'v2', 200), updatedAt: 200, deleted: false }])
  })

  it('deletions are tombstones that other devices see; "since" is server time', async () => {
    const { cloud, userId } = await userAndStore()
    await cloud.put(userId, 'deck', 'd1', deck('d1', 'x', 100), 100, 1000)
    await cloud.put(userId, 'deck', 'd1', null, 150, 2000)
    expect((await cloud.changesSince(userId, 1500, 3000)).decks).toEqual([{ id: 'd1', data: null, updatedAt: 150, deleted: true }])
    expect((await cloud.changesSince(userId, 2000, 3000)).decks).toEqual([])
  })

  it('a device clock far in the future counts as now', async () => {
    const { cloud, userId } = await userAndStore()
    const now = 1_000_000
    const res = await cloud.put(userId, 'deck', 'd1', deck('d1', 'x', now * 10), now * 10, now)
    expect(res).toMatchObject({ status: 'ok', doc: { updatedAt: now } })
  })

  it('limits documents per account (deleted ones do not count)', async () => {
    const { cloud, userId } = await userAndStore()
    for (let i = 0; i < LIMITS.preset; i++) await cloud.put(userId, 'preset', `p${i}`, { ...officialPreset(), id: `p${i}`, name: `P${i}` }, 10, 10)
    expect((await cloud.put(userId, 'preset', 'extra', { ...officialPreset(), id: 'extra', name: 'E' }, 10, 10)).status).toBe('limit')
    await cloud.put(userId, 'preset', 'p0', null, 20, 20)
    expect((await cloud.put(userId, 'preset', 'extra', { ...officialPreset(), id: 'extra', name: 'E' }, 30, 30)).status).toBe('ok')
  }, 60_000)

  it('two devices editing at random always converge on the newest edit (fitness)', async () => {
    const { cloud, userId } = await userAndStore()
    let seed = 7
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const devices = [new Map<string, { name: string; updatedAt: number }>(), new Map<string, { name: string; updatedAt: number }>()]
    let best = { name: '', updatedAt: 0 }
    for (let step = 0; step < 60; step++) {
      const device = devices[Math.floor(rand() * 2)]!
      const updatedAt = 1 + Math.floor(rand() * 1000) // clocks disagree: any order
      const edit = { name: `e${step}`, updatedAt }
      device.set('d1', edit)
      const res = await cloud.put(userId, 'deck', 'd1', deck('d1', edit.name, updatedAt), updatedAt, 10_000 + step)
      if (res.status === 'conflict') device.set('d1', { name: (res.doc.data as { name: string }).name, updatedAt: res.doc.updatedAt }) // adopt
      if (updatedAt > best.updatedAt) best = edit
    }
    // Each device syncs once more and adopts the server state.
    const server = (await cloud.changesSince(userId, 0, 99_999)).decks[0]!
    for (const d of devices) d.set('d1', { name: (server.data as { name: string }).name, updatedAt: server.updatedAt })
    expect(server.updatedAt).toBe(best.updatedAt)
    expect(devices[0]!.get('d1')).toEqual(devices[1]!.get('d1'))
  }, 60_000)
})

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
})

async function api() {
  const { db, accounts, cloud, userId } = await userAndStore()
  accounts.register(cloud.accountPart())
  const auth = new AuthService(accounts, { publicUrl: 'http://127.0.0.1', sessionSecret: 'x'.repeat(40), providers: [] })
  const server = await startServer({ ...DEFAULT_CONFIG, port: 0, allowedOrigins: ['http://app.test'] }, new DbRoomStore(db), undefined, null, auth, cloud)
  cleanup.push(() => server.close())
  const token = await accounts.createSession(userId)
  const base = `http://127.0.0.1:${server.port}`
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method, headers: { Cookie: `gh_session=${token}`, Origin: 'http://app.test', 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) })
  return { call, base, accounts, userId, db }
}

describe('cloud API', () => {
  it('syncs decks and presets for the signed-in account', async () => {
    const { call } = await api()
    expect((await call('PUT', '/api/decks/d1', { data: deck('d1', 'Krenko', 5), updatedAt: 5 })).status).toBe(200)
    expect((await call('PUT', '/api/presets/sexta', { data: { ...officialPreset(), id: 'sexta', name: 'Sexta' }, updatedAt: 6 })).status).toBe(200)
    const stale = await call('PUT', '/api/decks/d1', { data: deck('d1', 'old', 1), updatedAt: 1 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ doc: { data: { name: 'Krenko' } } })
    const sync = (await (await call('GET', '/api/sync?since=0')).json()) as { decks: unknown[]; presets: unknown[]; now: number }
    expect(sync.decks).toHaveLength(1)
    expect(sync.presets).toHaveLength(1)
    expect(sync.now).toBeGreaterThan(0)
    expect((await call('DELETE', '/api/decks/d1', { updatedAt: 9 })).status).toBe(200)
  })

  it('refuses no session, other origins, invalid or mismatched documents and huge bodies', async () => {
    const { call, base } = await api()
    expect((await fetch(`${base}/api/sync`)).status).toBe(401)
    expect((await call('PUT', '/api/decks/d1', { data: deck('d1', 'x', 1), updatedAt: 1 }, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('PUT', '/api/decks/d1', { data: deck('other', 'x', 1), updatedAt: 1 })).status).toBe(422)
    expect((await call('PUT', '/api/decks/d1', { data: { hack: true }, updatedAt: 1 })).status).toBe(422)
    expect((await call('PUT', '/api/presets/p1', { data: { ...officialPreset(), id: 'p1', name: 'x', ruleset: { startingLife: 1e9 } }, updatedAt: 1 })).status).toBe(422)
    expect((await call('PUT', '/api/decks/d1', { data: deck('d1', 'x', 1) })).status).toBe(400)
    expect((await call('PUT', '/api/decks/d1', JSON.stringify({ data: deck('d1', 'x'.repeat(70_000), 1), updatedAt: 1 }))).status).toBe(413)
    expect((await call('PUT', '/api/decks/..%2Fevil', { data: deck('../evil', 'x', 1), updatedAt: 1 })).status).toBe(400)
  })

  it('cloud documents go with an exported or deleted account', async () => {
    const { call, accounts, userId, db } = await api()
    await call('PUT', '/api/decks/d1', { data: deck('d1', 'Krenko', 5), updatedAt: 5 })
    expect(((await accounts.exportAccount(userId)).cloud as { decks: { name: string }[] }).decks[0]!.name).toBe('Krenko')
    await accounts.deleteAccount(userId)
    expect(await db.query('SELECT 1 FROM cloud_doc')).toEqual([])
  })
})
