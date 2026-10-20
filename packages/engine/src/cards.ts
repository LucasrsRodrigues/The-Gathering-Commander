// What the engine knows about a card: its structured rules when the catalog provided them, otherwise only what the
// type line says. Never the card's name.

import type { CardRef, CardType } from './types'

const CARD_TYPES: readonly CardType[] = ['land', 'creature', 'artifact', 'enchantment', 'planeswalker', 'instant', 'sorcery', 'battle']

export function typesOf(card: CardRef): CardType[] {
  if (card.rules) return card.rules.types
  const front = (card.typeLine ?? '').split('//')[0]!.split(/\s+[—-]\s+/)[0]!.toLowerCase().split(/\s+/)
  return CARD_TYPES.filter((t) => front.includes(t))
}

// Since épico 12 the rules ask layers.ts (charsOf), which starts from this; nothing else reads the printed card.
