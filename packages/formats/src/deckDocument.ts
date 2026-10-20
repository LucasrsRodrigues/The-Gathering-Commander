// A saved deck as a document (épico 05; shared with the server in épico 08 for the cloud). References to cards
// (oracleId + name, optional chosen printing), never card data. Whatever is read back — from the browser's storage
// or from the network — is untrusted and goes through sanitizeDeck.
//
// Schema v2 (épico 10): tags per card (the first is the main category), the "Talvez" list (maybeboard), a folder, a
// description and the change history. v1 documents are still accepted and come out as v2 with nothing lost.

export type DeckZone = 'commanders' | 'cards' | 'maybe'
export const DECK_ZONES: readonly DeckZone[] = ['commanders', 'cards', 'maybe']

export interface DeckCard {
  oracleId: string
  name: string
  scryfallId?: string // chosen printing (art); validation never depends on it
  count: number
  tags?: string[] // categories; the first is the main one (groups the card)
}

// One entry of the history: what came in and what went out, per list.
export interface ChangeLine {
  zone: DeckZone
  oracleId: string
  name: string
  count: number
}

export interface DeckChange {
  at: number
  added: ChangeLine[]
  removed: ChangeLine[]
}

export interface Deck {
  schemaVersion: 2
  id: string
  name: string
  presetId?: string
  commanders: DeckCard[]
  cards: DeckCard[]
  maybe: DeckCard[] // "Talvez": never validated, counted or played
  folder?: string
  description?: string
  tagOrder?: string[] // category order when grouping (also keeps categories that have no card yet)
  history: DeckChange[] // oldest first
  createdAt: number
  updatedAt: number
}

// The same limits in the app and on the server.
export const DECK_LIMITS = {
  name: 60,
  entries: 300,
  maybe: 150,
  tagsPerCard: 8,
  tagLength: 24,
  distinctTags: 60,
  folder: 40,
  description: 2_000,
  history: 50,
  linesPerChange: 900, // a whole deck swapped at once (300 + 150 out, 300 + 150 in): a change is never cut short
} as const
export const MAX_DECK_NAME = DECK_LIMITS.name
export const MAX_DECK_ENTRIES = DECK_LIMITS.entries
export const MAX_DECK_DOC_BYTES = 128 * 1024 // serialized size accepted by the cloud
const MAX_COUNT = 99
const MAX_ID = 64
// C0/C1 control characters and bidi overrides never belong in names typed by people.
// oxlint-disable-next-line no-control-regex -- removing control characters is the point
const UNSAFE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g

function text(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

// A label typed by the user (tag, folder): one line, no control characters, trimmed and bounded.
function label(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const clean = v.replace(UNSAFE, '').replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return clean || null
}

function tagList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of v.slice(0, DECK_LIMITS.tagsPerCard * 2)) {
    const tag = label(raw, DECK_LIMITS.tagLength)
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    out.push(tag)
    if (out.length === DECK_LIMITS.tagsPerCard) break
  }
  return out
}

function card(raw: unknown): DeckCard | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (!text(c.oracleId, MAX_ID) || !text(c.name, 200)) return null
  if (typeof c.count !== 'number' || !Number.isInteger(c.count) || c.count < 1 || c.count > MAX_COUNT) return null
  const tags = tagList(c.tags)
  return {
    oracleId: c.oracleId, name: c.name, count: c.count,
    ...(text(c.scryfallId, MAX_ID) ? { scryfallId: c.scryfallId } : {}),
    ...(tags.length ? { tags } : {}),
  }
}

function changeLine(raw: unknown): ChangeLine | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  if (!DECK_ZONES.includes(l.zone as DeckZone) || !text(l.oracleId, MAX_ID) || !text(l.name, 200)) return null
  if (typeof l.count !== 'number' || !Number.isInteger(l.count) || l.count < 1 || l.count > MAX_COUNT) return null
  return { zone: l.zone as DeckZone, oracleId: l.oracleId, name: l.name, count: l.count }
}

function change(raw: unknown): DeckChange | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.at !== 'number' || !Number.isFinite(c.at)) return null
  const lines = (v: unknown) => (Array.isArray(v) ? v.slice(0, DECK_LIMITS.linesPerChange).map(changeLine).filter((l): l is ChangeLine => !!l) : [])
  const added = lines(c.added)
  const removed = lines(c.removed)
  return added.length || removed.length ? { at: c.at, added, removed } : null
}

// Keeps at most DECK_LIMITS.distinctTags categories in the whole deck (first seen win; the rest are dropped).
function capDistinctTags(lists: DeckCard[][], order: string[]): { lists: DeckCard[][]; order: string[] } {
  const allowed = new Map<string, string>() // lower → spelling
  const allow = (tag: string) => {
    const key = tag.toLowerCase()
    if (!allowed.has(key) && allowed.size < DECK_LIMITS.distinctTags) allowed.set(key, tag)
    return allowed.has(key)
  }
  const tagOrder = order.filter(allow)
  const capped = lists.map((list) => list.map((c) => {
    if (!c.tags) return c
    const tags = c.tags.filter(allow)
    const { tags: _old, ...rest } = c
    return tags.length ? { ...rest, tags } : rest
  }))
  return { lists: capped, order: tagOrder }
}

export function sanitizeDeck(raw: unknown): Deck | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const deckName = d.name
  if ((d.schemaVersion !== 1 && d.schemaVersion !== 2) || !text(d.id, MAX_ID) || typeof deckName !== 'string') return null
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).map(card).filter((c): c is DeckCard => !!c) : [])
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const { lists: [commanders, cards, maybe], order } = capDistinctTags(
    [list(d.commanders, 2), list(d.cards, DECK_LIMITS.entries), list(d.maybe, DECK_LIMITS.maybe)],
    labels(d.tagOrder),
  )
  const folder = label(d.folder, DECK_LIMITS.folder)
  const description = typeof d.description === 'string' ? d.description.replace(UNSAFE, '').trim().slice(0, DECK_LIMITS.description) : ''
  const history = Array.isArray(d.history)
    ? d.history.slice(-DECK_LIMITS.history).map(change).filter((c): c is DeckChange => !!c)
    : []
  return {
    schemaVersion: 2,
    id: d.id,
    name: deckName.slice(0, MAX_DECK_NAME) || 'Deck sem nome',
    ...(text(d.presetId, MAX_ID) ? { presetId: d.presetId } : {}),
    commanders: commanders!,
    cards: cards!,
    maybe: maybe!,
    ...(folder ? { folder } : {}),
    ...(description ? { description } : {}),
    ...(order.length ? { tagOrder: order } : {}),
    history,
    createdAt: time(d.createdAt),
    updatedAt: time(d.updatedAt),
  }
}

// The deck order of categories: unique labels, up to the deck's limit.
function labels(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of v.slice(0, DECK_LIMITS.distinctTags * 2)) {
    const tag = label(raw, DECK_LIMITS.tagLength)
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    out.push(tag)
  }
  return out
}

// True when the deck holds something a v1 document cannot carry: an old app writing over it would lose that, so the
// cloud refuses such a write (épico 10, T10.2).
export function hasV2Content(deck: Deck): boolean {
  const tagged = (list: DeckCard[]) => list.some((c) => c.tags?.length)
  return deck.maybe.length > 0 || deck.history.length > 0 || !!deck.folder || !!deck.description || !!deck.tagOrder?.length ||
    tagged(deck.commanders) || tagged(deck.cards)
}

// True for a document written by an app from before épico 10 (the cloud refuses it over a v2, T10.2).
export function isLegacyDeck(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).schemaVersion === 1
}
