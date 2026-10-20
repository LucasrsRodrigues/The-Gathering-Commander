import { describe, expect, it } from 'vitest'
import { normalizeName, printKey, type CatalogCard, type CatalogPort } from '../catalog/catalog'
import { applyBulk } from './bulkApply'
import { parseBulk, parseBulkLine, serializeBulk } from './bulkText'
import { addCard, newDeck, toggleCategory, type Deck } from './model'

const line = (s: string) => {
  const r = parseBulkLine(s)
  return r && { ...r }
}

describe('deck text: reading lines', () => {
  it('reads our own format', () => {
    expect(line('1 Sol Ring (C21) 263 #Ramp #"Mana extra"')).toEqual({ count: 1, name: 'Sol Ring', set: 'c21', number: '263', tags: ['Ramp', 'Mana extra'], commander: false })
  })

  it('reads a Moxfield export line', () => {
    expect(line('1 Krenko, Mob Boss (DDT) 52 *F* *CMDR* #Goblins')).toEqual({ count: 1, name: 'Krenko, Mob Boss', set: 'ddt', number: '52', tags: ['Goblins'], commander: true })
    expect(line('30 Mountain (UNF) 238')).toMatchObject({ count: 30, name: 'Mountain', set: 'unf', number: '238', tags: [] })
  })

  it('reads an Archidekt export line (categories in brackets, colors dropped)', () => {
    expect(line('1x Sol Ring (c21) 263 [Ramp,Artifact{top}] ^Have,#37d67a^')).toEqual({ count: 1, name: 'Sol Ring', set: 'c21', number: '263', tags: ['Ramp', 'Artifact'], commander: false })
    expect(line('1x Lightning Bolt [Removal]')).toEqual({ count: 1, name: 'Lightning Bolt', tags: ['Removal'], commander: false })
  })

  it('keeps names with slashes and commas; refuses junk', () => {
    expect(line('1 Fire // Ice')).toMatchObject({ name: 'Fire // Ice' })
    expect(line('0 Sol Ring')).toBeNull()
    expect(line('100 Sol Ring')).toBeNull()
  })
})

describe('deck text: sections and limits', () => {
  it('reads Commander, Deck and Talvez sections, and tokens are ignored', () => {
    const p = parseBulk('Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Sol Ring\n\nTalvez\n1 Rhystic Study\n\nTokens\n1 Goblin')
    expect([p.commanders, p.cards, p.maybe].map((l) => l.map((e) => e.name))).toEqual([['Krenko, Mob Boss'], ['Sol Ring'], ['Rhystic Study']])
    expect(parseBulk('Maybeboard\n1 A\nSideboard\n1 B').maybe.map((e) => e.name)).toEqual(['A', 'B'])
  })

  it('bounds the text and reports lines it cannot read', () => {
    expect(parseBulk('x'.repeat(30_001)).errors[0]).toMatch(/30000/)
    const p = parseBulk('1 Sol Ring\n0 Bad\n1 Evil‮name')
    expect(p.cards).toHaveLength(1)
    expect(p.errors).toHaveLength(2)
  })
})

// A catalog that knows a few cards and one printing.
function fakeCatalog(): CatalogPort {
  const card = (name: string, extra: Partial<CatalogCard> = {}): CatalogCard => ({
    ref: { name, scryfallId: `id-${name}`, oracleId: `or-${name}` }, images: null, manaValue: 1,
    facts: { oracleId: `or-${name}`, name, typeLine: 'Artifact', oracleText: '', colorIdentity: [], keywords: [], legalCommander: 'legal', gameChanger: false },
    ...extra,
  })
  const known = ['Krenko, Mob Boss', 'Sol Ring', 'Rhystic Study', 'Mountain'].map((n) => card(n))
  const special = card('Sol Ring', { ref: { name: 'Sol Ring', scryfallId: 'id-sol-c21', oracleId: 'or-Sol Ring' }, print: { set: 'c21', number: '263' } })
  return {
    resolve: async (names) => {
      const found = new Map<string, CatalogCard>()
      for (const n of names) {
        const c = known.find((k) => normalizeName(k.ref.name) === normalizeName(n))
        if (c) found.set(normalizeName(n), c)
      }
      return { found, missing: names.filter((n) => !found.has(normalizeName(n))) }
    },
    resolveSetNumbers: async (prints) => new Map(prints.some((p) => printKey(p.set, p.number) === 'c21/263') ? [['c21/263', special]] : []),
    resolvePrintings: async () => new Map(),
    search: async () => ({ cards: [], total: 0 }),
    autocomplete: async () => [],
    printings: async () => [],
  }
}

function sampleDeck(): Deck {
  let d = addCard(newDeck('d', 'D', 0), { oracleId: 'or-Krenko, Mob Boss', name: 'Krenko, Mob Boss' }, 'commanders', 0)
  d = addCard(d, { oracleId: 'or-Sol Ring', name: 'Sol Ring', scryfallId: 'id-sol-c21' }, 'cards', 0)
  d = addCard(d, { oracleId: 'or-Mountain', name: 'Mountain' }, 'cards', 0, 30)
  d = addCard(d, { oracleId: 'or-Rhystic Study', name: 'Rhystic Study' }, 'maybe', 0)
  d = toggleCategory(d, 'cards', ['or-Sol Ring'], 'Ramp', true, 0)
  return toggleCategory(d, 'cards', ['or-Sol Ring'], 'Mana extra', true, 0)
}
const print = (id: string) => (id === 'id-sol-c21' ? { set: 'c21', number: '263' } : null)
const lists = (d: Deck) => (['commanders', 'cards', 'maybe'] as const).map((z) => [...d[z]].sort((a, b) => a.oracleId.localeCompare(b.oracleId)))

describe('deck text: saving', () => {
  it('fitness: writing the deck as text and saving it back gives the same deck', async () => {
    const deck = sampleDeck()
    const text = serializeBulk(deck, print)
    expect(text).toContain('1 Sol Ring (C21) 263 #Ramp #"Mana extra"')
    const { deck: back, missing } = await applyBulk(deck, parseBulk(text), fakeCatalog(), 10 * 60 * 60_000)
    expect(missing).toEqual([])
    expect(lists(back)).toEqual(lists(deck))
    expect(back.history).toEqual(deck.history) // nothing changed, nothing recorded
  })

  it('a save is one change in the history; unknown names are listed and the rest is saved', async () => {
    const deck = sampleDeck()
    const text = serializeBulk(deck, print).replace('30 Mountain', '28 Mountain\n2 Nope Card').replace('Deck\n', 'Deck\n1 Rhystic Study\n')
    const { deck: back, missing } = await applyBulk(deck, parseBulk(text), fakeCatalog(), deck.history.at(-1)!.at + 60_000)
    expect(missing).toEqual(['Nope Card'])
    expect(back.history).toHaveLength(deck.history.length + 1) // never merged into the previous entry
    expect(back.history.at(-1)).toMatchObject({
      added: [{ zone: 'cards', oracleId: 'or-Rhystic Study', count: 1 }], removed: [{ zone: 'cards', oracleId: 'or-Mountain', count: 2 }],
    })
  })

  it('(SET) number chooses the printing; without it the previous printing stays', async () => {
    const deck = addCard(newDeck('d', 'D', 0), { oracleId: 'or-Sol Ring', name: 'Sol Ring', scryfallId: 'old-art' }, 'cards', 0)
    const kept = await applyBulk(deck, parseBulk('1 Sol Ring'), fakeCatalog(), 1)
    expect(kept.deck.cards[0]!.scryfallId).toBe('old-art')
    const chosen = await applyBulk(deck, parseBulk('1 Sol Ring (C21) 263'), fakeCatalog(), 1)
    expect(chosen.deck.cards[0]!.scryfallId).toBe('id-sol-c21')
  })
})

describe('deck text: double-faced names', () => {
  it('"Front // Back" is found by its front face', async () => {
    const out = await applyBulk(newDeck('d', 'D', 0), parseBulk('1 Sol Ring // Back Face'), fakeCatalog(), 1) // the full name is unknown
    expect(out.missing).toEqual([])
    expect(out.deck.cards.map((c) => c.name)).toEqual(['Sol Ring'])
  })
})
