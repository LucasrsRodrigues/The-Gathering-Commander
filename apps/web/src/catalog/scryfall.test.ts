import { describe, expect, it, vi } from 'vitest'
import { imagesFor } from './catalog'
import { isApiUrl, isImageUrl } from './hosts'
import { ScryfallCatalog } from './scryfall'

const CDN = 'https://cards.scryfall.io'
const slug = (name: string) => encodeURIComponent(name)
const images = (name: string) => ({ small: `${CDN}/small/${slug(name)}.jpg`, normal: `${CDN}/normal/${slug(name)}.jpg`, large: `${CDN}/large/${slug(name)}.jpg` })
// A deterministic UUID-shaped id per name, like Scryfall's.
const uuid = (name: string) => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hex = h.toString(16).padStart(8, '0')
  return `${hex}-0000-4000-8000-${hex}0000`
}

function fakeApi() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { identifiers } = JSON.parse(String(init.body)) as { identifiers: { name: string }[] }
    const data = identifiers
      .filter(({ name }) => !name.startsWith('Nope'))
      .map(({ name: asked }) => asked.replace(/\s+/g, ' ')) // the real API answers with the canonical name
      .map((name) => ({ id: uuid(name), oracle_id: `or-${name}`, name, type_line: 'Creature', image_uris: images(name) }))
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
    expect(imagesFor(krenko.ref)?.large).toBe(images('Krenko, Mob Boss').large)
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

  it('only sends credential-less requests to the Scryfall API', async () => {
    const fetchFn = fakeApi()
    await new ScryfallCatalog({ fetchFn, storage: null, sleep: async () => {} }).resolve(['Sol Ring'])
    const [url, init] = fetchFn.mock.calls[0]!
    expect(new URL(url).hostname).toBe('api.scryfall.com')
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error' })
  })

  it('drops image URLs outside the Scryfall CDN and malformed cards', async () => {
    const evil = { small: 'https://evil.example/x.jpg', normal: 'javascript:alert(1)', large: 'http://cards.scryfall.io/x.jpg' }
    const fetchFn = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ data: [
        { id: uuid('Bad Art'), name: 'Bad Art', image_uris: evil },
        { id: 'not-a-uuid', name: 'Bad Id' },
        { id: uuid('Long'), name: 'x'.repeat(500) },
      ] }),
    }))
    const { found, missing } = await new ScryfallCatalog({ fetchFn, storage: null, sleep: async () => {} })
      .resolve(['Bad Art', 'Bad Id', 'Long'])
    expect(found.get('bad art')?.images).toBeNull()
    expect(missing).toEqual(['Bad Id', 'Long'])
  })

  it('ignores tampered cache entries', async () => {
    const storage = new MemoryStorage() as unknown as Storage
    storage.setItem('gh-catalog-v2', JSON.stringify({
      'sol ring': { id: uuid('Sol Ring'), name: 'Sol Ring', image_uris: { small: 'https://evil.example/a', normal: 'x', large: 'y' } },
      ['__proto__']: { id: uuid('P'), name: 'Polluted' },
    }))
    const fetchFn = fakeApi()
    const { found } = await new ScryfallCatalog({ fetchFn, storage, sleep: async () => {} }).resolve(['Sol Ring'])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(found.get('sol ring')?.images?.small).toBe(images('Sol Ring').small)
    expect(({} as Record<string, unknown>).ref).toBeUndefined()
  })
})

describe('host allowlist', () => {
  it('accepts only https on the exact Scryfall hosts', () => {
    expect(isImageUrl('https://cards.scryfall.io/large/front/a.jpg')).toBe(true)
    expect(isApiUrl('https://api.scryfall.com/cards/collection')).toBe(true)
    for (const bad of [
      'http://cards.scryfall.io/a.jpg', 'https://cards.scryfall.io.evil.com/a.jpg', 'https://evil.com/cards.scryfall.io',
      'https://user:pw@cards.scryfall.io/a.jpg', 'https://cards.scryfall.io:8443/a.jpg', 'data:image/png;base64,AAAA', 42,
    ]) expect(isImageUrl(bad)).toBe(false)
    expect(isApiUrl('https://cards.scryfall.io/x')).toBe(false)
  })
})
