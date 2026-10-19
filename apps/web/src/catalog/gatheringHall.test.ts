import { describe, expect, it, vi } from 'vitest'
import type { CatalogCard, CatalogPort } from './catalog'
import { GatheringHallCatalog } from './gatheringHall'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const card = (n: number, name: string) => ({ id: id(n), oracle_id: id(100 + n), name, type_line: 'Artifact', color_identity: [], keywords: [], legalities: { commander: 'legal' }, game_changer: false, cmc: 1 })

function fallback(): CatalogPort & { resolve: ReturnType<typeof vi.fn> } {
  return {
    resolve: vi.fn(async (names: string[]) => ({
      found: new Map<string, CatalogCard>(names.filter((n) => n !== 'Ghost').map((n) => [n.toLowerCase(), { ref: { name: n }, images: null, facts: null, manaValue: 0 }])),
      missing: names.filter((n) => n === 'Ghost'),
    })),
    resolvePrintings: vi.fn(), search: vi.fn(), autocomplete: vi.fn(), printings: vi.fn(),
  } as never
}

function server(handler: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(new URL(url).pathname + new URL(url).search, init))
}

describe('GatheringHallCatalog', () => {
  it('resolves through our server and asks Scryfall only for what is missing', async () => {
    const fb = fallback()
    const fetchFn = server((path, init) => {
      if (path === '/api/catalog/status') return Response.json({ cards: 35000 })
      const { names } = JSON.parse(String(init?.body)) as { names: string[] }
      expect(names).toEqual(['Sol Ring', 'Brand New Card'])
      return Response.json({ cards: [card(1, 'Sol Ring')] })
    })
    const catalog = new GatheringHallCatalog('https://jogo.example', fb, fetchFn)
    const { found, missing } = await catalog.resolve(['Sol Ring', 'Brand New Card', ' Sol Ring '])
    expect(found.get('sol ring')?.facts?.oracleId).toBe(id(101))
    expect(fb.resolve).toHaveBeenCalledWith(['Brand New Card'])
    expect(missing).toEqual([])
  })

  it('falls back to Scryfall entirely when the server has no catalog or is down', async () => {
    const empty = fallback()
    await new GatheringHallCatalog('https://x', empty, server(() => Response.json({ cards: 0 }))).resolve(['Sol Ring'])
    expect(empty.resolve).toHaveBeenCalledWith(['Sol Ring'], undefined)

    const down = fallback()
    await new GatheringHallCatalog('https://x', down, vi.fn(async () => { throw new Error('offline') })).resolve(['Sol Ring'])
    expect(down.resolve).toHaveBeenCalledWith(['Sol Ring'], undefined)
  })

  it('drops malformed cards from the server like any untrusted response', async () => {
    const fetchFn = server((path) => path.endsWith('/status')
      ? Response.json({ cards: 1 })
      : Response.json({ cards: [{ id: 'not-a-uuid', name: 'Evil' }, card(2, 'Mind Stone')] }))
    const { found } = await new GatheringHallCatalog('https://x', fallback(), fetchFn).resolve(['Mind Stone'])
    expect([...found.keys()]).toEqual(['mind stone'])
  })

  it('reads the Commander snapshot as of a date', async () => {
    const fetchFn = server((path) => path.endsWith('/status')
      ? Response.json({ cards: 1 })
      : Response.json({ date: '2025-01-01', banned: [{ oracleId: 'x', name: 'Mana Crypt' }], gameChangers: [] }))
    const catalog = new GatheringHallCatalog('https://x', fallback(), fetchFn)
    expect((await catalog.commanderAt('2025-01-01'))?.banned[0]?.name).toBe('Mana Crypt')
    expect(await catalog.commanderAt('ontem')).toBeNull()
  })
})
