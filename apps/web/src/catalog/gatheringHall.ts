// Catalog port backed by our own server (versioned catalog, épico 01), with Scryfall as the fallback:
// if the server is down, has no catalog yet, or misses a card, the app keeps working exactly as before.
// Search, autocomplete and printings stay on Scryfall (their search syntax is the feature).

import { normalizeName, rememberImages, type CatalogCard, type CatalogPort, type RequestOptions, type ResolveResult, type SearchPage } from './catalog'
import { toCatalogCard } from './scryfall'

const TIMEOUT_MS = 4_000
const BATCH = 300

export interface CommanderSnapshot {
  date: string
  banned: { oracleId: string; name: string }[]
  gameChangers: { oracleId: string; name: string }[]
}

// Banlist and Game Changers as of a date (presets with "banlist de uma data").
export interface LegalityPort {
  commanderAt(date: string): Promise<CommanderSnapshot | null>
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export class GatheringHallCatalog implements CatalogPort, LegalityPort {
  private readonly base: string
  private readonly fallback: CatalogPort
  private readonly fetchFn: Fetch
  private available: Promise<boolean> | null = null

  constructor(serverHttp: string, fallback: CatalogPort, fetchFn: Fetch = (u, i) => fetch(u, i)) {
    this.base = `${serverHttp.replace(/\/+$/, '')}/api/catalog`
    this.fallback = fallback
    this.fetchFn = fetchFn
  }

  private request(path: string, init: RequestInit = {}) {
    return this.fetchFn(`${this.base}${path}`, {
      ...init, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  }

  // Checked once per page load: a server without catalog (or offline) sends everything to Scryfall.
  private isAvailable(): Promise<boolean> {
    this.available ??= this.request('/status')
      .then(async (r) => r.ok && Number(((await r.json()) as { cards?: unknown }).cards) > 0)
      .catch(() => false)
    return this.available
  }

  async resolve(names: string[], onProgress?: (done: number, total: number) => void): Promise<ResolveResult> {
    if (!(await this.isAvailable())) return this.fallback.resolve(names, onProgress)
    const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    const found = new Map<string, CatalogCard>()
    try {
      for (let i = 0; i < wanted.length; i += BATCH) {
        const res = await this.request('/resolve', { method: 'POST', body: JSON.stringify({ names: wanted.slice(i, i + BATCH) }) })
        if (!res.ok) throw new Error(String(res.status))
        const { cards } = (await res.json()) as { cards?: unknown[] }
        for (const raw of Array.isArray(cards) ? cards : []) {
          const card = toCatalogCard(raw as never) // same validation as Scryfall responses
          if (!card) continue
          found.set(normalizeName(card.ref.name), card)
          const front = (raw as { card_faces?: { name?: string }[] }).card_faces?.[0]?.name
          if (typeof front === 'string') found.set(normalizeName(front), card)
        }
        onProgress?.(Math.min(i + BATCH, wanted.length), wanted.length)
      }
    } catch {
      return this.fallback.resolve(names, onProgress)
    }
    found.forEach(rememberImages)
    // Brand-new cards may not be in today's import yet: ask Scryfall for whatever is missing.
    const missing = wanted.filter((n) => !found.has(normalizeName(n)))
    if (!missing.length) return { found, missing: [] }
    const rest = await this.fallback.resolve(missing)
    rest.found.forEach((card, key) => found.set(key, card))
    return { found, missing: rest.missing }
  }

  async commanderAt(date: string): Promise<CommanderSnapshot | null> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(await this.isAvailable())) return null
    try {
      const res = await this.request(`/commander?at=${date}`)
      return res.ok ? ((await res.json()) as CommanderSnapshot) : null
    } catch {
      return null
    }
  }

  resolvePrintings(ids: string[]) { return this.fallback.resolvePrintings(ids) }
  search(query: string, opts?: RequestOptions): Promise<SearchPage> { return this.fallback.search(query, opts) }
  autocomplete(prefix: string, opts?: RequestOptions) { return this.fallback.autocomplete(prefix, opts) }
  printings(oracleId: string, opts?: RequestOptions) { return this.fallback.printings(oracleId, opts) }
}
