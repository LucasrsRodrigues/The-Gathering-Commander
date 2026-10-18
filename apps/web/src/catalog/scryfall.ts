// Scryfall adapter for the catalog port. Respects their API guidelines: batched /cards/collection
// (max 75 identifiers), a pause between requests and a local cache so repeat games cost nothing.

import { normalizeName, rememberImages, type CardImages, type CatalogCard, type CatalogPort, type ResolveResult } from './catalog'
import { isApiUrl, isImageUrl } from './hosts'

const API = 'https://api.scryfall.com/cards/collection'
const BATCH = 75
const PAUSE_MS = 100
const CACHE_KEY = 'gh-catalog-v1'
const MAX_CACHE_ENTRIES = 5_000
const MAX_TEXT = 200
const TIMEOUT_MS = 20_000
const ID = /^[0-9a-f-]{36}$/i

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

// Response data is untrusted: keep only bounded strings and image URLs on the Scryfall CDN.
// Returns null for anything that does not look like a card.
export function toCatalogCard(card: ScryfallCard): CatalogCard | null {
  if (typeof card !== 'object' || card === null || !ID.test(String(card.id)) || !isText(card.name)) return null
  const face = Array.isArray(card.card_faces) ? card.card_faces[0] : undefined
  const typeLine = card.type_line ?? face?.type_line
  return {
    ref: {
      name: card.name,
      scryfallId: card.id,
      imageKey: card.id,
      ...(isText(card.oracle_id) ? { oracleId: card.oracle_id } : {}),
      ...(isText(typeLine) ? { typeLine } : {}),
    },
    images: safeImages(card.image_uris ?? face?.image_uris),
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT
}

function safeImages(images: Partial<CardImages> | undefined): CardImages | null {
  if (!images || !isImageUrl(images.small) || !isImageUrl(images.normal) || !isImageUrl(images.large)) return null
  return { small: images.small, normal: images.normal, large: images.large }
}

// The cache lives in localStorage, which anything on this origin can write: re-check every entry.
function fromCache(entry: unknown): CatalogCard | null {
  if (typeof entry !== 'object' || entry === null) return null
  const { ref, images } = entry as Partial<CatalogCard>
  if (!ref || !ref.scryfallId) return null
  const card = toCatalogCard({
    id: ref.scryfallId, name: ref.name, oracle_id: ref.oracleId, type_line: ref.typeLine,
    image_uris: images ?? undefined,
  } as ScryfallCard)
  return card && (images === null || card.images) ? card : null
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
      const hit = Object.hasOwn(cache, key) ? cache[key] : undefined
      if (hit) found.set(key, hit)
      else toFetch.push(key)
    }

    // Keep the original spelling for the request; the API matches names case-insensitively.
    const original = new Map(names.map((n) => [normalizeName(n), n.trim()]))
    for (let i = 0; i < toFetch.length; i += BATCH) {
      if (i > 0) await this.sleep(PAUSE_MS)
      const batch = toFetch.slice(i, i + BATCH)
      if (!isApiUrl(API)) throw new Error('destino fora da lista permitida')
      const res = await this.fetchFn(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({ identifiers: batch.map((key) => ({ name: original.get(key) ?? key })) }),
      })
      if (!res.ok) throw new Error(`Scryfall respondeu ${res.status}`)
      const json = (await res.json()) as { data?: unknown }
      const data = Array.isArray(json?.data) ? (json.data as ScryfallCard[]) : []
      for (const card of data.slice(0, BATCH)) {
        const entry = toCatalogCard(card)
        if (!entry) continue
        // Index by full name and, for multi-face cards, by the front face name people usually type.
        const front = Array.isArray(card.card_faces) ? card.card_faces[0]?.name : undefined
        const keys = [normalizeName(card.name), ...(isText(front) ? [normalizeName(front)] : [])]
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
    const cache: Record<string, CatalogCard> = Object.create(null)
    try {
      const raw = this.storage?.getItem(CACHE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      if (typeof parsed !== 'object' || parsed === null) return cache
      for (const [key, value] of Object.entries(parsed).slice(0, MAX_CACHE_ENTRIES)) {
        const card = fromCache(value)
        if (card) cache[key] = card
      }
    } catch {
      // Corrupt cache: start over.
    }
    return cache
  }

  private writeCache(cache: Record<string, CatalogCard>) {
    try {
      const entries = Object.entries(cache)
      this.storage?.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_CACHE_ENTRIES))))
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
