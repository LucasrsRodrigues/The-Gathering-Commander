import { afterEach, describe, expect, it } from 'vitest'
import { diffCatalog } from '../src/catalog/diff'
import { normalizeCard, type BulkCard } from '../src/catalog/normalize'
import { SqliteCatalogStore } from '../src/catalog/store'
import { dfc, krenko, manaCrypt, rhystic, solRing } from './catalog.fixtures'

let store: SqliteCatalogStore
afterEach(() => store?.close())

function importDay(cards: BulkCard[], date: string) {
  const records = cards.map((c) => normalizeCard(c)!).filter(Boolean)
  return store.apply(diffCatalog(store.currentState(), records), records, date)
}

describe('SqliteCatalogStore', () => {
  it('resolves names (full and front face) to the current card', () => {
    store = new SqliteCatalogStore(':memory:')
    importDay([solRing, krenko, dfc], '2026-10-01')
    const found = store.resolveNames(['sol ring', 'Krenko,  Mob Boss', 'Front Face', 'Nope'])
    expect([...found.keys()]).toEqual(['sol ring', 'krenko, mob boss', 'front face'])
    expect(found.get('krenko, mob boss')?.color_identity).toEqual(['R'])
  })

  it('answers "how was this card on date D" across errata', () => {
    store = new SqliteCatalogStore(':memory:')
    importDay([solRing], '2026-10-01')
    importDay([{ ...solRing, oracle_text: 'New text.' }], '2026-11-15')
    const id = normalizeCard(solRing)!.oracleId
    expect(store.oracleAt(id, '2026-10-20')?.oracle_text).toBe('{T}: Add {C}{C}.')
    expect(store.oracleAt(id, '2026-11-15')?.oracle_text).toBe('New text.')
    expect(store.oracleAt(id, '2026-09-01')).toBeNull()
  })

  it('answers "which cards were banned / Game Changers on date D"', () => {
    store = new SqliteCatalogStore(':memory:')
    importDay([solRing, manaCrypt, rhystic], '2026-10-01')
    importDay([{ ...manaCrypt, legalities: { commander: 'legal' } }, { ...solRing, legalities: { commander: 'banned' } }, rhystic], '2026-12-01')
    expect(store.commanderAt('2026-10-15').banned.map((c) => c.name)).toEqual(['Mana Crypt'])
    expect(store.commanderAt('2026-12-01').banned.map((c) => c.name)).toEqual(['Sol Ring'])
    expect(store.commanderAt('2026-12-01').gameChangers.map((c) => c.name)).toEqual(['Rhystic Study'])
  })

  it('re-importing the same data is a no-op', () => {
    store = new SqliteCatalogStore(':memory:')
    expect(importDay([solRing, rhystic], '2026-10-01')).toBeGreaterThan(0)
    expect(importDay([solRing, rhystic], '2026-10-02')).toBe(0)
  })

  it('seeds dated history from before the first import, clipped and idempotent', () => {
    store = new SqliteCatalogStore(':memory:')
    importDay([solRing, manaCrypt], '2026-10-01')
    const entries = [
      { name: 'Mana Crypt', kind: 'banned' as const, from: '2024-09-23', source: 'https://example/ann' },
      { name: 'Unknown Card', kind: 'banned' as const, from: '2024-09-23', source: 'https://example/ann' },
      { name: 'Sol Ring', kind: 'banned' as const, from: '2027-01-01', source: 'https://example/future' },
    ]
    expect(store.seedHistory(entries)).toEqual({ applied: 1, unknown: ['Unknown Card'] })
    expect(store.seedHistory(entries).applied).toBe(0)
    expect(store.commanderAt('2025-01-01').banned.map((c) => c.name)).toEqual(['Mana Crypt'])
    expect(store.commanderAt('2024-01-01').banned).toEqual([])
  })

  it('rolls back a failed import entirely', () => {
    store = new SqliteCatalogStore(':memory:')
    importDay([solRing], '2026-10-01')
    const rec = normalizeCard({ ...solRing, oracle_text: 'changed' })!
    const diff = diffCatalog(store.currentState(), [rec])
    // A version without hash violates NOT NULL in the middle of the transaction (after the close ran).
    const broken = { ...diff, newVersions: [{ ...rec, hash: null as never }] }
    expect(() => store.apply(broken, [rec], '2026-10-05')).toThrow()
    expect(store.oracleAt(rec.oracleId, '2026-10-10')?.oracle_text).toBe('{T}: Add {C}{C}.')
  })
})
