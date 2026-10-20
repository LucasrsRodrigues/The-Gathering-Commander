import { describe, expect, it } from 'vitest'
import { suggestCategories, suggestionsFor } from './tags'

// Oracle text as Scryfall has it (only what the rules read).
const cards: Record<string, { typeLine: string; oracleText: string }> = {
  'Sol Ring': { typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.' },
  Cultivate: { typeLine: 'Sorcery', oracleText: 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.' },
  'Swords to Plowshares': { typeLine: 'Instant', oracleText: 'Exile target creature. Its controller gains life equal to its power.' },
  'Wrath of God': { typeLine: 'Sorcery', oracleText: "Destroy all creatures. They can't be regenerated." },
  Counterspell: { typeLine: 'Instant', oracleText: 'Counter target spell.' },
  'Demonic Tutor': { typeLine: 'Sorcery', oracleText: 'Search your library for a card, put that card into your hand, then shuffle.' },
  'Rhystic Study': { typeLine: 'Enchantment', oracleText: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.' },
  'Command Tower': { typeLine: 'Land', oracleText: "{T}: Add one mana of any color in your commander's color identity." },
  'Llanowar Elves': { typeLine: 'Creature — Elf Druid', oracleText: '{T}: Add {G}.' },
  'Lightning Bolt': { typeLine: 'Instant', oracleText: 'Lightning Bolt deals 3 damage to any target.' },
  'Grizzly Bears': { typeLine: 'Creature — Bear', oracleText: '' },
  'Enlightened Tutor': { typeLine: 'Instant', oracleText: 'Search your library for an artifact or enchantment card, reveal it, then shuffle and put that card on top.' },
}
const suggest = (name: string) => suggestCategories(cards[name]!)

describe('category suggestions from the Oracle text', () => {
  it('recognizes the usual functions of known staples', () => {
    expect(suggest('Sol Ring')).toEqual(['Ramp'])
    expect(suggest('Cultivate')).toEqual(['Ramp'])
    expect(suggest('Swords to Plowshares')).toEqual(['Remoção'])
    expect(suggest('Wrath of God')).toEqual(['Limpa-mesa'])
    expect(suggest('Counterspell')).toEqual(['Contramágica'])
    expect(suggest('Demonic Tutor')).toEqual(['Tutor'])
    expect(suggest('Rhystic Study')).toEqual(['Compra'])
    expect(suggest('Llanowar Elves')).toEqual(['Ramp'])
    expect(suggest('Lightning Bolt')).toEqual(['Remoção'])
    expect(suggest('Enlightened Tutor')).toEqual(['Tutor'])
  })

  it('lands are lands, not ramp; vanilla cards get nothing', () => {
    expect(suggest('Command Tower')).toEqual(['Terreno'])
    expect(suggest('Grizzly Bears')).toEqual([])
  })

  it('suggests only what the card does not have yet', () => {
    const facts = new Map(Object.entries(cards).map(([name, f]) => [name, f]))
    const list = suggestionsFor([
      { zone: 'cards', card: { oracleId: 'Sol Ring', name: 'Sol Ring', tags: ['ramp'] } },
      { zone: 'cards', card: { oracleId: 'Counterspell', name: 'Counterspell' } },
      { zone: 'maybe', card: { oracleId: 'unknown', name: 'Sem dados' } },
    ], facts)
    expect(list).toEqual([{ zone: 'cards', oracleId: 'Counterspell', name: 'Counterspell', tags: ['Contramágica'] }])
  })
})
