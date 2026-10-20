// Joins a deck (references) with catalog data: facts for validation, info for stats, refs for the game.

import type { CardRef, DeckInput } from '@gathering-hall/engine'
import type { CardFacts } from '@gathering-hall/formats'
import { normalizeName, type CardImages, type CatalogCard, type CatalogPort } from '../catalog/catalog'
import type { CardInfo, Deck, DeckCard } from './model'

export interface DeckCardData {
  byOracle: Map<string, CatalogCard>
  printings: Map<string, CatalogCard> // chosen arts, by Scryfall id
  facts: Map<string, CardFacts>
  info: Map<string, CardInfo>
}

export function emptyCardData(): DeckCardData {
  return { byOracle: new Map(), printings: new Map(), facts: new Map(), info: new Map() }
}

export function indexCards(cards: Iterable<CatalogCard>, into: DeckCardData = emptyCardData()): DeckCardData {
  for (const card of cards) {
    const oracleId = card.facts?.oracleId ?? card.ref.oracleId
    if (!oracleId) continue
    into.byOracle.set(oracleId, card)
    if (card.facts) {
      into.facts.set(oracleId, card.facts)
      into.info.set(oracleId, { typeLine: card.facts.typeLine, manaValue: card.manaValue, colorIdentity: card.facts.colorIdentity })
    }
  }
  return into
}

// Everything shown in the editor, the Talvez list included (images and stats data); the game and validation use
// only the deck (toGameDeck, toValidation).
const allCards = (deck: Deck) => [...deck.commanders, ...deck.cards, ...deck.maybe]

export const imagesOf = (c: DeckCard, data: DeckCardData): CardImages | null =>
  (c.scryfallId && data.printings.get(c.scryfallId)?.images) || data.byOracle.get(c.oracleId)?.images || null

export async function loadDeckCards(deck: Deck, catalog: CatalogPort): Promise<DeckCardData> {
  const { found } = await catalog.resolve(allCards(deck).map((c) => c.name))
  const data = indexCards(found.values())
  const chosen = allCards(deck).flatMap((c) => (c.scryfallId ? [c.scryfallId] : []))
  if (chosen.length) {
    for (const [id, card] of await catalog.resolvePrintings(chosen)) data.printings.set(id, card)
  }
  return data
}

// Engine input: chosen printing → default printing → bare name (still playable as a placeholder).
export function toGameDeck(deck: Deck, data: DeckCardData): DeckInput {
  const ref = (c: DeckCard): CardRef =>
    (c.scryfallId && data.printings.get(c.scryfallId)?.ref) || data.byOracle.get(c.oracleId)?.ref || { name: c.name }
  const expand = (list: DeckCard[]) => list.flatMap((c) => Array.from({ length: c.count }, () => ref(c)))
  return { commanders: expand(deck.commanders), cards: expand(deck.cards) }
}

export function findByName(data: DeckCardData, name: string): CatalogCard | undefined {
  const key = normalizeName(name)
  for (const card of data.byOracle.values()) if (normalizeName(card.ref.name) === key) return card
  return undefined
}
