import { describe, expect, it } from 'vitest'
import { emptyCardData, toGameDeck } from './cardData'
import {
  addCard, addCategory, categoriesOf, deckSize, deckStats, deleteCategory, moveCard, moveCategory, moveEntry, newDeck, removeCard, removeEntry,
  renameCategory, setMainCategory, setPrinting, toggleCategory, toValidation,
} from './model'

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

describe('menu and drag operations (épico 10, T10.5)', () => {
  const start = addCard(addCard(newDeck('d', 'D', 0), { oracleId: 'o1', name: 'Sol Ring', tags: ['Mana'] }, 'cards', 0, 1),
    { oracleId: 'o2', name: 'Forest', scryfallId: 'art' }, 'cards', 0, 30)

  it('moveEntry moves every copy with art and categories; removeEntry removes all copies', () => {
    const moved = moveEntry(start, 'o2', 'cards', 'maybe', 1)
    expect(moved.maybe).toEqual([{ oracleId: 'o2', name: 'Forest', scryfallId: 'art', count: 30 }])
    expect(moved.cards.map((c) => c.oracleId)).toEqual(['o1'])
    expect(removeEntry(moved, 'o2', 'maybe', 2).maybe).toEqual([])
    expect(moveEntry(start, 'nope', 'cards', 'maybe', 1)).toBe(start)
  })

  it('setMainCategory puts the category first, keeps the others, and can take the main one off', () => {
    const ramp = setMainCategory(start, 'cards', ['o1', 'o2'], 'Ramp', 1)
    expect(ramp.cards.map((c) => c.tags)).toEqual([['Ramp', 'Mana'], ['Ramp']])
    expect(setMainCategory(ramp, 'cards', ['o1'], 'mana', 2).cards[0]!.tags).toEqual(['mana', 'Ramp']) // case-insensitive, no duplicate
    const off = setMainCategory(ramp, 'cards', ['o1', 'o2'], null, 3)
    expect(off.cards.map((c) => c.tags)).toEqual([['Mana'], undefined])
    expect(off.history).toEqual(start.history) // categories are not card changes
  })
})

describe('categories (épico 10, T10.6)', () => {
  const base = addCard(addCard(newDeck('d', 'D', 0), { oracleId: 'o1', name: 'Sol Ring' }, 'cards', 0), { oracleId: 'o2', name: 'Cultivate' }, 'maybe', 0)

  it('toggles a category on and off; the first one becomes the main one', () => {
    let d = toggleCategory(base, 'cards', ['o1'], 'Ramp', true, 1)
    d = toggleCategory(d, 'cards', ['o1'], 'Mana', true, 2)
    expect(d.cards[0]!.tags).toEqual(['Ramp', 'Mana'])
    expect(toggleCategory(d, 'cards', ['o1'], 'ramp', false, 3).cards[0]!.tags).toEqual(['Mana'])
    expect(toggleCategory(d, 'maybe', ['o2'], 'RAMP', true, 3).maybe[0]!.tags).toEqual(['Ramp']) // the deck's spelling wins
  })

  it('lists categories in order, counting the main category in the deck; empty ones stay', () => {
    let d = toggleCategory(base, 'cards', ['o1'], 'Ramp', true, 1)
    d = addCategory(d, 'Wincon', 2)
    expect(categoriesOf(d)).toEqual([{ name: 'Ramp', count: 1 }, { name: 'Wincon', count: 0 }])
    expect(addCategory(d, 'wincon', 3)).toBe(d) // no duplicates
    expect(categoriesOf(moveCategory(d, 'Wincon', -1, 4)).map((c) => c.name)).toEqual(['Wincon', 'Ramp'])
  })

  it('renames everywhere and merges into an existing category', () => {
    let d = toggleCategory(base, 'cards', ['o1'], 'Ramp', true, 1)
    d = toggleCategory(d, 'maybe', ['o2'], 'Terrenos extra', true, 1)
    d = renameCategory(d, 'Terrenos extra', 'ramp', 2)
    expect(d.maybe[0]!.tags).toEqual(['ramp'])
    expect(categoriesOf(d).map((c) => c.name)).toEqual(['Ramp'])
  })

  it('deleting a category removes it from the cards, never the cards, and leaves the history alone', () => {
    let d = toggleCategory(base, 'cards', ['o1'], 'Ramp', true, 1)
    d = toggleCategory(d, 'cards', ['o1'], 'Mana', true, 1)
    const out = deleteCategory(d, 'ramp', 2)
    expect(out.cards).toEqual([{ oracleId: 'o1', name: 'Sol Ring', count: 1, tags: ['Mana'] }])
    expect(categoriesOf(out).map((c) => c.name)).toEqual(['Mana'])
    expect(out.history).toEqual(base.history)
  })

  it('keeps names clean and within the limits', () => {
    const d = toggleCategory(base, 'cards', ['o1'], '  Ra\u0000mp   pesado  ', true, 1)
    expect(d.cards[0]!.tags).toEqual(['Ramp pesado'])
    expect(toggleCategory(base, 'cards', ['o1'], '   ', true, 1)).toBe(base)
  })
})
