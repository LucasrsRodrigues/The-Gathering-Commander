import { describe, expect, it } from 'vitest'
import { emptyCardData, toGameDeck } from './cardData'
import { addCard, deckSize, deckStats, moveCard, newDeck, removeCard, setPrinting, toValidation } from './model'

// Fitness (épico 10, req. 9): the "Talvez" list never reaches validation, stats, the deck size or the game.
describe('the Talvez list stays out of the deck', () => {
  const base = addCard(addCard(newDeck('d', 'D', 1), { oracleId: 'k', name: 'Krenko' }, 'commanders', 1), { oracleId: 'o1', name: 'Sol Ring' }, 'cards', 1)
  const deck = addCard(base, { oracleId: 'm1', name: 'Rhystic Study', tags: ['Compra'] }, 'maybe', 2, 3)

  it('is ignored by validation, size, stats and the game deck', () => {
    expect(toValidation(deck)).toEqual(toValidation(base))
    expect(deckSize(deck)).toBe(2)
    const info = new Map([['m1', { typeLine: 'Enchantment', manaValue: 3, colorIdentity: ['U' as const] }]])
    expect(deckStats(deck, info).total).toBe(2)
    const game = toGameDeck(deck, emptyCardData())
    expect([...game.commanders, ...game.cards].map((c) => c.name)).toEqual(['Krenko', 'Sol Ring'])
  })

  it('a card moves between the deck and the Talvez list with its categories and printing', () => {
    const art = setPrinting(deck, 'm1', 'print-9', 3)
    const moved = moveCard(art, 'm1', 'maybe', 4)
    expect(moved.cards.find((c) => c.oracleId === 'm1')).toEqual({ oracleId: 'm1', name: 'Rhystic Study', tags: ['Compra'], scryfallId: 'print-9', count: 1 })
    expect(moved.maybe[0]!.count).toBe(2)
    const back = moveCard(moved, 'm1', 'cards', 5, 'maybe')
    expect(back.maybe[0]!.count).toBe(3)
    expect(back.cards.some((c) => c.oracleId === 'm1')).toBe(false)
  })

  it('new decks are written in the v2 format', () => {
    expect(newDeck('x', 'X', 1)).toMatchObject({ schemaVersion: 2, maybe: [], history: [] })
  })
})

describe('editing records the history (épico 10, T10.3)', () => {
  it('adding, removing and moving cards are recorded; quick edits become one entry', () => {
    let deck = addCard(newDeck('d', 'D', 0), { oracleId: 'o1', name: 'Sol Ring' }, 'cards', 0)
    deck = addCard(deck, { oracleId: 'o2', name: 'Mind Stone' }, 'cards', 60_000)
    deck = moveCard(deck, 'o2', 'cards', 120_000, 'maybe')
    expect(deck.history).toHaveLength(1)
    expect(deck.history[0]).toMatchObject({
      added: [{ zone: 'cards', oracleId: 'o1', count: 1 }, { zone: 'maybe', oracleId: 'o2', count: 1 }],
      removed: [],
    })
    const later = removeCard(deck, 'o1', 'cards', 60 * 60_000)
    expect(later.history).toHaveLength(2)
    expect(later.history[1]).toMatchObject({ added: [], removed: [{ oracleId: 'o1', name: 'Sol Ring' }] })
  })

  it('choosing art is not a change in the history', () => {
    const deck = addCard(newDeck('d', 'D', 0), { oracleId: 'o1', name: 'Sol Ring' }, 'cards', 0)
    expect(setPrinting(deck, 'o1', 'art', 60 * 60_000).history).toEqual(deck.history)
  })
})
