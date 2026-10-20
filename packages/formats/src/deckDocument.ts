// A saved deck as a document (épico 05; shared with the server in épico 08 for the cloud). References to cards
// (oracleId + name, optional chosen printing), never card data. Whatever is read back — from the browser's storage
// or from the network — is untrusted and goes through sanitizeDeck.

export interface DeckCard {
  oracleId: string
  name: string
  scryfallId?: string // chosen printing (art); validation never depends on it
  count: number
}

export interface Deck {
  schemaVersion: 1
  id: string
  name: string
  presetId?: string
  commanders: DeckCard[]
  cards: DeckCard[]
  createdAt: number
  updatedAt: number
}

export const MAX_DECK_NAME = 60
export const MAX_DECK_ENTRIES = 300
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

export function sanitizeDeck(raw: unknown): Deck | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const deckName = d.name
  if (d.schemaVersion !== 1 || !text(d.id, MAX_ID) || typeof deckName !== 'string') return null
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_DECK_ENTRIES).map(card).filter((c): c is DeckCard => !!c) : [])
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    schemaVersion: 1,
    id: d.id,
    name: deckName.slice(0, MAX_DECK_NAME) || 'Deck sem nome',
    ...(text(d.presetId, MAX_ID) ? { presetId: d.presetId } : {}),
    commanders: list(d.commanders).slice(0, 2),
    cards: list(d.cards),
    createdAt: time(d.createdAt),
    updatedAt: time(d.updatedAt),
  }
}
