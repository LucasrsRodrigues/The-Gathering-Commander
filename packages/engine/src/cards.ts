// What the engine knows about a card: its structured rules when the catalog provided them, otherwise only what the
// type line says. Never the card's name.

import type { CardRef, CardType, Keyword } from './types'

const CARD_TYPES: readonly CardType[] = ['land', 'creature', 'artifact', 'enchantment', 'planeswalker', 'instant', 'sorcery', 'battle']

export function typesOf(card: CardRef): CardType[] {
  if (card.rules) return card.rules.types
  const front = (card.typeLine ?? '').split('//')[0]!.split(/\s+[—-]\s+/)[0]!.toLowerCase().split(/\s+/)
  return CARD_TYPES.filter((t) => front.includes(t))
}

export function hasKeyword(card: CardRef, keyword: Keyword): boolean {
  return card.rules?.keywords.includes(keyword) ?? false
}

export const isLand = (card: CardRef) => typesOf(card).includes('land')

// CR 307.1 / 702.8: instants and cards with Flash may be cast whenever their controller has priority.
export const hasInstantSpeed = (card: CardRef) => typesOf(card).includes('instant') || hasKeyword(card, 'flash')
