// A synchronous view of the catalog for the room core (épico 08). The RoomCore is pure and synchronous, so the server
// warms this cache (async, from the database) with the names and dates a message needs before handing the message to
// the room; the deck checks then read from memory.

import type { ClientCard } from './normalize'
import { normalizeName } from './normalize'
import type { CatalogStore, CommanderSnapshot } from './store'

export interface CatalogLookup {
  cardCount(): number
  resolveNames(names: string[]): Map<string, ClientCard>
  commanderAt(date: string): CommanderSnapshot
}

const MAX_CARDS = 20_000 // a few hundred decks' worth; old entries are dropped first
const MAX_DATES = 50

export class CatalogCache implements CatalogLookup {
  private readonly store: CatalogStore
  private readonly cards = new Map<string, ClientCard | null>() // normalized name → card (null = not in the catalog)
  private readonly dates = new Map<string, CommanderSnapshot>()
  private count = 0

  constructor(store: CatalogStore) {
    this.store = store
  }

  async refreshCount(): Promise<number> {
    this.count = await this.store.cardCount()
    return this.count
  }

  // After an import, cached cards and dates may be stale.
  async invalidate() {
    this.cards.clear()
    this.dates.clear()
    await this.refreshCount()
  }

  async warm(names: string[], dates: (string | undefined)[] = []) {
    const missing = [...new Set(names.map(normalizeName))].filter((k) => !this.cards.has(k))
    if (missing.length) {
      const found = await this.store.resolveNames(missing)
      for (const k of missing) this.remember(this.cards, k, found.get(k) ?? null, MAX_CARDS)
    }
    for (const date of dates) {
      if (date && !this.dates.has(date)) this.remember(this.dates, date, await this.store.commanderAt(date), MAX_DATES)
    }
  }

  cardCount(): number {
    return this.count
  }

  resolveNames(names: string[]): Map<string, ClientCard> {
    const found = new Map<string, ClientCard>()
    for (const name of names) {
      const key = normalizeName(name)
      const card = this.cards.get(key)
      if (card && !found.has(key)) found.set(key, card)
    }
    return found
  }

  commanderAt(date: string): CommanderSnapshot {
    return this.dates.get(date) ?? { date, banned: [], gameChangers: [] }
  }

  private remember<V>(map: Map<string, V>, key: string, value: V, max: number) {
    map.set(key, value)
    if (map.size > max) map.delete(map.keys().next().value!)
  }
}
