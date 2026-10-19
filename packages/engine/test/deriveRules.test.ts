import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveCardRules, parseManaCost, type OracleFacts } from '../src'

// Real Oracle text (Scryfall, oracle-cards) of popular Commander mana sources, creatures and spells.
const FIXTURE: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'oracle.json'), 'utf8'))
const rules = (name: string) => {
  const facts = FIXTURE.find((f) => f.name === name)
  if (!facts) throw new Error(`fixture sem ${name}`)
  return deriveCardRules(facts)
}
const produces = (name: string) => rules(name).manaAbilities.map((a) => a.produces)

describe('mana cost', () => {
  it('parses every symbol the engine understands', () => {
    expect(parseManaCost('{2}{G}{G}')).toEqual({ generic: 2, colored: { G: 2 }, hybrid: [], twoBrid: [], phyrexian: [], x: 0 })
    expect(parseManaCost('{X}{X}{R}{C}')).toMatchObject({ x: 2, colored: { R: 1, C: 1 } })
    expect(parseManaCost('{1}{G/W}{G/W}')).toMatchObject({ generic: 1, hybrid: [['G', 'W'], ['G', 'W']] })
    expect(parseManaCost('{2/W}{U/P}')).toMatchObject({ twoBrid: ['W'], phyrexian: ['U'] })
    expect(parseManaCost('')).toBeNull()
  })

  it('marks unknown symbols so the cost becomes manual', () => {
    expect(parseManaCost('{S}{G}')).toMatchObject({ unknown: true })
    expect(parseManaCost('{W/U/P}')).toMatchObject({ unknown: true })
  })
})

describe('mana abilities from Oracle text', () => {
  it('fixed, either-or and three-color sources', () => {
    expect(produces('Sol Ring')).toEqual([{ kind: 'fixed', mana: { C: 2 } }])
    expect(produces('Temple of Deceit')).toEqual([{ kind: 'oneOf', colors: ['U', 'B'] }])
    expect(produces('Noble Hierarch')).toEqual([{ kind: 'oneOf', colors: ['G', 'W', 'U'] }])
    expect(produces('Dimir Aqueduct')).toEqual([{ kind: 'fixed', mana: { U: 1, B: 1 } }])
  })

  it('any color, commander identity and "three mana of any one color"', () => {
    expect(produces('Command Tower')).toEqual([{ kind: 'commanderIdentity' }])
    expect(produces('Arcane Signet')).toEqual([{ kind: 'commanderIdentity' }])
    expect(produces('Birds of Paradise')).toEqual([{ kind: 'anyColor', amount: 1 }])
    expect(produces('Gilded Lotus')).toEqual([{ kind: 'anyColor', amount: 3 }])
  })

  it('extra costs and damage to yourself', () => {
    expect(rules('Dimir Signet').manaAbilities[0]).toMatchObject({ extraCost: { generic: 1 }, produces: { kind: 'fixed', mana: { U: 1, B: 1 } } })
    expect(rules('Caves of Koilos').manaAbilities).toEqual([
      { produces: { kind: 'fixed', mana: { C: 1 } } },
      { produces: { kind: 'oneOf', colors: ['W', 'B'] }, selfDamage: 1 },
    ])
    expect(rules('Talisman of Dominance').manaAbilities[1]).toMatchObject({ selfDamage: 1 })
    expect(rules('Ancient Tomb').manaAbilities).toEqual([{ produces: { kind: 'fixed', mana: { C: 2 } }, selfDamage: 2 }])
    expect(rules('City of Brass').manaAbilities).toEqual([{ produces: { kind: 'anyColor', amount: 1 }, selfDamage: 1 }])
    expect(rules('Mana Confluence').manaAbilities).toEqual([{ produces: { kind: 'anyColor', amount: 1 }, lifeCost: 1 }])
  })

  it('basic land types give intrinsic abilities (CR 305.6)', () => {
    expect(produces('Forest')).toEqual([{ kind: 'fixed', mana: { G: 1 } }])
    expect(produces('Watery Grave')).toEqual([{ kind: 'fixed', mana: { U: 1 } }, { kind: 'fixed', mana: { B: 1 } }])
    expect(produces('Indatha Triome')).toHaveLength(3)
    expect(produces('Dryad Arbor')).toEqual([{ kind: 'fixed', mana: { G: 1 } }])
    expect(produces('Wastes')).toEqual([{ kind: 'fixed', mana: { C: 1 } }])
  })

  it('a mana ability that also does something else is partial', () => {
    expect(rules('Path of Ancestry').manaAbilities).toEqual([{ produces: { kind: 'commanderIdentity' }, partial: true }])
  })

  it('unknown ways to add mana become declared mana, never wrong mana', () => {
    for (const name of ['Fellwar Stone', 'Exotic Orchard', 'Reflecting Pool', 'Bloom Tender', 'Selvala, Heart of the Wilds', 'Everflowing Chalice', 'Deathrite Shaman', 'Coldsteel Heart']) {
      expect(rules(name), name).toMatchObject({ manaAbilities: [], hasUnrecognizedMana: true })
    }
  })

  it('ignores abilities granted to other cards and triggered mana', () => {
    expect(rules('Chromatic Lantern')).toMatchObject({ manaAbilities: [{ produces: { kind: 'anyColor', amount: 1 } }] })
    expect(rules('Chromatic Lantern').hasUnrecognizedMana).toBeUndefined()
    expect(rules('Lotus Cobra')).toMatchObject({ manaAbilities: [] })
    expect(rules('Evolving Wilds')).toMatchObject({ manaAbilities: [] })
  })

  it('enters tapped only when unconditional', () => {
    expect(rules('Temple of Deceit').entersTapped).toBe(true)
    expect(rules('Worn Powerstone').entersTapped).toBe(true)
    expect(rules('Watery Grave').entersTapped).toBeUndefined()
    expect(rules('Command Tower').entersTapped).toBeUndefined()
  })

  it('rituals add mana when their whole text is "Add …"', () => {
    expect(rules('Dark Ritual').spellMana).toEqual({ B: 3 })
    expect(rules('Seething Song').spellMana).toEqual({ R: 5 })
    expect(rules('Cabal Ritual').spellMana).toBeUndefined()
    expect(rules('Rite of Flame').spellMana).toBeUndefined()
  })
})

describe('types, P/T and keywords', () => {
  it('reads types, supertypes and subtypes', () => {
    expect(rules('Krenko, Mob Boss')).toMatchObject({ types: ['creature'], supertypes: ['legendary'], subtypes: ['Goblin', 'Warrior'], power: 3, toughness: 3 })
    expect(rules('Ornithopter').types).toEqual(['creature', 'artifact'])
    expect(rules('Snow-Covered Forest').supertypes).toEqual(['basic', 'snow'])
    expect(rules('Ajani, Mentor of Heroes')).toMatchObject({ types: ['planeswalker'], loyalty: 4 })
  })

  it('variable P/T is flagged', () => {
    expect(rules('Tarmogoyf')).toMatchObject({ power: null, toughness: null, variablePT: true })
  })

  it("keywords come from the card's own keyword lines", () => {
    expect(rules('Baneslayer Angel').keywords).toEqual(['flying', 'firstStrike', 'lifelink'])
    expect(rules('Vampire Nighthawk').keywords).toEqual(['flying', 'deathtouch', 'lifelink'])
    expect(rules('Brazen Borrower // Petty Theft').keywords).toEqual(['flash', 'flying'])
    expect(rules('Questing Beast').keywords).toEqual(['haste', 'vigilance', 'deathtouch'])
  })

  it('ignores keywords the card only grants or gets conditionally', () => {
    expect(rules("Akroma's Memorial").keywords).toEqual([])
    expect(rules('Etali, Primal Conqueror // Etali, Primal Sickness').keywords).toEqual(['trample'])
    expect(rules('Invasion of Zendikar // Awakened Skyclave').keywords).toEqual([])
    expect(rules('Ice-Fang Coatl').keywords).toEqual(['flash', 'flying'])
    expect(rules('Gisela, Blade of Goldnight').keywords).toEqual(['flying', 'firstStrike'])
  })

  it('every fixture card derives plain JSON rules', () => {
    for (const facts of FIXTURE) {
      const r = deriveCardRules(facts)
      expect(JSON.parse(JSON.stringify(r)), facts.name).toEqual(r)
    }
  })
})
