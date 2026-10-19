import { describe, expect, it } from 'vitest'
import { normalizeName, type CatalogCard, type CatalogPort } from '../catalog/catalog'
import { loadDeckCards, toGameDeck } from './cardData'
import { exportDecklist, importDecklist } from './importExport'
import { setPrinting } from './model'

function card(name: string, typeLine: string, oracleText = ''): CatalogCard {
  const oracleId = `or-${normalizeName(name)}`
  return {
    ref: { name, oracleId, typeLine, scryfallId: `sf-${oracleId}`, imageKey: `sf-${oracleId}` },
    images: null,
    manaValue: 1,
    facts: { oracleId, name, typeLine, oracleText, colorIdentity: [], keywords: [], legalCommander: 'legal', gameChanger: false },
  }
}

const CARDS = [
  card('Krenko, Mob Boss', 'Legendary Creature — Goblin Warrior'),
  card('Sol Ring', 'Artifact'),
  card('Mountain', 'Basic Land — Mountain'),
  card('Goblin Matron', 'Creature — Goblin'),
]

function fakeCatalog(): CatalogPort {
  const byName = new Map(CARDS.map((c) => [normalizeName(c.ref.name), c]))
  return {
    async resolve(names) {
      const found = new Map<string, CatalogCard>()
      const missing: string[] = []
      for (const n of names) {
        const hit = byName.get(normalizeName(n))
        if (hit) found.set(normalizeName(n), hit)
        else missing.push(n)
      }
      return { found, missing }
    },
    async resolvePrintings(ids) {
      return new Map(ids.map((id) => [id, { ...CARDS[1]!, ref: { ...CARDS[1]!.ref, scryfallId: id, imageKey: id } }]))
    },
    async search() { return { cards: [], total: 0 } },
    async autocomplete() { return [] },
    async printings() { return [] },
  }
}

describe('import / export', () => {
  it('imports a Moxfield-style list, reports missing names and round-trips', async () => {
    const text = ['1 Krenko, Mob Boss *CMDR*', '1 Sol Ring (CMM) 1', '30 Mountain', '1 Nope Card'].join('\n')
    const { deck, missing, commanderCandidates } = await importDecklist(text, fakeCatalog(), 'd1', 5)
    expect(deck.name).toBe('Krenko')
    expect(deck.commanders.map((c) => c.name)).toEqual(['Krenko, Mob Boss'])
    expect(deck.cards.map((c) => [c.name, c.count])).toEqual([['Sol Ring', 1], ['Mountain', 30]])
    expect(missing).toEqual(['Nope Card'])
    expect(commanderCandidates).toEqual([])

    const again = await importDecklist(exportDecklist(deck), fakeCatalog(), 'd2', 6, 'Cópia')
    expect(again.deck.commanders).toEqual(deck.commanders)
    expect(again.deck.cards.map((c) => [c.name, c.count]).sort()).toEqual(deck.cards.map((c) => [c.name, c.count]).sort())
  })

  it('without a marked commander, offers the eligible cards instead of guessing', async () => {
    const { deck, commanderCandidates } = await importDecklist('1 Krenko, Mob Boss\n1 Goblin Matron\n1 Sol Ring', fakeCatalog(), 'd', 1)
    expect(deck.commanders).toEqual([])
    expect(commanderCandidates.map((c) => c.ref.name)).toEqual(['Krenko, Mob Boss'])
  })

  it('builds engine input with the chosen printing', async () => {
    const { deck } = await importDecklist('1 Krenko, Mob Boss *CMDR*\n1 Sol Ring', fakeCatalog(), 'd', 1)
    const withArt = setPrinting(deck, 'or-sol ring', 'special-art', 2)
    const data = await loadDeckCards(withArt, fakeCatalog())
    const game = toGameDeck(withArt, data)
    expect(game.commanders.map((c) => c.name)).toEqual(['Krenko, Mob Boss'])
    expect(game.cards[0]).toMatchObject({ name: 'Sol Ring', scryfallId: 'special-art' })
  })
})
