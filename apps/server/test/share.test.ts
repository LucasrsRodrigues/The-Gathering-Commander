import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore } from '../src/auth/accounts'
import { AuthService } from '../src/auth/routes'
import { CloudStore } from '../src/cloud/store'
import { DEFAULT_CONFIG, startServer } from '../src/server'
import { ShareStore } from '../src/share/store'
import { DbRoomStore } from '../src/store'
import { testDb } from './db.helpers'

const ORIGIN = 'http://app.test'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
})

const deck = (id: string, name: string, updatedAt: number) => ({
  schemaVersion: 2, id, name, commanders: [{ oracleId: 'k', name: 'Krenko, Mob Boss', count: 1 }],
  cards: [{ oracleId: 'o1', name: 'Sol Ring', count: 1, tags: ['Ramp'] }], maybe: [{ oracleId: 'm1', name: 'Goblin Guide', count: 1 }],
  folder: 'Pasta secreta', description: 'Goblins para a sexta.', tagOrder: ['Ramp'],
  history: [{ at: 1, added: [{ zone: 'cards', oracleId: 'o1', name: 'Sol Ring', count: 1 }], removed: [] }], createdAt: 1, updatedAt,
})

async function setup() {
  const db = await testDb()
  const accounts = new AccountStore(db)
  const cloud = new CloudStore(db)
  const shares = new ShareStore(db)
  accounts.register(cloud.accountPart())
  accounts.register(shares.accountPart())
  const auth = new AuthService(accounts, { publicUrl: 'http://127.0.0.1', sessionSecret: 'x'.repeat(40), providers: [] })
  const server = await startServer({ ...DEFAULT_CONFIG, port: 0, allowedOrigins: [ORIGIN] }, new DbRoomStore(db), undefined, null, auth, cloud, null, undefined, shares)
  cleanup.push(() => server.close())
  const signed = await accounts.signIn({ provider: 'discord', providerUserId: 'ana', name: 'Ana', avatarUrl: null }, null)
  const userId = 'userId' in signed ? signed.userId : ''
  const token = await accounts.createSession(userId)
  const base = `http://127.0.0.1:${server.port}`
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
    method, headers: { Cookie: `gh_session=${token}`, Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const anon = (path: string) => fetch(`${base}${path}`)
  return { call, anon, accounts, userId }
}

describe('public deck links', () => {
  it('shares a cloud deck; anyone opens it without an account, and only what the page needs comes out', async () => {
    const { call, anon, userId } = await setup()
    expect((await call('PUT', '/api/decks/d1/share')).status).toBe(409) // not in the cloud yet
    await call('PUT', '/api/decks/d1', { data: deck('d1', 'Goblins', 5), updatedAt: 5 })
    const { slug } = (await (await call('PUT', '/api/decks/d1/share')).json()) as { slug: string }
    expect(slug).toMatch(/^[0-9A-Za-z]{10}$/)
    expect(((await (await call('PUT', '/api/decks/d1/share')).json()) as { slug: string }).slug).toBe(slug) // same link again

    const res = await anon(`/api/public/decks/${slug}`)
    expect(res.status).toBe(200)
    const text = await res.text()
    const { deck: pub } = JSON.parse(text) as { deck: Record<string, unknown> }
    expect(pub).toMatchObject({ name: 'Goblins', owner: 'Ana', description: 'Goblins para a sexta.', tagOrder: ['Ramp'] })
    expect(pub.cards).toEqual([{ oracleId: 'o1', name: 'Sol Ring', count: 1, tags: ['Ramp'] }])
    // fitness: never the account id, the history or the folder
    expect(text).not.toContain(userId)
    expect(text).not.toContain('Pasta secreta')
    expect(pub).not.toHaveProperty('history')
    expect(pub).not.toHaveProperty('folder')

    // the page follows the live deck
    await call('PUT', '/api/decks/d1', { data: deck('d1', 'Goblins v2', 9), updatedAt: 9 })
    expect(((await (await anon(`/api/public/decks/${slug}`)).json()) as { deck: { name: string } }).deck.name).toBe('Goblins v2')
    expect(await (await call('GET', '/api/shares')).json()).toEqual({ shares: [{ deckId: 'd1', slug }] })
  })

  it('turning the link off is immediate, and a new link never reuses the old one', async () => {
    const { call, anon } = await setup()
    await call('PUT', '/api/decks/d1', { data: deck('d1', 'Goblins', 5), updatedAt: 5 })
    const first = ((await (await call('PUT', '/api/decks/d1/share')).json()) as { slug: string }).slug
    expect((await call('DELETE', '/api/decks/d1/share')).status).toBe(200)
    expect((await anon(`/api/public/decks/${first}`)).status).toBe(404)
    const second = ((await (await call('PUT', '/api/decks/d1/share')).json()) as { slug: string }).slug
    expect(second).not.toBe(first)
    expect((await anon(`/api/public/decks/${first}`)).status).toBe(404)
    expect((await anon(`/api/public/decks/${second}`)).status).toBe(200)
  })

  it('a deleted deck or a deleted account takes the link down; the export lists the links', async () => {
    const { call, anon, accounts, userId } = await setup()
    await call('PUT', '/api/decks/d1', { data: deck('d1', 'Goblins', 5), updatedAt: 5 })
    await call('PUT', '/api/decks/d2', { data: deck('d2', 'Elfos', 5), updatedAt: 5 })
    const s1 = ((await (await call('PUT', '/api/decks/d1/share')).json()) as { slug: string }).slug
    const s2 = ((await (await call('PUT', '/api/decks/d2/share')).json()) as { slug: string }).slug
    await call('DELETE', '/api/decks/d1', { updatedAt: 6 })
    expect((await anon(`/api/public/decks/${s1}`)).status).toBe(404)
    expect(((await accounts.exportAccount(userId)) as { publicLinks: unknown[] }).publicLinks).toHaveLength(2)
    await accounts.deleteAccount(userId)
    expect((await anon(`/api/public/decks/${s2}`)).status).toBe(404)
  })

  it('needs an account and the same origin to change links; bad slugs are just not found', async () => {
    const { call, anon } = await setup()
    await call('PUT', '/api/decks/d1', { data: deck('d1', 'Goblins', 5), updatedAt: 5 })
    expect((await call('PUT', '/api/decks/d1/share', undefined, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await fetch((await anon('/api/shares')).url)).status).toBe(401)
    expect((await anon('/api/public/decks/..%2F..%2Fetc')).status).toBe(404)
    expect((await anon('/api/public/decks/short')).status).toBe(404)
  })
})
