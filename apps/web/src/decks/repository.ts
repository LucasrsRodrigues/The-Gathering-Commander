// Deck storage port + adapters. IndexedDB is the default; when it is unavailable (some private modes)
// we fall back to memory so the session still works. Everything read back is re-validated.

import { sanitizeDeck } from '@gathering-hall/formats'
import type { Deck } from './model'

export interface DeckRepository {
  readonly persistent: boolean
  list(): Promise<Deck[]>
  get(id: string): Promise<Deck | undefined>
  save(deck: Deck): Promise<void>
  remove(id: string): Promise<void>
}

// Storage is writable by anything on this origin: stored decks go through the shared validator.
export { sanitizeDeck } from '@gathering-hall/formats'

const byRecent = (a: Deck, b: Deck) => b.updatedAt - a.updatedAt

export class MemoryDeckRepository implements DeckRepository {
  readonly persistent = false
  private readonly decks = new Map<string, Deck>()
  async list() { return [...this.decks.values()].sort(byRecent) }
  async get(id: string) { return this.decks.get(id) }
  async save(deck: Deck) { this.decks.set(deck.id, deck) }
  async remove(id: string) { this.decks.delete(id) }
}

const DB_NAME = 'gathering-hall'
const DB_VERSION = 1
const STORE = 'decks'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IndexedDbDeckRepository implements DeckRepository {
  readonly persistent = true
  private readonly db: IDBDatabase

  private constructor(db: IDBDatabase) {
    this.db = db
  }

  static async open(factory: IDBFactory = indexedDB): Promise<IndexedDbDeckRepository> {
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      // Schema migrations go here, keyed by event.oldVersion.
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    return new IndexedDbDeckRepository(await request(req))
  }

  private store(mode: IDBTransactionMode) {
    return this.db.transaction(STORE, mode).objectStore(STORE)
  }

  async list(): Promise<Deck[]> {
    const all = await request(this.store('readonly').getAll())
    return all.map(sanitizeDeck).filter((d): d is Deck => !!d).sort(byRecent)
  }

  async get(id: string): Promise<Deck | undefined> {
    return sanitizeDeck(await request(this.store('readonly').get(id))) ?? undefined
  }

  async save(deck: Deck): Promise<void> {
    await request(this.store('readwrite').put(deck))
  }

  async remove(id: string): Promise<void> {
    await request(this.store('readwrite').delete(id))
  }
}

export async function openDeckRepository(): Promise<DeckRepository> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('sem IndexedDB')
    return await IndexedDbDeckRepository.open()
  } catch {
    return new MemoryDeckRepository()
  }
}
