// Deck storage port + adapters. IndexedDB is the default; when it is unavailable (some private modes)
// we fall back to memory so the session still works. Everything read back is re-validated.

import { MAX_DECK_NAME, type Deck, type DeckCard } from './model'

export interface DeckRepository {
  readonly persistent: boolean
  list(): Promise<Deck[]>
  get(id: string): Promise<Deck | undefined>
  save(deck: Deck): Promise<void>
  remove(id: string): Promise<void>
}

const MAX_ENTRIES = 300
const MAX_COUNT = 99
const MAX_ID = 64

function text(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

function card(raw: unknown): DeckCard | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (!text(c.oracleId, MAX_ID) || !text(c.name, 200)) return null
  if (typeof c.count !== 'number' || !Number.isInteger(c.count) || c.count < 1 || c.count > MAX_COUNT) return null
  return { oracleId: c.oracleId, name: c.name, count: c.count, ...(text(c.scryfallId, MAX_ID) ? { scryfallId: c.scryfallId } : {}) }
}

// Storage is writable by anything on this origin: treat stored decks as untrusted input.
export function sanitizeDeck(raw: unknown): Deck | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (d.schemaVersion !== 1 || !text(d.id, MAX_ID) || typeof d.name !== 'string') return null
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_ENTRIES).map(card).filter((c): c is DeckCard => !!c) : [])
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    schemaVersion: 1,
    id: d.id,
    name: d.name.slice(0, MAX_DECK_NAME) || 'Deck sem nome',
    ...(text(d.presetId, MAX_ID) ? { presetId: d.presetId } : {}),
    commanders: list(d.commanders).slice(0, 2),
    cards: list(d.cards),
    createdAt: time(d.createdAt),
    updatedAt: time(d.updatedAt),
  }
}

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
