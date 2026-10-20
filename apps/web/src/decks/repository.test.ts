import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { addCard, newDeck } from './model'
import { IndexedDbDeckRepository, MemoryDeckRepository, sanitizeDeck, type DeckRepository } from './repository'

const sample = (id: string, at: number) => addCard(newDeck(id, `Deck ${id}`, at), { oracleId: 'o1', name: 'Sol Ring' }, 'cards', at)

async function exercise(repo: DeckRepository) {
  await repo.save(sample('a', 1))
  await repo.save(sample('b', 2))
  expect((await repo.list()).map((d) => d.id)).toEqual(['b', 'a'])
  expect(await repo.get('a')).toEqual(sample('a', 1))
  await repo.remove('a')
  expect(await repo.get('a')).toBeUndefined()
  // "Undo" = save the removed deck again.
  await repo.save(sample('a', 1))
  expect((await repo.list()).length).toBe(2)
}

describe('deck repositories', () => {
  it('IndexedDB adapter persists across connections', async () => {
    const factory = new IDBFactory()
    await exercise(await IndexedDbDeckRepository.open(factory))
    const reopened = await IndexedDbDeckRepository.open(factory)
    expect((await reopened.list()).length).toBe(2)
    expect(reopened.persistent).toBe(true)
  })

  it('memory fallback behaves the same', async () => {
    const repo = new MemoryDeckRepository()
    await exercise(repo)
    expect(repo.persistent).toBe(false)
  })
})

describe('sanitizeDeck', () => {
  it('drops malformed entries and caps values', () => {
    const raw = {
      ...sample('x', 1),
      name: 'n'.repeat(500),
      commanders: [{ oracleId: 'c1', name: 'A', count: 1 }, { oracleId: 'c2', name: 'B', count: 1 }, { oracleId: 'c3', name: 'C', count: 1 }],
      cards: [{ oracleId: 'ok', name: 'Ok', count: 1 }, { oracleId: '', name: 'bad', count: 1 }, { oracleId: 'neg', name: 'Neg', count: -2 }, 'junk'],
      evil: '<script>',
    }
    const deck = sanitizeDeck(raw)!
    expect(deck.name).toHaveLength(60)
    expect(deck.commanders).toHaveLength(2)
    expect(deck.cards).toEqual([{ oracleId: 'ok', name: 'Ok', count: 1 }])
    expect(deck).not.toHaveProperty('evil')
  })

  it('rejects unknown schema versions', () => {
    expect(sanitizeDeck({ ...sample('x', 1), schemaVersion: 3 })).toBeNull()
    expect(sanitizeDeck(null)).toBeNull()
  })
})
