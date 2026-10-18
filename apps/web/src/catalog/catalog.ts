// Catalog port (ACL): the rest of the app only knows CardRef + images, never the Scryfall format.

import type { CardRef } from '@gathering-hall/engine'

export interface CardImages {
  small: string
  normal: string
  large: string
}

export interface CatalogCard {
  ref: CardRef
  images: CardImages | null
}

export interface ResolveResult {
  found: Map<string, CatalogCard> // keyed by normalized name
  missing: string[]
}

export interface CatalogPort {
  resolve(names: string[], onProgress?: (done: number, total: number) => void): Promise<ResolveResult>
}

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
