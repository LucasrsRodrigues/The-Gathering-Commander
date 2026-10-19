// Scryfall adapter for the catalog port. Respects their API guidelines: one shared throttle (≤ 10 requests/s),
// batched /cards/collection (max 75 identifiers) and a local cache so repeat lookups cost nothing.
// Responses and cache entries are untrusted: everything goes through toCatalogCard().

import type { CardFacts, Color } from '@gathering-hall/formats'
import {
  normalizeName, rememberImages, type CardImages, type CatalogCard, type CatalogPort, type RequestOptions,
  type ResolveResult, type SearchPage,
} from './catalog'
import { API_HOST, isApiUrl, isImageUrl } from './hosts'

const BATCH = 75
const MIN_GAP_MS = 100 // Scryfall asks for 50–100 ms between requests
const CACHE_KEY = 'gh-catalog-v2'
const MAX_CACHE_ENTRIES = 2_500 // keeps the localStorage cache well under typical quotas
const MAX_TEXT = 200
const MAX_ORACLE = 3_000
const MAX_QUERY = 300
const MAX_RESULTS = 60
const TIMEOUT_MS = 20_000
const ID = /^[0-9a-f-]{36}$/i
const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G']
const LEGALITIES = ['legal', 'banned', 'not_legal', 'restricted'] as const
// oxlint-disable-next-line no-control-regex -- rejecting control characters and bidi overrides is the point
const UNSAFE = /[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/

interface ScryfallImages { small?: string; normal?: string; large?: string }
interface ScryfallFace { name?: string; type_line?: string; oracle_text?: string; oracle_id?: string; image_uris?: ScryfallImages }
interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  type_line?: string
  oracle_text?: string
  color_identity?: unknown
  keywords?: unknown
  legalities?: { commander?: unknown }
  game_changer?: unknown
  cmc?: unknown
  image_uris?: ScryfallImages
  card_faces?: ScryfallFace[]
}

type Fetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

function isText(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function safeImages(images: ScryfallImages | undefined): CardImages | null {
  if (!images || !isImageUrl(images.small) || !isImageUrl(images.normal) || !isImageUrl(images.large)) return null
  return { small: images.small, normal: images.normal, large: images.large }
}

// Only the fields we use, so the cache stays small; re-validated by toCatalogCard on every read.
function slim(card: ScryfallCard): ScryfallCard {
  const face = (f: ScryfallFace): ScryfallFace => ({ name: f.name, type_line: f.type_line, oracle_text: f.oracle_text, oracle_id: f.oracle_id, image_uris: f.image_uris })
  return {
    id: card.id, oracle_id: card.oracle_id, name: card.name, type_line: card.type_line, oracle_text: card.oracle_text,
    color_identity: card.color_identity, keywords: card.keywords, legalities: { commander: card.legalities?.commander },
    game_changer: card.game_changer, cmc: card.cmc, image_uris: card.image_uris,
    ...(Array.isArray(card.card_faces) ? { card_faces: card.card_faces.slice(0, 2).map(face) } : {}),
  }
}

// Returns null for anything that does not look like a card.
export function toCatalogCard(card: ScryfallCard): CatalogCard | null {
  if (typeof card !== 'object' || card === null || !ID.test(String(card.id)) || !isText(card.name)) return null
  const faces = Array.isArray(card.card_faces) ? card.card_faces.slice(0, 2) : []
  const front = faces[0]
  const typeLine = isText(card.type_line) ? card.type_line : isText(front?.type_line) ? front.type_line : undefined
  const oracleId = isText(card.oracle_id, 64) ? card.oracle_id : isText(front?.oracle_id, 64) ? front.oracle_id : undefined
  const oracleText = [card.oracle_text, ...faces.map((f) => f.oracle_text)]
    .filter((t): t is string => isText(t, MAX_ORACLE)).join('\n').slice(0, MAX_ORACLE)
  const colorIdentity = Array.isArray(card.color_identity) ? COLORS.filter((c) => (card.color_identity as unknown[]).includes(c)) : []
  const keywords = Array.isArray(card.keywords) ? (card.keywords as unknown[]).filter((k): k is string => isText(k, 60)).slice(0, 30) : []
  const legal = LEGALITIES.find((l) => l === card.legalities?.commander) ?? 'not_legal'
  const manaValue = typeof card.cmc === 'number' && Number.isFinite(card.cmc) ? Math.min(100, Math.max(0, card.cmc)) : 0

  const facts: CardFacts | null = oracleId
    ? { oracleId, name: card.name, typeLine: typeLine ?? '', oracleText, colorIdentity, keywords, legalCommander: legal, gameChanger: card.game_changer === true }
    : null
  return {
    ref: {
      name: card.name,
      scryfallId: card.id,
      imageKey: card.id,
      ...(oracleId ? { oracleId } : {}),
      ...(typeLine ? { typeLine } : {}),
    },
    images: safeImages(card.image_uris ?? front?.image_uris),
    facts,
    manaValue,
  }
}

export class ScryfallCatalog implements CatalogPort {
  private readonly fetchFn: Fetch
  private readonly storage: Storage | null
  private readonly sleep: (ms: number) => Promise<void>
  private nextSlot = 0

  constructor(opts: { fetchFn?: Fetch; storage?: Storage | null; sleep?: (ms: number) => Promise<void> } = {}) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init))
    this.storage = opts.storage === undefined ? safeLocalStorage() : opts.storage
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  // ---- port ---------------------------------------------------------------

  async resolve(names: string[], onProgress?: (done: number, total: number) => void): Promise<ResolveResult> {
    const cache = this.readCache()
    const found = new Map<string, CatalogCard>()
    const wanted = [...new Set(names.map(normalizeName))]
    const toFetch = wanted.filter((key) => {
      const hit = cachedCard(cache, key)
      if (hit) found.set(key, hit)
      return !hit
    })

    // Keep the original spelling for the request; the API matches names case-insensitively.
    const original = new Map(names.map((n) => [normalizeName(n), n.trim()]))
    for (let i = 0; i < toFetch.length; i += BATCH) {
      const batch = toFetch.slice(i, i + BATCH)
      const data = await this.collection(batch.map((key) => ({ name: original.get(key) ?? key })))
      for (const raw of data) {
        const entry = this.store(cache, raw)
        if (!entry) continue
        // Index by full name and, for multi-face cards, by the front face name people usually type.
        const front = Array.isArray(raw.card_faces) ? raw.card_faces[0]?.name : undefined
        found.set(normalizeName(raw.name), entry)
        if (isText(front)) {
          found.set(normalizeName(front), entry)
          cache[normalizeName(front)] = slim(raw)
        }
      }
      onProgress?.(Math.min(i + BATCH, toFetch.length), toFetch.length)
    }

    this.writeCache(cache)
    found.forEach(rememberImages)
    return { found, missing: wanted.filter((key) => !found.has(key)).map((key) => original.get(key) ?? key) }
  }

  async resolvePrintings(scryfallIds: string[]): Promise<Map<string, CatalogCard>> {
    const cache = this.readCache()
    const found = new Map<string, CatalogCard>()
    const ids = [...new Set(scryfallIds.filter((id) => ID.test(id)))]
    const toFetch = ids.filter((id) => {
      const hit = cachedCard(cache, idKey(id))
      if (hit) found.set(id, hit)
      return !hit
    })
    for (let i = 0; i < toFetch.length; i += BATCH) {
      for (const raw of await this.collection(toFetch.slice(i, i + BATCH).map((id) => ({ id })))) {
        const entry = this.store(cache, raw)
        if (entry) found.set(raw.id, entry)
      }
    }
    this.writeCache(cache)
    found.forEach(rememberImages)
    return found
  }

  async search(query: string, opts: RequestOptions = {}): Promise<SearchPage> {
    const q = cleanQuery(query)
    if (!q) return { cards: [], total: 0 }
    const json = await this.get('/cards/search', { q, unique: 'cards', order: 'name' }, opts.signal)
    return this.page(json)
  }

  async autocomplete(prefix: string, opts: RequestOptions = {}): Promise<string[]> {
    const q = cleanQuery(prefix)
    if (!q || q.length < 2) return []
    const json = (await this.get('/cards/autocomplete', { q }, opts.signal)) as { data?: unknown } | null
    return Array.isArray(json?.data) ? json.data.filter((n): n is string => isText(n)).slice(0, 20) : []
  }

  async printings(oracleId: string, opts: RequestOptions = {}): Promise<CatalogCard[]> {
    if (!ID.test(oracleId)) return []
    const json = await this.get('/cards/search', { q: `oracleid:${oracleId}`, unique: 'prints', order: 'released', dir: 'desc' }, opts.signal)
    return (await this.page(json)).cards
  }

  // ---- transport ----------------------------------------------------------

  // One throttle for every request (search typing, deck loading and game setup share it).
  private async throttle() {
    const now = Date.now()
    const slot = Math.max(now, this.nextSlot)
    this.nextSlot = slot + MIN_GAP_MS
    if (slot > now) await this.sleep(slot - now)
  }

  private init(signal?: AbortSignal): RequestInit {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    return {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    }
  }

  private async collection(identifiers: ({ name: string } | { id: string })[]): Promise<ScryfallCard[]> {
    const url = `https://${API_HOST}/cards/collection`
    if (!isApiUrl(url)) throw new Error('destino fora da lista permitida')
    await this.throttle()
    const base = this.init()
    const res = await this.fetchFn(url, {
      ...base, method: 'POST', headers: { ...(base.headers as Record<string, string>), 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers }),
    })
    if (!res.ok) throw new Error(`Scryfall respondeu ${res.status}`)
    const json = (await res.json()) as { data?: unknown }
    return Array.isArray(json?.data) ? (json.data as ScryfallCard[]).slice(0, BATCH) : []
  }

  private async get(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    const url = new URL(path, `https://${API_HOST}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    if (!isApiUrl(url.href)) throw new Error('destino fora da lista permitida')
    await this.throttle()
    signal?.throwIfAborted()
    const res = await this.fetchFn(url.href, { ...this.init(signal), method: 'GET' })
    if (res.status === 404) return null // Scryfall answers 404 when a search has no results
    if (!res.ok) throw new Error(`Scryfall respondeu ${res.status}`)
    return res.json()
  }

  private async page(json: unknown): Promise<SearchPage> {
    const body = json as { data?: unknown; total_cards?: unknown } | null
    const data = Array.isArray(body?.data) ? (body.data as ScryfallCard[]).slice(0, MAX_RESULTS) : []
    const cache = this.readCache()
    const cards = data.map((raw) => this.store(cache, raw)).filter((c): c is CatalogCard => !!c)
    this.writeCache(cache)
    cards.forEach(rememberImages)
    const total = typeof body?.total_cards === 'number' ? body.total_cards : cards.length
    return { cards, total }
  }

  // ---- cache --------------------------------------------------------------

  private store(cache: Record<string, ScryfallCard>, raw: ScryfallCard): CatalogCard | null {
    const entry = toCatalogCard(raw)
    if (!entry) return null
    const small = slim(raw)
    cache[normalizeName(raw.name)] = small
    cache[idKey(raw.id)] = small
    return entry
  }

  private readCache(): Record<string, ScryfallCard> {
    const cache: Record<string, ScryfallCard> = Object.create(null)
    try {
      const raw = this.storage?.getItem(CACHE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      if (typeof parsed !== 'object' || parsed === null) return cache
      for (const [key, value] of Object.entries(parsed).slice(-MAX_CACHE_ENTRIES)) {
        if (value && typeof value === 'object') cache[key] = value as ScryfallCard
      }
    } catch {
      // Corrupt cache: start over.
    }
    return cache
  }

  private writeCache(cache: Record<string, ScryfallCard>) {
    try {
      this.storage?.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(Object.entries(cache).slice(-MAX_CACHE_ENTRIES))))
    } catch {
      // Quota or private mode: the catalog still works, it just refetches next time.
    }
  }
}

const idKey = (id: string) => `#id:${id}`

// Cache entries come from localStorage, which anything on this origin can write: validate on read.
function cachedCard(cache: Record<string, ScryfallCard>, key: string): CatalogCard | null {
  const raw = Object.hasOwn(cache, key) ? cache[key] : undefined
  if (!raw) return null
  const card = toCatalogCard(raw)
  // Image URLs that fail the allowlist mean the entry was tampered with: refetch instead of trusting it.
  const claimedImages = raw.image_uris ?? (Array.isArray(raw.card_faces) ? raw.card_faces[0]?.image_uris : undefined)
  return card && (!claimedImages || card.images) ? card : null
}

function cleanQuery(query: string): string {
  if (typeof query !== 'string') return ''
  const q = query.trim().slice(0, MAX_QUERY)
  return UNSAFE.test(q) ? '' : q
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
