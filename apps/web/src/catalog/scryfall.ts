// Scryfall adapter for the catalog port. Respects their API guidelines: batched /cards/collection
// (max 75 identifiers), a pause between requests and a local cache so repeat games cost nothing.

import { normalizeName, rememberImages, type CatalogCard, type CatalogPort, type ResolveResult } from './catalog'

const API = 'https://api.scryfall.com/cards/collection'
const BATCH = 75
const PAUSE_MS = 100
const CACHE_KEY = 'gh-catalog-v1'

interface ScryfallImages { small: string; normal: string; large: string }
interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  type_line?: string
  image_uris?: ScryfallImages
  card_faces?: { name: string; type_line?: string; image_uris?: ScryfallImages }[]
}

type Fetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export function toCatalogCard(card: ScryfallCard): CatalogCard {
  const face = card.card_faces?.[0]
  const images = card.image_uris ?? face?.image_uris
  return {
    ref: {
      name: card.name,
      scryfallId: card.id,
      imageKey: card.id,
      ...(card.oracle_id ? { oracleId: card.oracle_id } : {}),
      ...((card.type_line ?? face?.type_line) ? { typeLine: card.type_line ?? face?.type_line } : {}),
    },
    images: images ? { small: images.small, normal: images.normal, large: images.large } : null,
  }
}

export class ScryfallCatalog implements CatalogPort {
  private readonly fetchFn: Fetch
  private readonly storage: Storage | null
  private readonly sleep: (ms: number) => Promise<void>

  constructor(opts: { fetchFn?: Fetch; storage?: Storage | null; sleep?: (ms: number) => Promise<void> } = {}) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init))
    this.storage = opts.storage === undefined ? safeLocalStorage() : opts.storage
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  async resolve(names: string[], onProgress?: (done: number, total: number) => void): Promise<ResolveResult> {
    const cache = this.readCache()
    const found = new Map<string, CatalogCard>()
    const wanted = [...new Set(names.map(normalizeName))]
    const toFetch: string[] = []
    for (const key of wanted) {
      const hit = cache[key]
      if (hit) found.set(key, hit)
      else toFetch.push(key)
    }

    // Keep the original spelling for the request; the API matches names case-insensitively.
    const original = new Map(names.map((n) => [normalizeName(n), n.trim()]))
    for (let i = 0; i < toFetch.length; i += BATCH) {
      if (i > 0) await this.sleep(PAUSE_MS)
      const batch = toFetch.slice(i, i + BATCH)
      const res = await this.fetchFn(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identifiers: batch.map((key) => ({ name: original.get(key) ?? key })) }),
      })
      if (!res.ok) throw new Error(`Scryfall respondeu ${res.status}`)
      const json = (await res.json()) as { data?: ScryfallCard[] }
      for (const card of json.data ?? []) {
        const entry = toCatalogCard(card)
        // Index by full name and, for multi-face cards, by the front face name people usually type.
        const keys = [normalizeName(card.name), ...(card.card_faces?.[0] ? [normalizeName(card.card_faces[0].name)] : [])]
        for (const key of keys) {
          found.set(key, entry)
          cache[key] = entry
        }
      }
      onProgress?.(Math.min(i + BATCH, toFetch.length), toFetch.length)
    }

    this.writeCache(cache)
    found.forEach(rememberImages)
    return { found, missing: wanted.filter((key) => !found.has(key)).map((key) => original.get(key) ?? key) }
  }

  private readCache(): Record<string, CatalogCard> {
    try {
      const raw = this.storage?.getItem(CACHE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, CatalogCard>) : {}
    } catch {
      return {}
    }
  }

  private writeCache(cache: Record<string, CatalogCard>) {
    try {
      this.storage?.setItem(CACHE_KEY, JSON.stringify(cache))
    } catch {
      // Quota or private mode: the catalog still works, it just refetches next time.
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
