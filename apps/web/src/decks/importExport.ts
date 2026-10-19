// Text decklists in and out. Export is a plain list only (no printable images: no proxies, per the
// Fan Content Policy).

import { isEligibleAlone } from '@gathering-hall/formats'
import { normalizeName, type CatalogCard, type CatalogPort } from '../catalog/catalog'
import { indexCards, type DeckCardData } from './cardData'
import { addCard, newDeck, type Deck, type DeckZone } from './model'
import { parseDecklist } from './parseDecklist'

export interface ImportResult {
  deck: Deck
  data: DeckCardData
  missing: string[]
  errors: string[]
  // Filled when the list marks no commander: eligible cards the player can choose from.
  commanderCandidates: CatalogCard[]
}

export async function importDecklist(text: string, catalog: CatalogPort, id: string, now: number, name?: string): Promise<ImportResult> {
  const parsed = parseDecklist(text)
  const entries = [...parsed.commanders.map((e) => ({ ...e, zone: 'commanders' as DeckZone })), ...parsed.cards.map((e) => ({ ...e, zone: 'cards' as DeckZone }))]
  const { found, missing } = entries.length ? await catalog.resolve(entries.map((e) => e.name)) : { found: new Map<string, CatalogCard>(), missing: [] }

  let deck = newDeck(id, name ?? '', now)
  for (const entry of entries) {
    const card = found.get(normalizeName(entry.name))
    const oracleId = card?.facts?.oracleId ?? card?.ref.oracleId
    if (!card || !oracleId) continue
    deck = addCard(deck, { oracleId, name: card.ref.name }, entry.zone, now, entry.count)
  }
  if (!name) deck = { ...deck, name: deck.commanders[0]?.name.split(',')[0] ?? 'Deck importado' }

  const data = indexCards(found.values())
  const commanderCandidates = deck.commanders.length
    ? []
    : deck.cards.flatMap((c) => {
      const card = data.byOracle.get(c.oracleId)
      return card?.facts && isEligibleAlone(card.facts) ? [card] : []
    })
  return { deck, data, missing, errors: parsed.errors, commanderCandidates }
}

export function exportDecklist(deck: Deck): string {
  const line = (c: { count: number; name: string }) => `${c.count} ${c.name}`
  return [
    ...(deck.commanders.length ? ['Commander', ...deck.commanders.map(line), ''] : []),
    'Deck',
    ...[...deck.cards].sort((a, b) => a.name.localeCompare(b.name)).map(line),
  ].join('\n')
}
