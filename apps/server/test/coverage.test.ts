import { describe, expect, it } from 'vitest'
import { formatReport, measureCoverage, normalizePhrase } from '../src/catalog/coverage'
import { diffCatalog } from '../src/catalog/diff'
import { normalizeCard, type BulkCard } from '../src/catalog/normalize'
import { CatalogStore } from '../src/catalog/store'
import { bulk, krenko, manaCrypt, rhystic, solRing } from './catalog.fixtures'
import { testDb } from './db.helpers'

const ranked = (card: BulkCard, rank?: number): BulkCard => ({ ...card, ...(rank ? { edhrec_rank: rank } : {}) })
const elves = bulk(7, 'Llanowar Elves', { type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}.', power: '1', toughness: '1' })
const bolt = bulk(8, 'Lightning Bolt', { type_line: 'Instant', oracle_text: 'Lightning Bolt deals 3 damage to any target.' })
const shock = bulk(9, 'Shock', { type_line: 'Instant', oracle_text: 'Shock deals 2 damage to any target.' })
const cards = [ranked(solRing, 1), ranked(rhystic, 2), ranked(bolt, 3), ranked(elves, 4), ranked(shock, 5), ranked(krenko, 6), ranked(manaCrypt)]

describe('coverage measurement (épico 11, T11.3)', () => {
  it('stores the Commander rank on import and reads the most played first', async () => {
    const store = new CatalogStore(await testDb())
    const records = cards.map((c) => normalizeCard(c)!)
    await store.apply(diffCatalog(await store.currentState(), records), records, '2026-10-20')
    const top = await store.mostPlayed(3)
    expect(top.map((t) => [t.rank, t.card.name])).toEqual([[1, 'Sol Ring'], [2, 'Rhystic Study'], [3, 'Lightning Bolt']])
    expect((await store.mostPlayed(100)).length).toBe(6) // no rank, not listed
    // the next import refreshes the rank
    const moved = [ranked(solRing, 40), ...cards.slice(1)].map((c) => normalizeCard(c)!)
    await store.apply(diffCatalog(await store.currentState(), moved), moved, '2026-10-21')
    expect((await store.mostPlayed(1))[0]!.card.name).toBe('Rhystic Study')
  })

  it('counts automated, partial and manual per top, and lists the most common manual sentences', () => {
    const report = measureCoverage(cards.flatMap((c) => {
      const r = normalizeCard(c)!
      return r.edhrecRank ? [{ rank: r.edhrecRank, card: r.card }] : []
    }), [3, 6])
    // Sol Ring, Llanowar Elves, Lightning Bolt and Shock are automated; the fixture text "Text." is manual.
    expect(report.rows).toEqual([
      { top: 3, cards: 3, automated: 2, partial: 0, manual: 1 },
      { top: 6, cards: 6, automated: 4, partial: 0, manual: 2 },
    ])
    expect(report.phrases[0]).toEqual({ phrase: 'Text.', cards: 2, example: 'Rhystic Study' })
    expect(formatReport(report)).toMatch(/top 6 \(6 cartas\): automáticas 4 \(66\.7%\)/)
  })

  it('normalizes phrases: name, numbers and generic mana', () => {
    expect(normalizePhrase('Krenko deals 3 damage to target creature. {2}{R}: draw two cards.', 'Krenko, Mob Boss'))
      .toBe('~ deals N damage to target creature. {N}{R}: draw N cards.')
  })
})
