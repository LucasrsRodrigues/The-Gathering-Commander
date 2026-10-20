import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiUrl, fromArchidekt, fromMoxfield, importDeck, IMPORT_LIMITS, parseDeckLink } from '../src/import/decks'
import { DEFAULT_CONFIG, startServer } from '../src/server'
import { DbRoomStore } from '../src/store'
import { testDb } from './db.helpers'

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')) as unknown
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('deck links', () => {
  it('accepts only Archidekt and Moxfield deck links, and builds the API address itself', () => {
    expect(parseDeckLink('https://archidekt.com/decks/123456/krenko-goblins')).toEqual({ source: 'archidekt', id: '123456' })
    expect(parseDeckLink('https://www.moxfield.com/decks/oEWXWHM5eEGMmopExLWRCA')).toEqual({ source: 'moxfield', id: 'oEWXWHM5eEGMmopExLWRCA' })
    expect(apiUrl('archidekt', '123456')).toBe('https://archidekt.com/api/decks/123456/')
    for (const bad of [
      'https://archidekt.com.evil.example/decks/1', 'https://evil.example/archidekt.com/decks/1', 'http://127.0.0.1/decks/1',
      'https://archidekt.com:8443/decks/1', 'https://user@archidekt.com/decks/1', 'https://archidekt.com/decks/abc', 'file:///etc/passwd',
      'https://moxfield.com/decks/../../admin', 'javascript:alert(1)', 42, 'x'.repeat(400),
    ]) expect(parseDeckLink(bad), String(bad)).toBeNull()
  })
})

describe('normalizing the answers', () => {
  it('Archidekt: commander, categories as tags, Maybeboard to Talvez, deleted cards out, printing kept', () => {
    const deck = fromArchidekt(fixture('archidekt-deck.json'))!
    expect(deck.name).toBe('Fun With Fungus')
    expect(deck.commanders).toEqual([{ count: 1, name: 'Thelon of Havenwood', set: 'tsp', number: '227', tags: [] }])
    expect(deck.cards.map((c) => [c.name, c.tags])).toEqual([
      ['Mana Crypt', ['Ramp']], ['Spread the Sickness', ['Removal', 'Fungus']], ['Contagion Engine', []], ['Contagion Clasp', []],
    ])
    expect(deck.maybe.map((c) => c.name)).toEqual(['Plaguemaw Beast'])
  })

  it('Moxfield: boards and author tags', () => {
    const deck = fromMoxfield(fixture('moxfield-deck.json'))!
    expect(deck.commanders).toEqual([{ count: 1, name: 'Krenko, Mob Boss', set: 'ddt', number: '52', tags: [] }])
    expect(deck.cards).toEqual([
      { count: 1, name: 'Sol Ring', set: 'c21', number: '263', tags: ['Ramp', 'Mana'] }, { count: 30, name: 'Mountain', set: 'unf', number: '238', tags: [] },
    ])
    expect(deck.maybe.map((c) => [c.name, c.tags])).toEqual([['Goblin Guide', ['Agressão']]])
  })

  it('ignores junk entries instead of failing', () => {
    const deck = fromArchidekt({ name: 'X', cards: [{ quantity: -1, card: { oracleCard: { name: 'A' } } }, 'junk', { quantity: 2, card: { oracleCard: { name: 'B' }, edition: { editioncode: '../x' } } }] })!
    expect(deck.cards).toEqual([{ count: 2, name: 'B', tags: [] }])
  })
})

describe('fetching', () => {
  it('reports blocks, private decks, missing decks and outages, so the app can offer pasting the text', async () => {
    const html = new Response('<html>challenge</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    const cases: [Response | Error, string, string][] = [
      [new Response('', { status: 403 }), 'https://moxfield.com/decks/abcdefgh', 'bloqueado'],
      [html, 'https://moxfield.com/decks/abcdefgh', 'bloqueado'],
      [new Response('', { status: 403 }), 'https://archidekt.com/decks/1', 'privado'],
      [new Response('', { status: 404 }), 'https://archidekt.com/decks/1', 'naoEncontrado'],
      [new Error('timeout'), 'https://archidekt.com/decks/1', 'foraDoAr'],
      [jsonResponse({ hello: 'world' }), 'https://archidekt.com/decks/1', 'formato'],
    ]
    for (const [answer, link, error] of cases) {
      const fetchFn = vi.fn(async () => { if (answer instanceof Error) throw answer; return answer })
      expect(await importDeck(link, fetchFn), link + error).toEqual({ ok: false, error })
    }
    expect(await importDeck('https://evil.example/decks/1', vi.fn())).toEqual({ ok: false, error: 'link' })
  })

  it('refuses answers bigger than the limit and never follows redirects', async () => {
    const huge = new Response('x'.repeat(IMPORT_LIMITS.bytes + 10), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => huge)
    expect(await importDeck('https://archidekt.com/decks/1', fetchFn)).toEqual({ ok: false, error: 'formato' })
    expect(fetchFn.mock.calls[0]![1]).toMatchObject({ redirect: 'error', method: 'GET' })
  })
})

describe('POST /api/import/deck', () => {
  const ORIGIN = 'http://localhost:5180'
  const cleanup: (() => Promise<void>)[] = []
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()!()
  })

  it('imports for the same origin, rate limited per IP', async () => {
    const db = await testDb()
    const fetchFn = vi.fn(async () => jsonResponse(fixture('archidekt-deck.json')))
    const server = await startServer({ ...DEFAULT_CONFIG, port: 0, allowedOrigins: [ORIGIN] }, new DbRoomStore(db), undefined, null, null, null, null, fetchFn)
    cleanup.push(() => server.close())
    const call = (origin = ORIGIN) => fetch(`http://127.0.0.1:${server.port}/api/import/deck`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://archidekt.com/decks/1/fun' }),
    })
    const ok = await call()
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { deck: { name: string } }).deck.name).toBe('Fun With Fungus')
    expect(fetchFn).toHaveBeenCalledWith('https://archidekt.com/api/decks/1/', expect.anything())
    expect((await call('https://evil.example')).status).toBe(403)
    const codes: number[] = []
    for (let i = 0; i < 10; i++) codes.push((await call()).status)
    expect(codes.at(-1)).toBe(429)
  })
})
