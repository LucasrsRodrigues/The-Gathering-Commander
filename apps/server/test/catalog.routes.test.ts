import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { diffCatalog } from '../src/catalog/diff'
import { normalizeCard } from '../src/catalog/normalize'
import { SqliteCatalogStore } from '../src/catalog/store'
import { DEFAULT_CONFIG, startServer, type RunningServer } from '../src/server'
import { SqliteRoomStore } from '../src/store'
import { krenko, manaCrypt, rhystic, solRing } from './catalog.fixtures'

let server: RunningServer
let catalog: SqliteCatalogStore
let rooms: SqliteRoomStore
let base: string

beforeAll(async () => {
  catalog = new SqliteCatalogStore(':memory:')
  const records = [solRing, manaCrypt, rhystic, krenko].map((c) => normalizeCard(c)!)
  catalog.apply(diffCatalog(new Map(), records), records, '2026-10-01')
  rooms = new SqliteRoomStore(':memory:')
  server = await startServer({ ...DEFAULT_CONFIG, port: 0, catalogRequestsPerMinute: 8 }, rooms, undefined, catalog)
  base = `http://127.0.0.1:${server.port}/api/catalog`
})

afterAll(async () => {
  await server.close()
  rooms.close()
  catalog.close()
})

const resolve = (body: unknown) => fetch(`${base}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('catalog API', () => {
  it('resolves names to cards in the format the web app validates', async () => {
    const res = await resolve({ names: ['sol ring', 'Krenko, Mob Boss', 'nope'] })
    const { cards } = (await res.json()) as { cards: { name: string; legalities: { commander: string } }[] }
    expect(cards.map((c) => c.name)).toEqual(['Sol Ring', 'Krenko, Mob Boss'])
    expect(cards[0]!.legalities.commander).toBe('legal')
  })

  it('answers the Commander snapshot and a card as of a date, with caching', async () => {
    const res = await fetch(`${base}/commander?at=2026-10-05`)
    expect(res.headers.get('cache-control')).toContain('max-age')
    const snap = (await res.json()) as { banned: { name: string }[]; gameChangers: { name: string }[] }
    expect(snap.banned.map((c) => c.name)).toEqual(['Mana Crypt'])
    expect(snap.gameChangers.map((c) => c.name)).toEqual(['Rhystic Study'])
    const id = normalizeCard(solRing)!.oracleId
    expect((await fetch(`${base}/oracle/${id}?at=2026-10-05`)).status).toBe(200)
    expect((await fetch(`${base}/oracle/${id}?at=2020-01-01`)).status).toBe(404)
  })

  it('validates input and rate-limits per IP', async () => {
    expect((await resolve({ names: 'x' })).status).toBe(400)
    expect((await resolve({ names: Array(301).fill('a') })).status).toBe(400)
    expect((await fetch(`${base}/commander?at=ontem`)).status).toBe(400)
    expect((await fetch(`${base}/oracle/..%2f..%2fetc`)).status).toBe(400)
    let limited = false
    for (let i = 0; i < 10 && !limited; i++) limited = (await fetch(`${base}/status`)).status === 429
    expect(limited).toBe(true)
  })
})
