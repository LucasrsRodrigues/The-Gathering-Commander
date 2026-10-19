import { describe, expect, it, vi } from 'vitest'
import { imagesFor } from './catalog'
import { ScryfallCatalog, toCatalogCard } from './scryfall'

const CDN = 'https://cards.scryfall.io'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const img = (n: number) => ({ small: `${CDN}/s/${n}.jpg`, normal: `${CDN}/n/${n}.jpg`, large: `${CDN}/l/${n}.jpg` })

const rhystic = {
  id: id(1), oracle_id: id(101), name: 'Rhystic Study', type_line: 'Enchantment', cmc: 3,
  oracle_text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
  color_identity: ['U'], keywords: [], legalities: { commander: 'legal' }, game_changer: true, image_uris: img(1),
}

function respond(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

describe('toCatalogCard facts', () => {
  it('maps the fields deck validation needs', () => {
    const card = toCatalogCard(rhystic)!
    expect(card.manaValue).toBe(3)
    expect(card.facts).toEqual({
      oracleId: id(101), name: 'Rhystic Study', typeLine: 'Enchantment', oracleText: rhystic.oracle_text,
      colorIdentity: ['U'], keywords: [], legalCommander: 'legal', gameChanger: true,
    })
  })

  it('reads multi-face cards and sanitizes odd values', () => {
    const card = toCatalogCard({
      id: id(2), name: 'Front // Back', cmc: -5, color_identity: ['G', 'X', 7], keywords: ['Partner', 9, 'x'.repeat(100)],
      legalities: { commander: 'weird' }, game_changer: 'yes',
      card_faces: [
        { name: 'Front', type_line: 'Legendary Creature — Elf', oracle_text: 'Partner', oracle_id: id(102), image_uris: img(2) },
        { name: 'Back', type_line: 'Sorcery', oracle_text: 'Draw two cards.' },
      ],
    })!
    expect(card.facts).toMatchObject({
      oracleId: id(102), typeLine: 'Legendary Creature — Elf', oracleText: 'Partner\nDraw two cards.',
      colorIdentity: ['G'], keywords: ['Partner'], legalCommander: 'not_legal', gameChanger: false,
    })
    expect(card.manaValue).toBe(0)
    expect(card.images?.small).toBe(img(2).small)
  })
})

describe('search, autocomplete and printings', () => {
  it('searches with Scryfall syntax and caches results for later lookups', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const u = new URL(url)
      expect(u.pathname).toBe('/cards/search')
      expect(u.searchParams.get('q')).toBe('t:enchantment id<=u')
      return respond({ total_cards: 1, data: [rhystic] })
    })
    const storage = new Map<string, string>()
    const store = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) } as Storage
    const catalog = new ScryfallCatalog({ fetchFn, storage: store, sleep: async () => {} })
    const page = await catalog.search('  t:enchantment id<=u ')
    expect(page.total).toBe(1)
    expect(page.cards[0]!.facts?.gameChanger).toBe(true)
    expect(imagesFor(page.cards[0]!.ref)?.large).toBe(img(1).large)

    const again = await catalog.resolve(['rhystic study'])
    expect(again.found.size).toBe(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('treats 404 as "no results" and ignores unsafe queries', async () => {
    const fetchFn = vi.fn(async () => respond({ object: 'error' }, 404))
    const catalog = new ScryfallCatalog({ fetchFn, storage: null, sleep: async () => {} })
    expect(await catalog.search('zzzz')).toEqual({ cards: [], total: 0 })
    expect(await catalog.search('evil‮flip')).toEqual({ cards: [], total: 0 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('autocompletes from 2 characters, keeping only safe strings', async () => {
    const fetchFn = vi.fn(async () => respond({ data: ['Sol Ring', 42, 'x'.repeat(300), 'Solemn Simulacrum'] }))
    const catalog = new ScryfallCatalog({ fetchFn, storage: null, sleep: async () => {} })
    expect(await catalog.autocomplete('s')).toEqual([])
    expect(await catalog.autocomplete('so')).toEqual(['Sol Ring', 'Solemn Simulacrum'])
  })

  it('lists printings by oracle id and resolves a chosen printing from cache', async () => {
    const print = { ...rhystic, id: id(3), image_uris: img(3) }
    const fetchFn = vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get('q')).toBe(`oracleid:${id(101)}`)
      return respond({ data: [print, rhystic] })
    })
    const storage = new Map<string, string>()
    const store = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) } as Storage
    const catalog = new ScryfallCatalog({ fetchFn, storage: store, sleep: async () => {} })
    expect((await catalog.printings(id(101))).map((c) => c.ref.scryfallId)).toEqual([id(3), id(1)])
    expect(await catalog.printings('not-an-id')).toEqual([])
    const chosen = await catalog.resolvePrintings([id(3)])
    expect(chosen.get(id(3))?.images?.small).toBe(img(3).small)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('aborted searches never hit the network', async () => {
    const fetchFn = vi.fn(async () => respond({ data: [] }))
    const catalog = new ScryfallCatalog({ fetchFn, storage: null, sleep: async () => {} })
    const controller = new AbortController()
    controller.abort()
    await expect(catalog.search('sol', { signal: controller.signal })).rejects.toThrow()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('spaces requests out with one shared throttle', async () => {
    const fetchFn = vi.fn(async () => respond({ data: [] }))
    const sleep = vi.fn(async () => {})
    const catalog = new ScryfallCatalog({ fetchFn, storage: null, sleep })
    await Promise.all([catalog.search('a'), catalog.search('b'), catalog.autocomplete('cd')])
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    for (const [ms] of sleep.mock.calls as unknown as [number][]) expect(ms).toBeGreaterThan(0)
  })
})
