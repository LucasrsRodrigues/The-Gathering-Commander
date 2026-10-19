import { describe, expect, it } from 'vitest'
import { addCard, deckSize, deckStats, moveCard, newDeck, removeCard, setPrinting, toValidation, typeGroup, type CardInfo } from './model'

const elf = { oracleId: 'o-elf', name: 'Llanowar Elves' }
const forest = { oracleId: 'o-forest', name: 'Forest' }
const ezuri = { oracleId: 'o-ezuri', name: 'Ezuri, Renegade Leader' }

describe('deck model', () => {
  it('adds, stacks and removes cards immutably', () => {
    const empty = newDeck('d1', '  Elfos ', 1)
    expect(empty.name).toBe('Elfos')
    const a = addCard(empty, elf, 'cards', 2)
    const b = addCard(a, elf, 'cards', 3)
    expect(empty.cards).toEqual([])
    expect(b.cards).toEqual([{ ...elf, count: 2 }])
    expect(b.updatedAt).toBe(3)
    expect(removeCard(b, elf.oracleId, 'cards', 4).cards).toEqual([{ ...elf, count: 1 }])
    expect(removeCard(removeCard(b, elf.oracleId, 'cards', 4), elf.oracleId, 'cards', 5).cards).toEqual([])
  })

  it('moves a card to the command zone keeping its printing', () => {
    let d = addCard(newDeck('d', 'x', 0), { ...ezuri, scryfallId: 'p1' }, 'cards', 1)
    d = moveCard(d, ezuri.oracleId, 'cards', 2)
    expect(d.commanders).toEqual([{ ...ezuri, scryfallId: 'p1', count: 1 }])
    expect(d.cards).toEqual([])
  })

  it('changing the printing does not change what validation sees', () => {
    const d = addCard(newDeck('d', 'x', 0), elf, 'cards', 1)
    expect(toValidation(setPrinting(d, elf.oracleId, 'other-art', 2))).toEqual(toValidation(d))
  })

  it('computes size and stats (curve, colors, types) by oracleId', () => {
    let d = newDeck('d', 'x', 0)
    d = addCard(d, ezuri, 'commanders', 1)
    d = addCard(d, elf, 'cards', 1)
    d = addCard(d, forest, 'cards', 1, 30)
    const info = new Map<string, CardInfo>([
      [ezuri.oracleId, { typeLine: 'Legendary Creature — Elf Warrior', manaValue: 3, colorIdentity: ['G'] }],
      [elf.oracleId, { typeLine: 'Creature — Elf Druid', manaValue: 1, colorIdentity: ['G'] }],
      [forest.oracleId, { typeLine: 'Basic Land — Forest', manaValue: 0, colorIdentity: ['G'] }],
    ])
    expect(deckSize(d)).toBe(32)
    const s = deckStats(d, info)
    expect(s).toMatchObject({ total: 32, lands: 30, averageManaValue: 2, types: { creature: 2, land: 30 } })
    expect(s.curve.slice(0, 4)).toEqual([0, 1, 0, 1])
    expect(s.colors.G).toBe(2)
  })

  it('groups types by the front face, lands before spells', () => {
    expect(typeGroup('Artifact Land')).toBe('land')
    expect(typeGroup('Artifact Creature — Golem')).toBe('creature')
    expect(typeGroup('Instant // Sorcery')).toBe('instant')
    expect(typeGroup(undefined)).toBe('other')
  })
})
