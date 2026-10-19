import { describe, expect, it } from 'vitest'
import { blocks, officialPreset, resolvePreset, validateDeck, type DeckRules, type Preset } from '../src'
import { card, deckOf, filler, legend } from './fixtures'

const official = () => resolvePreset(officialPreset()).deckRules
const withRules = (patch: Preset['deckRules']) =>
  resolvePreset({ ...officialPreset(), id: 'casa', name: 'Casa', deckRules: patch }).deckRules
const rulesOf = (v: ReturnType<typeof validateDeck>) => v.map((x) => `${x.rule}:${x.level}`)

const ezuri = legend('Ezuri, Renegade Leader', ['G'])

describe('validateDeck — Commander oficial', () => {
  it('accepts a legal 100-card deck', () => {
    const { deck, facts } = deckOf([ezuri], [card('Llanowar Elves', { colorIdentity: ['G'] })])
    expect(validateDeck(deck, facts, official())).toEqual([])
  })

  it('checks size including the commander', () => {
    const { deck, facts } = deckOf([ezuri], [], 99)
    const v = validateDeck(deck, facts, official())
    expect(rulesOf(v)).toEqual(['size:block'])
    expect(v[0]!.message).toContain('99')
  })

  it('singleton: basics and Oracle exceptions are allowed, other copies are not', () => {
    const rats = card('Relentless Rats', { oracleText: 'A deck can have any number of cards named Relentless Rats.' })
    const dwarves = card('Seven Dwarves', { oracleText: 'A deck can have up to seven cards named Seven Dwarves.', colorIdentity: [] })
    const ring = card('Sol Ring', { typeLine: 'Artifact' })
    const { deck, facts } = deckOf([ezuri], [rats, dwarves, ring])
    deck.cards.push({ oracleId: rats.oracleId, count: 20 }, { oracleId: dwarves.oracleId, count: 6 }, { oracleId: ring.oracleId, count: 1 })
    deck.cards.find((e) => e.oracleId === filler.oracleId)!.count -= 27
    const v = validateDeck(deck, facts, official())
    expect(rulesOf(v)).toEqual(['singleton:block'])
    expect(v[0]!.cards).toEqual(['Sol Ring'])
  })

  it('color identity comes from the commanders (CR 903.4)', () => {
    const bolt = card('Lightning Bolt', { typeLine: 'Instant', colorIdentity: ['R'] })
    const { deck, facts } = deckOf([ezuri], [bolt])
    const v = validateDeck(deck, facts, official())
    expect(rulesOf(v)).toEqual(['colorIdentity:block'])
    expect(v[0]!.cards).toEqual(['Lightning Bolt'])
  })

  it('commander eligibility: legendary creature, legendary vehicle, or "can be your commander"', () => {
    const vehicle = legend('Some Legendary Vehicle', [], { typeLine: 'Legendary Artifact — Vehicle' })
    const walker = card('Some Planeswalker', { typeLine: 'Legendary Planeswalker — Teferi', oracleText: 'Some Planeswalker can be your commander.' })
    const plain = card('Grizzly Bears')
    expect(validateDeck(...deckArgs(vehicle))).toEqual([])
    expect(validateDeck(...deckArgs(walker))).toEqual([])
    expect(rulesOf(validateDeck(...deckArgs(plain)))).toEqual(['commanderEligibility:block'])
    const empty = deckOf([], [])
    expect(rulesOf(validateDeck(empty.deck, empty.facts, official()))).toEqual(['commanderEligibility:block'])
  })

  it('reports cards without catalog data as a warning', () => {
    const { deck, facts } = deckOf([ezuri], [])
    deck.cards.push({ oracleId: 'mystery', count: 1 })
    deck.cards.find((e) => e.oracleId === filler.oracleId)!.count -= 1
    expect(rulesOf(validateDeck(deck, facts, official()))).toEqual(['unknownCard:warn'])
  })
})

describe('pairings', () => {
  const partner = (name: string, colors: ('W' | 'U' | 'B' | 'R' | 'G')[], oracleText: string, typeLine = 'Legendary Creature — Human') =>
    legend(name, colors, { oracleText, typeLine })

  it.each([
    ['Partner', partner('A', ['W'], 'Flying\nPartner (You can have two commanders if both have partner.)'), partner('B', ['U'], 'Partner')],
    ['Partner with', partner('Pir, Imaginative Rascal', ['G'], 'Partner with Toothy, Imaginary Friend (When this creature enters…)'),
      partner('Toothy, Imaginary Friend', ['U'], 'Partner with Pir, Imaginative Rascal')],
    ['Partner—grupo', partner('C', ['R'], 'Partner—Survivors (You can have two commanders if both have this ability.)'), partner('D', ['G'], 'Partner—Survivors')],
    ['Friends forever', partner('E', ['W'], 'Friends forever'), partner('F', ['B'], 'Friends forever (You can have two commanders…)')],
    ['Background', partner('G', ['R'], 'Choose a Background (You can have a Background as a second commander.)'),
      partner('Some Background', ['W'], 'Commander creatures you own have …', 'Legendary Enchantment — Background')],
    ["Doctor's companion", partner('H', ['W'], "Doctor's companion"), partner('The Doctor', ['U'], '', 'Legendary Creature — Time Lord Doctor')],
  ])('%s is a valid pair', (_label, a, b) => {
    const { deck, facts } = deckOf([a, b], [])
    expect(validateDeck(deck, facts, official())).toEqual([])
  })

  it('rejects mismatched pairs and more than two commanders', () => {
    const a = partner('A', ['W'], 'Partner')
    const group = partner('C', ['R'], 'Partner—Survivors')
    const other = partner('D', ['G'], 'Partner—Father & son')
    const lone = legend('Lone', ['U'])
    expect(rulesOf(validateDeck(...pairArgs(a, lone)))).toEqual(['pairing:block'])
    expect(rulesOf(validateDeck(...pairArgs(group, other)))).toEqual(['pairing:block'])
    const three = deckOf([a, partner('B', ['U'], 'Partner'), partner('X', ['B'], 'Partner')], [])
    expect(rulesOf(validateDeck(three.deck, three.facts, official()))).toEqual(['pairing:block'])
  })

  it('a Background alone cannot lead a deck', () => {
    const bg = legend('Some Background', ['W'], { typeLine: 'Legendary Enchantment — Background' })
    expect(rulesOf(validateDeck(...deckArgs(bg)))).toEqual(['commanderEligibility:block'])
  })
})

describe('banlist and enforcement levels', () => {
  const ring = card('Sol Ring', { typeLine: 'Artifact' })
  const crypt = card('Mana Crypt', { typeLine: 'Artifact', legalCommander: 'banned' })

  it('official list comes from catalog legality', () => {
    const { deck, facts } = deckOf([ezuri], [crypt])
    const v = validateDeck(deck, facts, official())
    expect(rulesOf(v)).toEqual(['banned:block'])
    expect(v[0]!.cards).toEqual(['Mana Crypt'])
  })

  it('house rules can ban (Sol Ring) and unban (Mana Crypt) by name', () => {
    const rules = withRules({ banlist: { extraBans: ['sol ring'], unbans: ['Mana  Crypt'] } })
    const { deck, facts } = deckOf([ezuri], [ring, crypt])
    const v = validateDeck(deck, facts, rules)
    expect(v.map((x) => x.cards)).toEqual([['Sol Ring']])
  })

  it('"none" ignores every ban; "custom" uses only the group list', () => {
    const { deck, facts } = deckOf([ezuri], [ring, crypt])
    expect(validateDeck(deck, facts, withRules({ banlist: { source: 'none', extraBans: ['Sol Ring'] } }))).toEqual([])
    const custom = validateDeck(deck, facts, withRules({ banlist: { source: 'custom', extraBans: ['Sol Ring'] } }))
    expect(custom.map((x) => x.cards)).toEqual([['Sol Ring']])
  })

  it('each rule can block, warn or be off', () => {
    const bolt = card('Lightning Bolt', { typeLine: 'Instant', colorIdentity: ['R'] })
    const { deck, facts } = deckOf([ezuri], [bolt], 99)
    const levels: [Partial<DeckRules>, string[]][] = [
      [{}, ['size:block', 'colorIdentity:block']],
      [{ sizeLevel: 'warn', colorIdentity: 'warn' }, ['size:warn', 'colorIdentity:warn']],
      [{ sizeLevel: 'off', colorIdentity: 'off' }, []],
    ]
    for (const [patch, expected] of levels) {
      const v = validateDeck(deck, facts, withRules(patch))
      expect(rulesOf(v)).toEqual(expected)
      expect(blocks(v)).toBe(expected.some((e) => e.endsWith(':block')))
    }
  })
})

function deckArgs(commander: ReturnType<typeof card>) {
  const { deck, facts } = deckOf([commander], [])
  return [deck, facts, official()] as const
}

function pairArgs(a: ReturnType<typeof card>, b: ReturnType<typeof card>) {
  const { deck, facts } = deckOf([a, b], [])
  return [deck, facts, official()] as const
}
