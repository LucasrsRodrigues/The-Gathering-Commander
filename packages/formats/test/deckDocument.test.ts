import { describe, expect, it } from 'vitest'
import { DECK_LIMITS, isLegacyDeck, sanitizeDeck, type Deck } from '../src/deckDocument'

// Decks as the app wrote them before épico 10 (schema v1).
const legacy = [
  { schemaVersion: 1, id: 'a', name: 'Krenko', presetId: 'oficial', commanders: [{ oracleId: 'k', name: 'Krenko, Mob Boss', count: 1, scryfallId: 's1' }],
    cards: [{ oracleId: 'o1', name: 'Sol Ring', count: 1 }, { oracleId: 'o2', name: 'Mountain', count: 30 }], createdAt: 10, updatedAt: 20 },
  { schemaVersion: 1, id: 'b', name: 'Partners', commanders: [{ oracleId: 'p1', name: 'Tymna', count: 1 }, { oracleId: 'p2', name: 'Thrasios', count: 1 }],
    cards: [], createdAt: 1, updatedAt: 1 },
  { schemaVersion: 1, id: 'c', name: '', commanders: [], cards: [{ oracleId: 'x', name: 'X', count: 99 }], createdAt: 5, updatedAt: 6 },
]

describe('deck document v2', () => {
  it('fitness: every v1 deck becomes v2 with nothing lost', () => {
    for (const v1 of legacy) {
      const v2 = sanitizeDeck(v1)!
      expect(v2.schemaVersion).toBe(2)
      expect(isLegacyDeck(v1)).toBe(true)
      expect(isLegacyDeck(v2)).toBe(false)
      const { schemaVersion: _a, ...before } = v1
      const { schemaVersion: _b, maybe, history, ...after } = v2
      expect(after).toEqual({ ...before, name: before.name || 'Deck sem nome' })
      expect(maybe).toEqual([])
      expect(history).toEqual([])
      expect(sanitizeDeck(v2)).toEqual(v2) // and v2 reads back unchanged
    }
  })

  it('keeps tags, the Talvez list, folder, description, category order and history', () => {
    const deck: Deck = {
      schemaVersion: 2, id: 'd', name: 'D', commanders: [], createdAt: 1, updatedAt: 2,
      cards: [{ oracleId: 'o1', name: 'Sol Ring', count: 1, tags: ['Ramp', 'Mana'] }],
      maybe: [{ oracleId: 'o9', name: 'Rhystic Study', count: 1, tags: ['Compra'] }],
      folder: 'Casuais', description: 'Linha 1\nLinha 2', tagOrder: ['Ramp', 'Compra', 'Vazia'],
      history: [{ at: 2, added: [{ zone: 'cards', oracleId: 'o1', name: 'Sol Ring', count: 1 }], removed: [] }],
    }
    expect(sanitizeDeck(JSON.parse(JSON.stringify(deck)))).toEqual(deck)
  })

  it('cleans and bounds what people type', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Tag ${i}`)
    const deck = sanitizeDeck({
      schemaVersion: 2, id: 'd', name: 'D', commanders: [], maybe: [], history: [], createdAt: 1, updatedAt: 1,
      cards: [
        { oracleId: 'o1', name: 'A', count: 1, tags: ['  ramp  ', 'Ramp', '', 42, 'x'.repeat(100), '‮evil\u0000', ...many] },
      ],
      folder: ' \u0007  Pasta   com   espaços ', description: 'd'.repeat(5000),
    })!
    const tags = deck.cards[0]!.tags!
    expect(tags.slice(0, 3)).toEqual(['ramp', 'x'.repeat(DECK_LIMITS.tagLength), 'evil'])
    expect(tags).toHaveLength(DECK_LIMITS.tagsPerCard)
    expect(deck.folder).toBe('Pasta com espaços')
    expect(deck.description).toHaveLength(DECK_LIMITS.description)
  })

  it('caps the Talvez list, the categories of the deck and the history', () => {
    const cards = Array.from({ length: 80 }, (_, i) => ({ oracleId: `o${i}`, name: `C${i}`, count: 1, tags: [`T${i}`] }))
    const history = Array.from({ length: 80 }, (_, i) => ({ at: i, added: [{ zone: 'cards', oracleId: 'o', name: 'X', count: 1 }], removed: [] }))
    const deck = sanitizeDeck({
      schemaVersion: 2, id: 'd', name: 'D', commanders: [], cards, createdAt: 1, updatedAt: 1, history,
      maybe: Array.from({ length: 200 }, (_, i) => ({ oracleId: `m${i}`, name: `M${i}`, count: 1 })),
    })!
    expect(deck.maybe).toHaveLength(DECK_LIMITS.maybe)
    expect(new Set(deck.cards.flatMap((c) => c.tags ?? [])).size).toBe(DECK_LIMITS.distinctTags)
    expect(deck.cards).toHaveLength(80) // the cards stay, only the extra categories go
    expect(deck.history).toHaveLength(DECK_LIMITS.history)
    expect(deck.history[0]!.at).toBe(30) // the oldest are dropped first
  })

  it('drops malformed history entries and refuses unknown versions', () => {
    const deck = sanitizeDeck({
      schemaVersion: 2, id: 'd', name: 'D', commanders: [], cards: [], maybe: [], createdAt: 1, updatedAt: 1,
      history: [{ at: 'x', added: [] }, { at: 1, added: [{ zone: 'sideboard', oracleId: 'o', name: 'X', count: 1 }], removed: [] }, 'junk'],
    })!
    expect(deck.history).toEqual([])
    expect(sanitizeDeck({ schemaVersion: 3, id: 'd', name: 'D' })).toBeNull()
  })
})
