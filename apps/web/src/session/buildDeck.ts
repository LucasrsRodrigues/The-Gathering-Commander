import type { CardRef, DeckInput } from '@gathering-hall/engine'
import { normalizeName, type CatalogCard } from '../catalog/catalog'
import type { ParsedDeck } from '../decks/parseDecklist'

// Expands a parsed list into engine CardRefs. Unknown names still become playable placeholder cards.
export function buildDeck(parsed: ParsedDeck, found: Map<string, CatalogCard>): DeckInput & { note?: string } {
  const ref = (name: string): CardRef => found.get(normalizeName(name))?.ref ?? { name }
  const expand = (entries: ParsedDeck['cards']) => entries.flatMap((e) => Array.from({ length: e.count }, () => ref(e.name)))

  let commanders = expand(parsed.commanders)
  let cards = expand(parsed.cards)
  let note: string | undefined
  if (!commanders.length) {
    // No commander marked: use the first legendary creature in the list.
    const index = cards.findIndex((c) => /legendary/i.test(c.typeLine ?? '') && /creature/i.test(c.typeLine ?? ''))
    if (index >= 0) {
      commanders = [cards[index]!]
      cards = cards.filter((_, i) => i !== index)
      note = `Sem comandante marcado: usando ${commanders[0]!.name}.`
    }
  }
  return { commanders, cards, ...(note ? { note } : {}) }
}
