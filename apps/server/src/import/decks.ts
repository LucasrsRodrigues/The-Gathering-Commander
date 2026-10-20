// Deck import by link (épico 10, req. 22–24): Archidekt (public API) and Moxfield (no official API: we try, and a
// block is reported as such so the app can offer pasting the text). The link only gives an id: the server never
// fetches what the user sent, it builds the API address itself (no SSRF), with a timeout and a size limit, and
// keeps nothing.

export type ImportSource = 'archidekt' | 'moxfield'

export interface ImportedEntry {
  count: number
  name: string
  set?: string
  number?: string
  tags: string[]
}

export interface ImportedDeck {
  source: ImportSource
  name: string
  commanders: ImportedEntry[]
  cards: ImportedEntry[]
  maybe: ImportedEntry[]
}

export type ImportError = 'link' | 'naoEncontrado' | 'privado' | 'bloqueado' | 'foraDoAr' | 'formato'
export type ImportResult = { ok: true; deck: ImportedDeck } | { ok: false; error: ImportError }

type Fetch = (url: string, init: RequestInit) => Promise<Response>

export const IMPORT_LIMITS = { timeoutMs: 10_000, bytes: 2 * 1024 * 1024, entries: 600, tags: 8, tagLength: 24 } as const
const USER_AGENT = 'TheGatheringHall/1.0 (+https://github.com/LucasrsRodrigues/The-Gathering-Commander)'

// Only these link shapes; anything else (other hosts, IPs, ports, userinfo) is refused before any request.
export function parseDeckLink(raw: unknown): { source: ImportSource; id: string } | null {
  if (typeof raw !== 'string' || raw.length > 300) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const archidekt = /^\/(?:api\/)?decks\/(\d{1,10})(?:\/.*)?$/.exec(url.pathname)
  if ((host === 'archidekt.com' || host === 'www.archidekt.com') && archidekt) return { source: 'archidekt', id: archidekt[1]! }
  const moxfield = /^\/decks\/([A-Za-z0-9_-]{6,40})\/?$/.exec(url.pathname)
  if ((host === 'moxfield.com' || host === 'www.moxfield.com') && moxfield) return { source: 'moxfield', id: moxfield[1]! }
  return null
}

export function apiUrl(source: ImportSource, id: string): string {
  return source === 'archidekt' ? `https://archidekt.com/api/decks/${id}/` : `https://api2.moxfield.com/v3/decks/all/${id}`
}

// ---- normalizing ------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined)
const qty = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 ? Math.min(99, v) : null)

function tagsOf(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const t of list) {
    const tag = str(t, 100)?.replace(/\s+/g, ' ').slice(0, IMPORT_LIMITS.tagLength).trim()
    if (tag && !out.some((o) => o.toLowerCase() === tag.toLowerCase())) out.push(tag)
  }
  return out.slice(0, IMPORT_LIMITS.tags)
}

function entry(count: number | null, name: string | undefined, set: unknown, number: unknown, tags: string[]): ImportedEntry | null {
  if (!count || !name || name.length > 150) return null
  const s = str(set, 10)?.toLowerCase()
  const n = str(number, 10)
  return { count, name, tags, ...(s && /^[a-z0-9]{2,6}$/.test(s) ? { set: s } : {}), ...(s && n && /^[\w★-]{1,10}$/.test(n) ? { number: n } : {}) }
}

export function fromArchidekt(json: unknown): ImportedDeck | null {
  const d = json as { name?: unknown; cards?: unknown; categories?: unknown } | null
  if (!d || !Array.isArray(d.cards)) return null
  // Categories not "included in deck" (Maybeboard, Sideboard…) go to the Talvez list; "premier" ones (Commander) lead.
  const meta = new Map<string, { inDeck: boolean; premier: boolean }>()
  if (Array.isArray(d.categories)) {
    for (const c of d.categories as { name?: unknown; includedInDeck?: unknown; isPremier?: unknown }[]) {
      const name = str(c?.name, 100)
      if (name) meta.set(name.toLowerCase(), { inDeck: c.includedInDeck !== false, premier: c.isPremier === true })
    }
  }
  const out: ImportedDeck = { source: 'archidekt', name: str(d.name, 200)?.slice(0, 60) ?? 'Deck do Archidekt', commanders: [], cards: [], maybe: [] }
  for (const raw of (d.cards as unknown[]).slice(0, IMPORT_LIMITS.entries)) {
    const c = raw as { quantity?: unknown; categories?: unknown; deletedAt?: unknown; card?: { collectorNumber?: unknown; edition?: { editioncode?: unknown }; oracleCard?: { name?: unknown } } }
    if (!c || c.deletedAt) continue
    const categories = tagsOf(c.categories)
    const isCommander = categories.some((t) => t.toLowerCase() === 'commander' || meta.get(t.toLowerCase())?.premier)
    const outside = categories.length > 0 && categories.every((t) => meta.get(t.toLowerCase())?.inDeck === false)
    const tags = categories.filter((t) => t.toLowerCase() !== 'commander' && !meta.get(t.toLowerCase())?.premier && meta.get(t.toLowerCase())?.inDeck !== false)
    const e = entry(qty(c.quantity), str(c.card?.oracleCard?.name, 200), c.card?.edition?.editioncode, c.card?.collectorNumber, tags)
    if (!e) continue
    ;(isCommander && !outside ? out.commanders : outside ? out.maybe : out.cards).push(e)
  }
  return out
}

// Moxfield v3 ("boards": { mainboard: { cards: { id: { quantity, card } } } }) and v2 (mainboard: { name: { … } }).
export function fromMoxfield(json: unknown): ImportedDeck | null {
  const d = json as { name?: unknown; boards?: Record<string, { cards?: unknown }>; authorTags?: unknown } & Record<string, unknown> | null
  if (!d || typeof d !== 'object') return null
  const board = (key: string): unknown[] => {
    const v3 = d.boards?.[key]?.cards
    const v2 = d[key]
    const src = (v3 && typeof v3 === 'object' ? v3 : v2 && typeof v2 === 'object' ? v2 : {}) as Record<string, unknown>
    return Object.values(src).slice(0, IMPORT_LIMITS.entries)
  }
  const authorTags = (d.authorTags && typeof d.authorTags === 'object' ? d.authorTags : {}) as Record<string, unknown>
  const read = (list: unknown[]) => list.flatMap((raw) => {
    const c = raw as { quantity?: unknown; card?: { name?: unknown; set?: unknown; cn?: unknown } }
    const name = str(c?.card?.name, 200)
    const e = entry(qty(c?.quantity), name, c?.card?.set, c?.card?.cn, name ? tagsOf(authorTags[name]) : [])
    return e ? [e] : []
  })
  const commanders = read(board('commanders'))
  const cards = read(board('mainboard'))
  if (!commanders.length && !cards.length) return null
  return {
    source: 'moxfield', name: str(d.name, 200)?.slice(0, 60) ?? 'Deck do Moxfield',
    commanders, cards, maybe: [...read(board('maybeboard')), ...read(board('sideboard'))],
  }
}

// ---- fetching -----------------------------------------------------------------

async function readLimited(res: Response, max: number): Promise<string | null> {
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function importDeck(link: unknown, fetchFn: Fetch): Promise<ImportResult> {
  const parsed = parseDeckLink(link)
  if (!parsed) return { ok: false, error: 'link' }
  let res: Response
  try {
    res = await fetchFn(apiUrl(parsed.source, parsed.id), {
      method: 'GET', redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(IMPORT_LIMITS.timeoutMs),
    })
  } catch {
    return { ok: false, error: 'foraDoAr' }
  }
  if (res.status === 404) return { ok: false, error: 'naoEncontrado' }
  if (res.status === 401) return { ok: false, error: 'privado' }
  if (res.status === 403) return { ok: false, error: parsed.source === 'moxfield' ? 'bloqueado' : 'privado' }
  if (res.status === 429 || res.status >= 500) return { ok: false, error: parsed.source === 'moxfield' && res.status === 429 ? 'bloqueado' : 'foraDoAr' }
  if (!res.ok) return { ok: false, error: 'foraDoAr' }
  if (!/json/i.test(res.headers.get('content-type') ?? '')) return { ok: false, error: parsed.source === 'moxfield' ? 'bloqueado' : 'formato' } // a bot challenge page
  const text = await readLimited(res, IMPORT_LIMITS.bytes).catch(() => null)
  if (text === null) return { ok: false, error: 'formato' }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'formato' }
  }
  if (parsed.source === 'archidekt' && (json as { private?: unknown })?.private === true && !Array.isArray((json as { cards?: unknown }).cards)) {
    return { ok: false, error: 'privado' }
  }
  const deck = parsed.source === 'archidekt' ? fromArchidekt(json) : fromMoxfield(json)
  return deck ? { ok: true, deck } : { ok: false, error: 'formato' }
}
