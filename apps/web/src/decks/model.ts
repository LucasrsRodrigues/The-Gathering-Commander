// Deck model: references to cards (oracleId + name, optional chosen printing), never card data.
// All functions are pure and return new decks; adding and removing cards also records it in the deck's history.

import { DECK_LIMITS, withChange, type Color, type DeckForValidation } from '@gathering-hall/formats'
import { COLORS, type ManaInfo } from './manaInfo'
import type { Coverage } from '@gathering-hall/engine'

// The document shape (and its validator) lives in @gathering-hall/formats: the server validates cloud decks with it.
export type { Deck, DeckCard, DeckZone } from '@gathering-hall/formats'
import type { Deck, DeckCard, DeckZone } from '@gathering-hall/formats'

export { MAX_DECK_NAME } from '@gathering-hall/formats'
import { MAX_DECK_NAME } from '@gathering-hall/formats'

export function newDeck(id: string, name: string, now: number): Deck {
  return {
    schemaVersion: 2, id, name: name.trim().slice(0, MAX_DECK_NAME) || 'Deck sem nome',
    commanders: [], cards: [], maybe: [], history: [], createdAt: now, updatedAt: now,
  }
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
  return withChange(deck, touch(deck, { [zone]: next }, now), now)
}

export function removeCard(deck: Deck, oracleId: string, zone: DeckZone, now: number, count = 1): Deck {
  const next = deck[zone].flatMap((c) => (c.oracleId !== oracleId ? [c] : c.count > count ? [{ ...c, count: c.count - count }] : []))
  return withChange(deck, touch(deck, { [zone]: next }, now), now)
}

// Moves one copy between lists, keeping its chosen printing and its categories. Without `to`, it switches between
// the deck and the command zone (and the "Talvez" list sends cards to the deck).
export function moveCard(deck: Deck, oracleId: string, from: DeckZone, now: number, to: DeckZone = from === 'cards' ? 'commanders' : 'cards'): Deck {
  const card = deck[from].find((c) => c.oracleId === oracleId)
  if (!card || from === to) return deck
  const { count: _count, ...ref } = card
  return addCard(removeCard(deck, oracleId, from, now), ref, to, now)
}

// Moves every copy of an entry to another list (menu, drag, selection), with its printing and categories.
export function moveEntry(deck: Deck, oracleId: string, from: DeckZone, to: DeckZone, now: number): Deck {
  const card = deck[from].find((c) => c.oracleId === oracleId)
  if (!card || from === to) return deck
  const { count, ...ref } = card
  return addCard(removeCard(deck, oracleId, from, now, count), ref, to, now, count)
}

export function removeEntry(deck: Deck, oracleId: string, zone: DeckZone, now: number): Deck {
  const card = deck[zone].find((c) => c.oracleId === oracleId)
  return card ? removeCard(deck, oracleId, zone, now, card.count) : deck
}

// Makes `tag` the main category of these cards (keeping their other ones); null takes the main one off.
// Categories are not card changes, so nothing goes into the history.
export function setMainCategory(deck: Deck, zone: DeckZone, oracleIds: readonly string[], tag: string | null, now: number): Deck {
  const ids = new Set(oracleIds)
  const next = deck[zone].map((c) => {
    if (!ids.has(c.oracleId)) return c
    const rest = (c.tags ?? []).filter((t) => !tag || t.toLowerCase() !== tag.toLowerCase())
    const tags = tag ? [tag, ...rest] : rest.slice(1)
    const { tags: _old, ...base } = c
    return tags.length ? { ...base, tags } : base
  })
  return touch(deck, { [zone]: next }, now)
}

// ---- Categories (épico 10, req. 6–8): tags on the cards, the first one is the main; tagOrder orders them and
// keeps categories that have no card yet. None of this is a card change, so the history is untouched.

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const ZONES: DeckZone[] = ['commanders', 'cards', 'maybe']

function cleanTag(tag: string): string | null {
  // oxlint-disable-next-line no-control-regex -- control characters never belong in a category name
  const t = tag.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, DECK_LIMITS.tagLength).trim()
  return t || null
}

function mapTags(deck: Deck, fn: (tags: string[], card: DeckCard, zone: DeckZone) => string[]): Partial<Deck> {
  const patch: Partial<Record<DeckZone, DeckCard[]>> = {}
  for (const zone of ZONES) {
    patch[zone] = deck[zone].map((c) => {
      const tags = fn(c.tags ?? [], c, zone).slice(0, DECK_LIMITS.tagsPerCard)
      const { tags: _old, ...base } = c
      return tags.length ? { ...base, tags } : base
    })
  }
  return patch
}

// The deck's categories in grouping order (tagOrder first, then the rest alphabetically), with copies counted in
// the deck proper (main category only, like the grouping).
export function categoriesOf(deck: Deck): { name: string; count: number }[] {
  const names: string[] = [...(deck.tagOrder ?? [])]
  for (const zone of ZONES) for (const c of deck[zone]) for (const t of c.tags ?? []) if (!names.some((n) => same(n, t))) names.push(t)
  const ordered = [...names.slice(0, deck.tagOrder?.length ?? 0), ...names.slice(deck.tagOrder?.length ?? 0).sort((a, b) => a.localeCompare(b))]
  return ordered.map((name) => ({
    name,
    count: deck.cards.filter((c) => c.tags?.[0] && same(c.tags[0], name)).reduce((n, c) => n + c.count, 0),
  }))
}

// A new (empty) category at the end of the order.
export function addCategory(deck: Deck, name: string, now: number): Deck {
  const tag = cleanTag(name)
  if (!tag || categoriesOf(deck).some((c) => same(c.name, tag)) || categoriesOf(deck).length >= DECK_LIMITS.distinctTags) return deck
  return touch(deck, { tagOrder: [...categoriesOf(deck).map((c) => c.name), tag] }, now)
}

// Turns a category on or off for these cards. On: it goes last (it becomes the main one only if the card had none).
export function toggleCategory(deck: Deck, zone: DeckZone, oracleIds: readonly string[], name: string, on: boolean, now: number): Deck {
  const tag = cleanTag(name)
  if (!tag) return deck
  const ids = new Set(oracleIds)
  const existing = categoriesOf(deck).find((c) => same(c.name, tag))
  if (on && !existing && categoriesOf(deck).length >= DECK_LIMITS.distinctTags) return deck
  const known = existing?.name ?? tag // keep the deck's spelling
  const patch = mapTags(deck, (tags, card, z) => {
    if (z !== zone || !ids.has(card.oracleId)) return tags
    const rest = tags.filter((t) => !same(t, known))
    return on ? [...rest, known] : rest
  })
  return touch(deck, patch, now)
}

// Renames everywhere; renaming onto an existing category merges the two.
export function renameCategory(deck: Deck, from: string, to: string, now: number): Deck {
  const tag = cleanTag(to)
  if (!tag || from === tag) return deck
  const patch = mapTags(deck, (tags) => {
    const out: string[] = []
    for (const t of tags.map((x) => (same(x, from) ? tag : x))) if (!out.some((o) => same(o, t))) out.push(t)
    return out
  })
  const order: string[] = []
  for (const t of categoriesOf(deck).map((c) => (same(c.name, from) ? tag : c.name))) if (!order.some((o) => same(o, t))) order.push(t)
  return touch(deck, { ...patch, tagOrder: order }, now)
}

// Removes the category from every card (the cards stay) and from the order.
export function deleteCategory(deck: Deck, name: string, now: number): Deck {
  const patch = mapTags(deck, (tags) => tags.filter((t) => !same(t, name)))
  return touch(deck, { ...patch, tagOrder: categoriesOf(deck).map((c) => c.name).filter((t) => !same(t, name)) }, now)
}

// Moves a category one step earlier (-1) or later (+1) in the grouping order.
export function moveCategory(deck: Deck, name: string, delta: -1 | 1, now: number): Deck {
  const order = categoriesOf(deck).map((c) => c.name)
  const i = order.findIndex((t) => same(t, name))
  const j = i + delta
  if (i < 0 || j < 0 || j >= order.length) return deck
  ;[order[i], order[j]] = [order[j]!, order[i]!]
  return touch(deck, { tagOrder: order }, now)
}

export function setPrinting(deck: Deck, oracleId: string, scryfallId: string, now: number): Deck {
  const swap = (list: DeckCard[]) => list.map((c) => (c.oracleId === oracleId ? { ...c, scryfallId } : c))
  return touch(deck, { commanders: swap(deck.commanders), cards: swap(deck.cards), maybe: swap(deck.maybe) }, now)
}

export function renameDeck(deck: Deck, name: string, now: number): Deck {
  return touch(deck, { name: name.slice(0, MAX_DECK_NAME) }, now)
}

// The deck proper: the "Talvez" list never counts, validates or plays.
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
  mana?: ManaInfo // cost symbols and colors it produces (stats)
  coverage?: Coverage // épico 11: how much of the card the engine does by itself
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
  averageManaValue: number // nonland cards
  averageWithLands: number
  colors: Record<Color | 'C', number> // nonland cards by color identity (multicolor counts in each)
  pips: Record<Color, number> // colored symbols in the costs (copies counted)
  sources: Record<Color | 'C', number> // cards that can add each color (lands and the rest)
  types: Partial<Record<TypeGroup, number>>
  categories: { name: string; count: number }[] // main category, in the deck's order
  coverage: Record<Coverage, number> // épico 11: copies the engine automates fully, in part, or not at all
}

// The deck proper only (commanders + cards): the Talvez list never counts. `identity` lets "any color" sources
// (Command Tower, Arcane Signet…) count for each color of the commander.
export function deckStats(deck: Deck, info: ReadonlyMap<string, CardInfo>, identity: readonly Color[] = COLORS): DeckStats {
  const stats: DeckStats = {
    total: 0, lands: 0, curve: Array(8).fill(0), averageManaValue: 0, averageWithLands: 0,
    colors: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    sources: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, types: {}, categories: [], coverage: { automated: 0, partial: 0, manual: 0 },
  }
  let mvSum = 0
  let nonLands = 0
  for (const c of [...deck.commanders, ...deck.cards]) {
    stats.total += c.count
    const card = info.get(c.oracleId)
    if (!card) continue
    if (card.coverage) stats.coverage[card.coverage] += c.count
    const group = typeGroup(card.typeLine)
    stats.types[group] = (stats.types[group] ?? 0) + c.count
    if (card.mana) {
      for (const color of COLORS) stats.pips[color] += (card.mana.pips[color] ?? 0) * c.count
      const produced = new Set<Color | 'C'>([...card.mana.sources, ...(card.mana.anyColor ? identity : [])])
      for (const t of produced) stats.sources[t] += c.count
    }
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
  const round = (n: number) => Math.round(n * 100) / 100
  stats.averageManaValue = nonLands ? round(mvSum / nonLands) : 0
  stats.averageWithLands = nonLands + stats.lands ? round(mvSum / (nonLands + stats.lands)) : 0
  stats.categories = categoriesOf(deck).filter((cat) => cat.count > 0)
  return stats
}

// What a click on a number of the stats panel highlights (req. 12).
export type StatFilter =
  | { kind: 'mv'; mv: number; withLands?: boolean } // nonland (lands too at 0 when withLands), 7 = 7+
  | { kind: 'type'; group: TypeGroup }
  | { kind: 'color'; color: Color | 'C' }
  | { kind: 'pip'; color: Color }
  | { kind: 'source'; color: Color | 'C' }
  | { kind: 'category'; name: string }
  | { kind: 'coverage'; level: Coverage }

export function cardsMatching(deck: Deck, info: ReadonlyMap<string, CardInfo>, filter: StatFilter, identity: readonly Color[] = COLORS): string[] {
  return [...deck.commanders, ...deck.cards].filter((c) => {
    const card = info.get(c.oracleId)
    if (filter.kind === 'category') return !!c.tags?.[0] && c.tags[0].toLowerCase() === filter.name.toLowerCase()
    if (!card) return false
    const land = typeGroup(card.typeLine) === 'land'
    switch (filter.kind) {
      case 'mv': return land ? !!filter.withLands && filter.mv === 0 : Math.min(7, Math.max(0, Math.floor(card.manaValue))) === filter.mv
      case 'type': return typeGroup(card.typeLine) === filter.group
      case 'color': return !land && (filter.color === 'C' ? card.colorIdentity.length === 0 : card.colorIdentity.includes(filter.color))
      case 'pip': return (card.mana?.pips[filter.color] ?? 0) > 0
      case 'coverage': return card.coverage === filter.level
      case 'source': return !!card.mana && (card.mana.sources.includes(filter.color) || (card.mana.anyColor && identity.includes(filter.color as Color)))
    }
  }).map((c) => c.name)
}
