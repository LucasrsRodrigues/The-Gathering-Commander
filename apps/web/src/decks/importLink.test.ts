import { describe, expect, it, vi } from 'vitest'
import { normalizeName, type CatalogCard, type CatalogPort } from '../catalog/catalog'
import { importFromLink } from './importLink'

function catalog(): CatalogPort {
  const card = (name: string): CatalogCard => ({
    ref: { name, scryfallId: `id-${name}`, oracleId: `or-${name}` }, images: null, manaValue: 1,
    facts: { oracleId: `or-${name}`, name, typeLine: 'Artifact', oracleText: '', colorIdentity: [], keywords: [], legalCommander: 'legal', gameChanger: false },
  })
  const known = ['Krenko, Mob Boss', 'Sol Ring', 'Goblin Guide'].map(card)
  return {
    resolve: async (names) => {
      const found = new Map(names.flatMap((n) => {
        const c = known.find((k) => normalizeName(k.ref.name) === normalizeName(n))
        return c ? [[normalizeName(n), c] as const] : []
      }))
      return { found, missing: names.filter((n) => !found.has(normalizeName(n))) }
    },
    resolvePrintings: async () => new Map(), search: async () => ({ cards: [], total: 0 }), autocomplete: async () => [], printings: async () => [],
  }
}
const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('import by link in the app', () => {
  it('turns the server answer into a new deck with commander, categories and Talvez', async () => {
    const fetchFn = answer(200, { deck: {
      source: 'archidekt', name: 'Goblins',
      commanders: [{ count: 1, name: 'Krenko, Mob Boss', tags: [] }],
      cards: [{ count: 1, name: 'Sol Ring', set: 'c21', number: '263', tags: ['Ramp'] }, { count: 1, name: 'Carta Inexistente', tags: [] }],
      maybe: [{ count: 1, name: 'Goblin Guide', tags: ['Agressão'] }],
    } })
    const out = await importFromLink(' https://archidekt.com/decks/1 ', 'http://srv', catalog(), 'new-id', 5, fetchFn)
    expect(fetchFn).toHaveBeenCalledWith('http://srv/api/import/deck', expect.objectContaining({ method: 'POST', credentials: 'omit', body: JSON.stringify({ url: 'https://archidekt.com/decks/1' }) }))
    if (!out.ok) throw new Error(out.message)
    const deck = out.result.deck
    expect(deck).toMatchObject({ id: 'new-id', name: 'Goblins', schemaVersion: 2 })
    expect(deck.commanders.map((c) => c.name)).toEqual(['Krenko, Mob Boss'])
    expect(deck.cards).toEqual([{ oracleId: 'or-Sol Ring', name: 'Sol Ring', count: 1, tags: ['Ramp'] }])
    expect(deck.maybe[0]).toMatchObject({ name: 'Goblin Guide', tags: ['Agressão'] })
    expect(out.result.missing).toEqual(['Carta Inexistente'])
    expect(out.source).toBe('Archidekt')
  })

  it('shows the server message and offers pasting the text (but not for a bad link)', async () => {
    const blocked = await importFromLink('https://moxfield.com/decks/abcdefgh', 'http://srv', catalog(), 'x', 1, answer(502, { error: 'bloqueado', message: 'O site não deixou' }))
    expect(blocked).toEqual({ ok: false, message: 'O site não deixou', offerText: true })
    const bad = await importFromLink('https://evil.example', 'http://srv', catalog(), 'x', 1, answer(400, { error: 'link', message: 'Cole o link' }))
    expect(bad).toEqual({ ok: false, message: 'Cole o link', offerText: false })
    const offline = await importFromLink('https://archidekt.com/decks/1', 'http://srv', catalog(), 'x', 1, vi.fn(async () => { throw new Error('down') }))
    expect(offline).toMatchObject({ ok: false, offerText: true })
  })

  it('distrusts the answer: bad entries are dropped', async () => {
    const out = await importFromLink('https://archidekt.com/decks/1', 'http://srv', catalog(), 'x', 1, answer(200, { deck: {
      name: 'X', commanders: 'nope', cards: [{ count: 500, name: 'Sol Ring', tags: ['<b>', 7] }, { name: 42 }, null], maybe: [],
    } }))
    if (!out.ok) throw new Error(out.message)
    expect(out.result.deck.cards).toEqual([{ oracleId: 'or-Sol Ring', name: 'Sol Ring', count: 99, tags: ['<b>'] }]) // only ever rendered as text
  })
})
