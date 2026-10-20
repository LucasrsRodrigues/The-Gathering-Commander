// Saving the deck text (épico 10, req. 14): resolve the names (and the printings given by (SET) number) in the
// catalog, rebuild the three lists, and record it all as one change in the history. Names the catalog does not know
// are listed; the rest of the deck is saved anyway.

import { DECK_LIMITS, withChange } from '@gathering-hall/formats'
import { normalizeName, printKey, type CatalogCard, type CatalogPort } from '../catalog/catalog'
import type { BulkEntry, ParsedBulk } from './bulkText'
import type { Deck, DeckCard, DeckZone } from './model'

export interface BulkResult {
  deck: Deck
  cards: CatalogCard[] // for the editor's card data (images, stats)
  printings: CatalogCard[] // the printings the text chose (art)
  missing: string[]
}

const ZONES: DeckZone[] = ['commanders', 'cards', 'maybe']

export async function applyBulk(deck: Deck, parsed: ParsedBulk, catalog: CatalogPort, now: number): Promise<BulkResult> {
  const entries = ZONES.flatMap((zone) => parsed[zone].map((e) => ({ zone, e })))
  const names = [...new Set(entries.map(({ e }) => e.name))]
  const { found, missing } = names.length ? await catalog.resolve(names) : { found: new Map<string, CatalogCard>(), missing: [] }
  const wantedPrints = entries.flatMap(({ e }) => (e.set && e.number ? [{ set: e.set, number: e.number }] : []))
  const prints = wantedPrints.length && catalog.resolveSetNumbers ? await catalog.resolveSetNumbers(wantedPrints).catch(() => new Map()) : new Map<string, CatalogCard>()

  // The printing a card had before stays, unless the text names another one.
  const previous = new Map<string, DeckCard>()
  for (const zone of ZONES) for (const c of deck[zone]) if (!previous.has(c.oracleId)) previous.set(c.oracleId, c)

  const lists: Record<DeckZone, DeckCard[]> = { commanders: [], cards: [], maybe: [] }
  const add = (zone: DeckZone, e: BulkEntry) => {
    const card = found.get(normalizeName(e.name))
    const oracleId = card?.facts?.oracleId ?? card?.ref.oracleId
    if (!card || !oracleId) return
    const printing = e.set && e.number ? prints.get(printKey(e.set, e.number)) : undefined
    const scryfallId = printing && (printing.facts?.oracleId ?? printing.ref.oracleId) === oracleId ? printing.ref.scryfallId : previous.get(oracleId)?.scryfallId
    const list = lists[zone]
    const existing = list.find((c) => c.oracleId === oracleId)
    if (existing) {
      existing.count = Math.min(99, existing.count + e.count)
      const tags = [...(existing.tags ?? [])]
      for (const t of e.tags) if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t)
      if (tags.length) existing.tags = tags.slice(0, DECK_LIMITS.tagsPerCard)
      return
    }
    list.push({ oracleId, name: card.ref.name, count: e.count, ...(scryfallId ? { scryfallId } : {}), ...(e.tags.length ? { tags: e.tags } : {}) })
  }
  for (const { zone, e } of entries) add(zone, e)

  // Category order: the deck's (empty categories included), then new ones in the order they appear.
  const order = [...(deck.tagOrder ?? [])]
  for (const zone of ZONES) for (const c of lists[zone]) for (const t of c.tags ?? []) if (!order.some((o) => o.toLowerCase() === t.toLowerCase())) order.push(t)
  const next: Deck = {
    ...deck, commanders: lists.commanders.slice(0, 2), cards: lists.cards, maybe: lists.maybe, updatedAt: now,
    ...(order.length ? { tagOrder: order.slice(0, DECK_LIMITS.distinctTags) } : {}),
  }
  return { deck: withChange(deck, next, now, false), cards: [...found.values()], printings: [...prints.values()], missing }
}
