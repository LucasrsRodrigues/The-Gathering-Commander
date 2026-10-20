// Catalog port (ACL): the rest of the app only knows CardRef, images and CardFacts, never the Scryfall format.

import type { CardRef } from '@gathering-hall/engine'
import type { CardFacts } from '@gathering-hall/formats'

export interface CardImages {
  small: string
  normal: string
  large: string
}

export interface CatalogCard {
  ref: CardRef
  images: CardImages | null
  facts: CardFacts | null // null when the source has no oracle id
  manaValue: number
  print?: { set: string; number: string } // this printing's set code and collector number (deck text, épico 10)
}

export interface ResolveResult {
  found: Map<string, CatalogCard> // keyed by normalized name
  missing: string[]
}

export interface SearchPage {
  cards: CatalogCard[]
  total: number
}

export interface RequestOptions {
  signal?: AbortSignal
}

export interface CatalogPort {
  resolve(names: string[], onProgress?: (done: number, total: number) => void): Promise<ResolveResult>
  // Specific printings (chosen art), keyed by Scryfall id.
  resolvePrintings(scryfallIds: string[]): Promise<Map<string, CatalogCard>>
  search(query: string, opts?: RequestOptions): Promise<SearchPage>
  autocomplete(prefix: string, opts?: RequestOptions): Promise<string[]>
  printings(oracleId: string, opts?: RequestOptions): Promise<CatalogCard[]>
  // Printings by set code and collector number, keyed `${set}/${number}` (lower case). Optional: without it the deck
  // text keeps the default printing.
  resolveSetNumbers?(prints: { set: string; number: string }[]): Promise<Map<string, CatalogCard>>
}

export const printKey = (set: string, number: string) => `${set.toLowerCase()}/${number.toLowerCase()}`

export function normalizeName(name: string): string {
  return name.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase()
}

// Image lookup for objects in play: filled by the catalog as cards are resolved.
const imagesById = new Map<string, CardImages>()

export function rememberImages(card: CatalogCard) {
  if (card.ref.imageKey && card.images) imagesById.set(card.ref.imageKey, card.images)
}

export function imagesFor(ref: CardRef | null): CardImages | null {
  return ref?.imageKey ? (imagesById.get(ref.imageKey) ?? null) : null
}
