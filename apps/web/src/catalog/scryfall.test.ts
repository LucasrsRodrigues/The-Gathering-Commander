import { describe, expect, it, vi } from 'vitest'
import { imagesFor } from './catalog'
import { ScryfallCatalog } from './scryfall'

const images = (id: string) => ({ small: `s/${id}`, normal: `n/${id}`, large: `l/${id}` })

function fakeApi() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { identifiers } = JSON.parse(String(init.body)) as { identifiers: { name: string }[] }
    const data = identifiers
      .filter(({ name }) => !name.startsWith('Nope'))
      .map(({ name: asked }) => asked.replace(/\s+/g, ' ')) // the real API answers with the canonical name
      .map((name) => ({ id: `id-${name}`, oracle_id: `or-${name}`, name, type_line: 'Creature', image_uris: images(name) }))
    return { ok: true, status: 200, json: async () => ({ data }) }
  })
}

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.get(k) ?? null }
  setItem(k: string, v: string) { this.map.set(k, v) }
}

describe('ScryfallCatalog', () => {
  it('batches requests in groups of 75 with a pause between them', async () => {
    const fetchFn = fakeApi()
    const sleep = vi.fn(async () => {})
    const catalog = new ScryfallCatalog({ fetchFn, storage: null, sleep })
    const names = Array.from({ length: 160 }, (_, i) => `Card ${i}`)
    const { found, missing } = await catalog.resolve(names)
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(found.size).toBe(160)
    expect(missing).toEqual([])
  })

  it('reports missing names, normalizes spelling and registers images', async () => {
    const catalog = new ScryfallCatalog({ fetchFn: fakeApi(), storage: null, sleep: async () => {} })
    const { found, missing } = await catalog.resolve(['  Krenko,  Mob Boss ', 'Nope Card'])
    expect(missing).toEqual(['Nope Card'])
    const krenko = found.get('krenko, mob boss')!
    expect(krenko.ref).toMatchObject({ name: 'Krenko, Mob Boss', oracleId: 'or-Krenko, Mob Boss', typeLine: 'Creature' })
    expect(imagesFor(krenko.ref)?.large).toBe('l/Krenko, Mob Boss')
  })

  it('serves repeat lookups from the local cache', async () => {
    const storage = new MemoryStorage() as unknown as Storage
    const first = fakeApi()
    await new ScryfallCatalog({ fetchFn: first, storage, sleep: async () => {} }).resolve(['Sol Ring'])
    const second = fakeApi()
    const { found } = await new ScryfallCatalog({ fetchFn: second, storage, sleep: async () => {} }).resolve(['sol ring'])
    expect(second).not.toHaveBeenCalled()
    expect(found.has('sol ring')).toBe(true)
  })

  it('surfaces API failures', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }))
    await expect(new ScryfallCatalog({ fetchFn, storage: null }).resolve(['X'])).rejects.toThrow('429')
  })
})
