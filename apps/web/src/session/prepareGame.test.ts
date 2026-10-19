import { officialPreset, type Preset } from '@gathering-hall/formats'
import { describe, expect, it } from 'vitest'
import { normalizeName, type CatalogCard, type CatalogPort } from '../catalog/catalog'
import { addCard, newDeck } from '../decks/model'
import { prepareGame } from './prepareGame'

function card(name: string, typeLine: string, colors: ('R' | 'G')[] = []): CatalogCard {
  const oracleId = `or-${normalizeName(name)}`
  return {
    ref: { name, oracleId, typeLine },
    images: null,
    manaValue: 1,
    facts: { oracleId, name, typeLine, oracleText: '', colorIdentity: colors, keywords: [], legalCommander: 'legal', gameChanger: false },
  }
}

const CARDS = [card('Krenko, Mob Boss', 'Legendary Creature — Goblin', ['R']), card('Sol Ring', 'Artifact'), card('Mountain', 'Basic Land — Mountain', ['R'])]
const catalog: CatalogPort = {
  async resolve(names) {
    const found = new Map<string, CatalogCard>()
    for (const n of names) {
      const hit = CARDS.find((c) => normalizeName(c.ref.name) === normalizeName(n))
      if (hit) found.set(normalizeName(n), hit)
    }
    return { found, missing: [] }
  },
  async resolvePrintings() { return new Map() },
  async search() { return { cards: [], total: 0 } },
  async autocomplete() { return [] },
  async printings() { return [] },
}

function krenkoDeck() {
  let d = newDeck('k', 'Krenko', 0)
  d = addCard(d, { oracleId: 'or-krenko, mob boss', name: 'Krenko, Mob Boss' }, 'commanders', 0)
  d = addCard(d, { oracleId: 'or-sol ring', name: 'Sol Ring' }, 'cards', 0)
  return addCard(d, { oracleId: 'or-mountain', name: 'Mountain' }, 'cards', 0, 98)
}

const noSolRing: Preset = { ...officialPreset(), id: 'sexta', name: 'Sexta', ruleset: { startingLife: 30 }, deckRules: { banlist: { extraBans: ['Sol Ring'] } } }

describe('prepareGame', () => {
  it('starts a game with the preset ruleset when decks are valid', async () => {
    const result = await prepareGame([{ name: 'Ana', deck: { kind: 'saved', deck: krenkoDeck() } }], officialPreset(), catalog, 1, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.game.players.p1!.life).toBe(40)
  })

  it('a "block" violation stops the game and says why', async () => {
    const result = await prepareGame([{ name: 'Ana', deck: { kind: 'saved', deck: krenkoDeck() } }], noSolRing, catalog, 1, 0)
    expect(result.ok).toBe(false)
    expect(result.reports[0]!.violations[0]).toMatchObject({ rule: 'banned', level: 'block', cards: ['Sol Ring'] })
  })

  it('a "warn" violation starts the game but is reported', async () => {
    const warnOnly: Preset = { ...noSolRing, deckRules: { banlist: { extraBans: ['Sol Ring'], level: 'warn' } } }
    const result = await prepareGame([{ name: 'Ana', deck: { kind: 'saved', deck: krenkoDeck() } }], warnOnly, catalog, 1, 0)
    expect(result.ok).toBe(true)
    expect(result.reports[0]!.violations[0]!.level).toBe('warn')
    if (result.ok) expect(result.game.players.p1!.life).toBe(30)
  })

  it('pasted lists without a commander use the first eligible card and say so', async () => {
    const result = await prepareGame([{ name: 'Bia', deck: { kind: 'text', text: '1 Sol Ring\n1 Krenko, Mob Boss\n98 Mountain' } }], officialPreset(), catalog, 1, 0)
    expect(result.ok).toBe(true)
    expect(result.reports[0]!.notes.join(' ')).toContain('Krenko')
  })
})

describe('prepareGame for goldfish', () => {
  it('never blocks when enforcement is off, but still reports', async () => {
    const result = await prepareGame([{ name: 'Ana', deck: { kind: 'saved', deck: krenkoDeck() } }], noSolRing, catalog, 1, 0, false)
    expect(result.ok).toBe(true)
    expect(result.reports[0]!.violations).toHaveLength(1)
  })
})
