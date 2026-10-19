// Scryfall bulk card → our catalog record (ACL). Only rules fields are versioned (hashed): art, prices and
// new printings are presentation and never create a new "version" of a card.

import { createHash } from 'node:crypto'

// Layouts that are not playable cards (CR 108) and must never resolve as a deck card.
const NON_CARD_LAYOUTS = new Set(['art_series', 'token', 'double_faced_token', 'emblem', 'vanguard', 'scheme', 'planar'])
const LEGALITIES = ['legal', 'banned', 'not_legal', 'restricted'] as const
const COLORS = ['W', 'U', 'B', 'R', 'G']
const MAX_TEXT = 3_000

export type Legality = (typeof LEGALITIES)[number]

interface BulkFace {
  name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  power?: string
  toughness?: string
  loyalty?: string
  defense?: string
  oracle_id?: string
  image_uris?: { small?: string; normal?: string; large?: string }
}

export interface BulkCard extends BulkFace {
  id: string
  oracle_id?: string
  layout?: string
  cmc?: number
  color_identity?: string[]
  keywords?: string[]
  legalities?: { commander?: string }
  game_changer?: boolean
  card_faces?: BulkFace[]
}

// Bump when ClientCard gains fields: the next start re-imports so every stored card has them.
export const CARD_FORMAT = 2

// The shape served to the web app: the same fields its Scryfall adapter already validates.
export interface ClientCard {
  id: string
  oracle_id: string
  name: string
  type_line?: string
  oracle_text?: string
  mana_cost?: string // épico 09: the engine's card rules (cost, P/T, loyalty)
  power?: string
  toughness?: string
  loyalty?: string
  color_identity: string[]
  keywords: string[]
  legalities: { commander: Legality }
  game_changer: boolean
  cmc: number
  image_uris?: BulkFace['image_uris']
  card_faces?: BulkFace[]
}

export interface CatalogRecord {
  oracleId: string
  name: string
  frontName: string | null // name people type for multi-face cards
  hash: string // of the rules fields only
  legal: Legality
  gameChanger: boolean
  card: ClientCard
}

const text = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined)

export function normalizeCard(raw: BulkCard): CatalogRecord | null {
  if (!raw || typeof raw !== 'object' || NON_CARD_LAYOUTS.has(String(raw.layout))) return null
  const faces = Array.isArray(raw.card_faces) ? raw.card_faces.slice(0, 2) : []
  const oracleId = text(raw.oracle_id, 64) ?? text(faces[0]?.oracle_id, 64)
  const name = text(raw.name)
  if (!oracleId || !name || !text(raw.id, 64)) return null

  const face = (f: BulkFace): BulkFace => ({
    name: text(f.name), mana_cost: text(f.mana_cost, 100), type_line: text(f.type_line), oracle_text: text(f.oracle_text, MAX_TEXT),
    power: text(f.power, 10), toughness: text(f.toughness, 10), loyalty: text(f.loyalty, 10), defense: text(f.defense, 10),
    image_uris: f.image_uris,
  })
  const colorIdentity = Array.isArray(raw.color_identity) ? COLORS.filter((c) => raw.color_identity!.includes(c)) : []
  const keywords = Array.isArray(raw.keywords) ? raw.keywords.filter((k) => text(k, 60)).slice(0, 30) : []
  const legal = LEGALITIES.find((l) => l === raw.legalities?.commander) ?? 'not_legal'

  // Rules fields, in a fixed order, for the version hash (CR: name, cost, type, text, P/T, loyalty, defense…).
  const rules = {
    name, cost: raw.mana_cost ?? null, type: raw.type_line ?? null, text: raw.oracle_text ?? null,
    pt: [raw.power ?? null, raw.toughness ?? null], loyalty: raw.loyalty ?? null, defense: raw.defense ?? null,
    faces: faces.map((f) => [f.name ?? null, f.mana_cost ?? null, f.type_line ?? null, f.oracle_text ?? null, f.power ?? null, f.toughness ?? null, f.loyalty ?? null]),
    identity: colorIdentity, keywords: [...keywords].sort(),
  }
  const hash = createHash('sha256').update(JSON.stringify(rules)).digest('hex').slice(0, 32)

  const card: ClientCard = {
    id: raw.id, oracle_id: oracleId, name,
    ...(text(raw.type_line) ? { type_line: raw.type_line } : {}),
    ...(text(raw.oracle_text, MAX_TEXT) ? { oracle_text: raw.oracle_text } : {}),
    ...(text(raw.mana_cost, 100) ? { mana_cost: raw.mana_cost } : {}),
    ...(text(raw.power, 10) ? { power: raw.power } : {}),
    ...(text(raw.toughness, 10) ? { toughness: raw.toughness } : {}),
    ...(text(raw.loyalty, 10) ? { loyalty: raw.loyalty } : {}),
    color_identity: colorIdentity, keywords, legalities: { commander: legal }, game_changer: raw.game_changer === true,
    cmc: typeof raw.cmc === 'number' && Number.isFinite(raw.cmc) ? raw.cmc : 0,
    ...(raw.image_uris ? { image_uris: raw.image_uris } : {}),
    ...(faces.length ? { card_faces: faces.map(face) } : {}),
  }
  return { oracleId, name, frontName: text(faces[0]?.name) ?? null, hash, legal, gameChanger: raw.game_changer === true, card }
}

export function normalizeName(name: string): string {
  return name.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase()
}
