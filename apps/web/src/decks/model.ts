// Deck model: references to cards (oracleId + name, optional chosen printing), never card data.
// All functions are pure and return new decks.

import type { Color, DeckForValidation } from '@gathering-hall/formats'

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

export type DeckZone = 'commanders' | 'cards'

export const MAX_DECK_NAME = 60

export function newDeck(id: string, name: string, now: number): Deck {
  return { schemaVersion: 1, id, name: name.trim().slice(0, MAX_DECK_NAME) || 'Deck sem nome', commanders: [], cards: [], createdAt: now, updatedAt: now }
}

function touch(deck: Deck, patch: Partial<Deck>, now: number): Deck {
  return { ...deck, ...patch, updatedAt: now }
}

export function addCard(deck: Deck, card: Omit<DeckCard, 'count'>, zone: DeckZone, now: number, count = 1): Deck {
  const list = deck[zone]
  const existing = list.find((c) => c.oracleId === card.oracleId)
  const next = existing
    ? list.map((c) => (c === existing ? { ...c, count: c.count + count } : c))
    : [...list, { ...card, count }]
  return touch(deck, { [zone]: next }, now)
}

export function removeCard(deck: Deck, oracleId: string, zone: DeckZone, now: number, count = 1): Deck {
  const next = deck[zone].flatMap((c) => (c.oracleId !== oracleId ? [c] : c.count > count ? [{ ...c, count: c.count - count }] : []))
  return touch(deck, { [zone]: next }, now)
}

// Moving a card between the deck and the command zone keeps its chosen printing.
export function moveCard(deck: Deck, oracleId: string, from: DeckZone, now: number): Deck {
  const card = deck[from].find((c) => c.oracleId === oracleId)
  if (!card) return deck
  const to: DeckZone = from === 'cards' ? 'commanders' : 'cards'
  const removed = removeCard(deck, oracleId, from, now)
  return addCard(removed, { oracleId: card.oracleId, name: card.name, ...(card.scryfallId ? { scryfallId: card.scryfallId } : {}) }, to, now)
}

export function setPrinting(deck: Deck, oracleId: string, scryfallId: string, now: number): Deck {
  const swap = (list: DeckCard[]) => list.map((c) => (c.oracleId === oracleId ? { ...c, scryfallId } : c))
  return touch(deck, { commanders: swap(deck.commanders), cards: swap(deck.cards) }, now)
}

export function renameDeck(deck: Deck, name: string, now: number): Deck {
  return touch(deck, { name: name.slice(0, MAX_DECK_NAME) }, now)
}

export function deckSize(deck: Deck): number {
  return [...deck.commanders, ...deck.cards].reduce((n, c) => n + c.count, 0)
}

export function toValidation(deck: Deck): DeckForValidation {
  const ref = (c: DeckCard) => ({ oracleId: c.oracleId, count: c.count })
  return { commanders: deck.commanders.map(ref), cards: deck.cards.map(ref) }
}

// ---- Stats ----------------------------------------------------------------

export interface CardInfo {
  typeLine: string
  manaValue: number
  colorIdentity: Color[]
}

export const TYPE_GROUPS = [
  ['creature', 'Criaturas'], ['planeswalker', 'Planeswalkers'], ['battle', 'Batalhas'], ['land', 'Terrenos'],
  ['instant', 'Instantâneas'], ['sorcery', 'Feitiços'], ['artifact', 'Artefatos'], ['enchantment', 'Encantamentos'],
] as const
export type TypeGroup = (typeof TYPE_GROUPS)[number][0] | 'other'

export function typeGroup(typeLine: string | undefined): TypeGroup {
  const front = (typeLine ?? '').split('//')[0]!.toLowerCase()
  return TYPE_GROUPS.find(([key]) => front.includes(key))?.[0] ?? 'other'
}

export interface DeckStats {
  total: number
  lands: number
  curve: number[] // nonland cards by mana value 0..6, index 7 = 7+
  averageManaValue: number
  colors: Record<Color | 'C', number> // nonland cards by color identity (multicolor counts in each)
  types: Partial<Record<TypeGroup, number>>
}

export function deckStats(deck: Deck, info: ReadonlyMap<string, CardInfo>): DeckStats {
  const stats: DeckStats = { total: 0, lands: 0, curve: Array(8).fill(0), averageManaValue: 0, colors: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, types: {} }
  let mvSum = 0
  let nonLands = 0
  for (const c of [...deck.commanders, ...deck.cards]) {
    stats.total += c.count
    const card = info.get(c.oracleId)
    if (!card) continue
    const group = typeGroup(card.typeLine)
    stats.types[group] = (stats.types[group] ?? 0) + c.count
    if (group === 'land') {
      stats.lands += c.count
      continue
    }
    nonLands += c.count
    mvSum += card.manaValue * c.count
    stats.curve[Math.min(7, Math.max(0, Math.floor(card.manaValue)))]! += c.count
    if (card.colorIdentity.length === 0) stats.colors.C += c.count
    for (const color of card.colorIdentity) stats.colors[color] += c.count
  }
  stats.averageManaValue = nonLands ? Math.round((mvSum / nonLands) * 100) / 100 : 0
  return stats
}
