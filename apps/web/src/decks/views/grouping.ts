// How the editor lays the deck out (épico 10, req. 4–6): groups by type, mana value, color or category, sorted by name
// or mana value. Pure: the three views (list, stacks, grid) render the same groups.

import type { Color } from '@gathering-hall/formats'
import { TYPE_GROUPS, typeGroup, type CardInfo, type DeckCard, type TypeGroup } from '../model'

export type DeckViewMode = 'list' | 'stacks' | 'grid'
export const VIEW_LABELS: Record<DeckViewMode, string> = { list: 'Lista', stacks: 'Pilhas', grid: 'Grade' }
export type GroupBy = 'type' | 'mv' | 'color' | 'category'
export type SortBy = 'name' | 'mv'

export const GROUP_BY_LABELS: Record<GroupBy, string> = { type: 'Tipo', mv: 'Valor de mana', color: 'Cor', category: 'Categoria' }
export const SORT_BY_LABELS: Record<SortBy, string> = { name: 'Nome', mv: 'Valor de mana' }
export const UNCATEGORIZED = 'Sem categoria'

export interface CardGroup {
  key: string
  label: string
  cards: DeckCard[]
  count: number // copies, not entries
}

const TYPE_LABELS: Record<TypeGroup, string> = { ...Object.fromEntries(TYPE_GROUPS), other: 'Outros' } as Record<TypeGroup, string>
const COLOR_ORDER: { key: string; label: string }[] = [
  { key: 'W', label: 'Branco' }, { key: 'U', label: 'Azul' }, { key: 'B', label: 'Preto' }, { key: 'R', label: 'Vermelho' },
  { key: 'G', label: 'Verde' }, { key: 'multi', label: 'Multicolor' }, { key: 'C', label: 'Incolor' }, { key: 'land', label: 'Terrenos' },
]
const NO_DATA = { key: 'unknown', label: 'Sem dados do catálogo' }

interface Slot { key: string; label: string; rank: number }

function slotFor(card: DeckCard, info: CardInfo | undefined, by: GroupBy, categoryRank: (tag: string) => number): Slot {
  if (by === 'category') {
    const tag = card.tags?.[0]
    return tag ? { key: `tag:${tag.toLowerCase()}`, label: tag, rank: categoryRank(tag) } : { key: 'tag:', label: UNCATEGORIZED, rank: Number.MAX_SAFE_INTEGER }
  }
  if (!info) return { ...NO_DATA, rank: 10_000 }
  const group = typeGroup(info.typeLine)
  if (by === 'type') {
    const i = TYPE_GROUPS.findIndex(([k]) => k === group)
    return { key: group, label: TYPE_LABELS[group], rank: i < 0 ? TYPE_GROUPS.length : i }
  }
  if (group === 'land') return { key: 'land', label: 'Terrenos', rank: 1_000 }
  if (by === 'mv') {
    const mv = Math.min(7, Math.max(0, Math.floor(info.manaValue)))
    return { key: `mv${mv}`, label: mv === 7 ? 'Valor 7+' : `Valor ${mv}`, rank: mv }
  }
  const colors: Color[] = info.colorIdentity
  const key = colors.length === 0 ? 'C' : colors.length > 1 ? 'multi' : colors[0]!
  const i = COLOR_ORDER.findIndex((c) => c.key === key)
  return { key, label: COLOR_ORDER[i]!.label, rank: i }
}

export function groupCards(
  cards: readonly DeckCard[], info: ReadonlyMap<string, CardInfo>, by: GroupBy, sort: SortBy, tagOrder: readonly string[] = [],
): CardGroup[] {
  // Categories follow the deck's order; the ones it does not list come after, alphabetically.
  const order = new Map(tagOrder.map((t, i) => [t.toLowerCase(), i]))
  const categoryRank = (tag: string) => order.get(tag.toLowerCase()) ?? tagOrder.length + 1
  const groups = new Map<string, Slot & { cards: DeckCard[] }>()
  for (const card of cards) {
    const slot = slotFor(card, info.get(card.oracleId), by, categoryRank)
    const g = groups.get(slot.key) ?? { ...slot, cards: [] }
    g.cards.push(card)
    groups.set(slot.key, g)
  }
  const mv = (c: DeckCard) => info.get(c.oracleId)?.manaValue ?? Number.MAX_SAFE_INTEGER
  const byName = (a: DeckCard, b: DeckCard) => a.name.localeCompare(b.name)
  const compare = sort === 'mv' ? (a: DeckCard, b: DeckCard) => mv(a) - mv(b) || byName(a, b) : byName
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .map(({ key, label, cards: list }) => ({ key, label, cards: [...list].sort(compare), count: list.reduce((n, c) => n + c.count, 0) }))
}
