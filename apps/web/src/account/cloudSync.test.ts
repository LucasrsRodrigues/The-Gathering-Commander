import { officialPreset, type Deck } from '@gathering-hall/formats'
import { describe, expect, it, vi } from 'vitest'
import { MemoryDeckRepository } from '../decks/repository'
import { LocalPresetRepository } from '../presets/repository'
import { CloudDeckRepository, CloudPresetRepository, CloudSync, PresetTimes } from './cloudSync'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.get(k) ?? null }
  setItem(k: string, v: string) { this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
}

// The server's rules, in memory: last write wins per document, tombstones, "since" by server time.
function fakeCloud() {
  const docs = new Map<string, { kind: string; id: string; data: unknown; updatedAt: number; changedAt: number }>()
  let clock = 0
  let online = true
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    if (!online) throw new Error('offline')
    const u = new URL(url)
    if (u.pathname === '/api/sync') {
      const since = Number(u.searchParams.get('since'))
      const changed = [...docs.values()].filter((d) => d.changedAt > since)
      const out = (kind: string) => changed.filter((d) => d.kind === kind).map((d) => ({ id: d.id, data: d.data, updatedAt: d.updatedAt, deleted: d.data === null }))
      return Response.json({ decks: out('deck'), presets: out('preset'), now: clock })
    }
    const m = /^\/api\/(decks|presets)\/(.+)$/.exec(u.pathname)!
    const kind = m[1] === 'decks' ? 'deck' : 'preset'
    const id = decodeURIComponent(m[2]!)
    const body = JSON.parse(String(init!.body)) as { data?: unknown; updatedAt: number }
    const key = `${kind}:${id}`
    const current = docs.get(key)
    if (current && current.updatedAt >= body.updatedAt) {
      return Response.json({ doc: { id, data: current.data, updatedAt: current.updatedAt, deleted: current.data === null } }, { status: 409 })
    }
    const data = init!.method === 'DELETE' ? null : body.data
    docs.set(key, { kind, id, data, updatedAt: body.updatedAt, changedAt: ++clock })
    return Response.json({ doc: { id, data, updatedAt: body.updatedAt, deleted: data === null } })
  })
  return { fetchFn, docs, setOnline: (v: boolean) => (online = v) }
}

function device(cloud: ReturnType<typeof fakeCloud>) {
  const storage = new MemoryStorage() as unknown as Storage
  const localDecks = new MemoryDeckRepository()
  const localPresets = new LocalPresetRepository(storage)
  const times = new PresetTimes(storage)
  let now = 1000
  const notices: string[] = []
  const sync = new CloudSync({ base: 'http://srv', decks: localDecks, presets: localPresets, times, storage, fetchFn: cloud.fetchFn, now: () => now, notice: (m) => notices.push(m) })
  return {
    sync, notices, local: localDecks,
    decks: new CloudDeckRepository(localDecks, sync),
    presets: new CloudPresetRepository(localPresets, sync, times, () => now),
    at: (t: number) => (now = t),
  }
}

const deck = (id: string, name: string, updatedAt: number): Deck => ({ schemaVersion: 2, id, name, commanders: [], cards: [{ oracleId: 'o1', name: 'Sol Ring', count: 1 }], maybe: [], history: [], createdAt: 1, updatedAt })

describe('cloud sync on the device', () => {
  it('without an account nothing goes to the server', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    await a.decks.save(deck('d1', 'Local', 10))
    await a.sync.sync()
    expect(cloud.fetchFn).not.toHaveBeenCalled()
    expect(await a.decks.list()).toHaveLength(1)
  })

  it('the first login uploads this device; another device then gets it all', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    await a.decks.save(deck('d1', 'Krenko', 10))
    a.presets.save({ ...officialPreset(), id: 'sexta', name: 'Sexta' })
    a.sync.setUser('u1')
    await a.sync.sync()
    expect([...cloud.docs.keys()].sort()).toEqual(['deck:d1', 'preset:sexta'])

    const b = device(cloud)
    b.sync.setUser('u1')
    await b.sync.sync()
    expect((await b.decks.get('d1'))?.name).toBe('Krenko')
    expect(b.presets.list().map((p) => p.name)).toContain('Sexta')
    expect(b.sync.version.get()).toBeGreaterThan(0) // open lists reload
  })

  it('an edit on one device reaches the other; an older unsent edit is replaced, with a notice', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    const b = device(cloud)
    a.sync.setUser('u1')
    b.sync.setUser('u1')
    await a.decks.save(deck('d1', 'v1', 10))
    await a.sync.sync()
    await b.sync.sync()

    cloud.setOnline(false)
    await a.decks.save(deck('d1', 'edit em A (offline)', 20))
    await a.sync.sync() // offline: stays pending
    cloud.setOnline(true)
    await b.decks.save(deck('d1', 'edit em B', 30))
    await b.sync.sync()

    await a.sync.sync()
    expect((await a.decks.get('d1'))?.name).toBe('edit em B')
    expect(a.notices[0]).toMatch(/editado em outro aparelho/)
  })

  it('a newer edit made offline wins once the device is back online', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    const b = device(cloud)
    a.sync.setUser('u1')
    b.sync.setUser('u1')
    await a.decks.save(deck('d1', 'v1', 10))
    await a.sync.sync()
    cloud.setOnline(false)
    await a.decks.save(deck('d1', 'v2 offline', 50))
    await a.sync.sync()
    cloud.setOnline(true)
    await a.sync.sync()
    await b.sync.sync()
    expect((await b.decks.get('d1'))?.name).toBe('v2 offline')
  })

  it('deleting on one device deletes on the other', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    const b = device(cloud)
    a.sync.setUser('u1')
    b.sync.setUser('u1')
    await a.decks.save(deck('d1', 'x', 10))
    await a.sync.sync()
    await b.sync.sync()
    a.at(5000)
    await a.decks.remove('d1')
    await a.sync.sync()
    await b.sync.sync()
    expect(await b.decks.get('d1')).toBeUndefined()
  })

  it('signing out keeps a local copy, or clears this browser', async () => {
    const cloud = fakeCloud()
    const keep = device(cloud)
    keep.sync.setUser('u1')
    await keep.decks.save(deck('d1', 'x', 10))
    await keep.sync.sync()
    await keep.sync.signOut(true)
    expect(await keep.decks.list()).toHaveLength(1)

    const clear = device(cloud)
    clear.sync.setUser('u1')
    await clear.sync.sync()
    clear.presets.save({ ...officialPreset(), id: 'p', name: 'P' })
    await clear.sync.signOut(false)
    expect(await clear.decks.list()).toEqual([])
    expect(clear.presets.list().map((p) => p.id)).toEqual([officialPreset().id])
    expect(clear.sync.signedIn).toBe(false)
  })

  it('a v1 deck in the cloud (from an old app) arrives already in the v2 format', async () => {
    const cloud = fakeCloud()
    cloud.docs.set('deck:old', { kind: 'deck', id: 'old', updatedAt: 10, changedAt: 1, data: {
      schemaVersion: 1, id: 'old', name: 'Antigo', commanders: [], cards: [{ oracleId: 'o1', name: 'Sol Ring', count: 1 }], createdAt: 1, updatedAt: 10,
    } })
    const a = device(cloud)
    a.sync.setUser('u1')
    await a.sync.sync()
    expect(await a.decks.get('old')).toMatchObject({ schemaVersion: 2, name: 'Antigo', maybe: [], history: [] })
  })
})

