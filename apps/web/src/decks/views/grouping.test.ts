import { describe, expect, it } from 'vitest'
import type { CardInfo, DeckCard } from '../model'
import { groupCards, UNCATEGORIZED } from './grouping'

const info = new Map<string, CardInfo>([
  ['sol', { typeLine: 'Artifact', manaValue: 1, colorIdentity: [] }],
  ['bolt', { typeLine: 'Instant', manaValue: 1, colorIdentity: ['R'] }],
  ['elf', { typeLine: 'Creature — Elf Druid', manaValue: 1, colorIdentity: ['G'] }],
  ['wrath', { typeLine: 'Sorcery', manaValue: 4, colorIdentity: ['W'] }],
  ['boros', { typeLine: 'Legendary Creature — Human', manaValue: 9, colorIdentity: ['R', 'W'] }],
  ['forest', { typeLine: 'Basic Land — Forest', manaValue: 0, colorIdentity: ['G'] }],
])
const card = (oracleId: string, name: string, count = 1, tags?: string[]): DeckCard => ({ oracleId, name, count, ...(tags ? { tags } : {}) })
const cards = [
  card('wrath', 'Wrath of God', 1, ['Limpa-mesa']), card('sol', 'Sol Ring', 1, ['Ramp', 'Mana']), card('bolt', 'Lightning Bolt', 1, ['Remoção']),
  card('elf', 'Llanowar Elves', 1, ['Ramp']), card('boros', 'Boros Big', 1), card('forest', 'Forest', 30), card('nodata', 'Unknown Card'),
]
const shape = (groups: ReturnType<typeof groupCards>) => groups.map((g) => [g.label, g.count, g.cards.map((c) => c.name)])

describe('grouping the deck', () => {
  it('by type, in the usual type order, counting copies', () => {
    expect(shape(groupCards(cards, info, 'type', 'name'))).toEqual([
      ['Criaturas', 2, ['Boros Big', 'Llanowar Elves']], ['Terrenos', 30, ['Forest']], ['Instantâneas', 1, ['Lightning Bolt']],
      ['Feitiços', 1, ['Wrath of God']], ['Artefatos', 1, ['Sol Ring']], ['Sem dados do catálogo', 1, ['Unknown Card']],
    ])
  })

  it('by mana value, with 7+ together and lands apart', () => {
    expect(shape(groupCards(cards, info, 'mv', 'name')).map(([l]) => l)).toEqual(['Valor 1', 'Valor 4', 'Valor 7+', 'Terrenos', 'Sem dados do catálogo'])
  })

  it('by color identity: mono colors, multicolor, colorless, lands', () => {
    expect(shape(groupCards(cards, info, 'color', 'name')).map(([l, , names]) => [l, names])).toEqual([
      ['Branco', ['Wrath of God']], ['Vermelho', ['Lightning Bolt']], ['Verde', ['Llanowar Elves']], ['Multicolor', ['Boros Big']],
      ['Incolor', ['Sol Ring']], ['Terrenos', ['Forest']], ['Sem dados do catálogo', ['Unknown Card']],
    ])
  })

  it('by main category: the deck order first, then alphabetical, uncategorized last', () => {
    const groups = groupCards(cards, info, 'category', 'name', ['Remoção', 'Ramp'])
    expect(shape(groups).map(([l, , names]) => [l, names])).toEqual([
      ['Remoção', ['Lightning Bolt']], ['Ramp', ['Llanowar Elves', 'Sol Ring']], ['Limpa-mesa', ['Wrath of God']],
      [UNCATEGORIZED, ['Boros Big', 'Forest', 'Unknown Card']],
    ])
  })

  it('sorts by mana value, then name', () => {
    const [creatures] = groupCards([card('boros', 'A Big'), card('elf', 'Z Elf')], info, 'type', 'mv')
    expect(creatures!.cards.map((c) => c.name)).toEqual(['Z Elf', 'A Big'])
  })

  it('category names group regardless of case', () => {
    const groups = groupCards([card('sol', 'Sol Ring', 1, ['ramp']), card('elf', 'Elf', 1, ['Ramp'])], info, 'category', 'name')
    expect(groups).toHaveLength(1)
  })
})
