import { describe, expect, it } from 'vitest'
import { diffCatalog, isEmpty, type CurrentState } from '../src/catalog/diff'
import { normalizeCard, type CatalogRecord } from '../src/catalog/normalize'
import { artSeries, dfc, krenko, manaCrypt, rhystic, solRing } from './catalog.fixtures'

const norm = (c: Parameters<typeof normalizeCard>[0]) => normalizeCard(c)!
const stateOf = (recs: CatalogRecord[]) => new Map<string, CurrentState>(recs.map((r) => [r.oracleId, { hash: r.hash, legal: r.legal, gameChanger: r.gameChanger }]))

describe('normalizeCard', () => {
  it('keeps playable cards and drops art series, tokens and the like', () => {
    expect(normalizeCard(artSeries)).toBeNull()
    expect(normalizeCard({ ...solRing, layout: 'token' })).toBeNull()
    expect(norm(rhystic)).toMatchObject({ name: 'Rhystic Study', legal: 'legal', gameChanger: true })
  })

  it('reads multi-face cards (oracle id and front name from the first face)', () => {
    const r = norm(dfc)
    expect(r.oracleId).toBe(dfc.card_faces![0]!.oracle_id)
    expect(r.frontName).toBe('Front Face')
    expect(r.card.card_faces).toHaveLength(2)
  })

  it('hashes rules fields only: new art or price does not change the hash, errata does', () => {
    const base = norm(solRing)
    expect(norm({ ...solRing, id: '00000000-0000-4000-8000-999999999999', image_uris: { small: 'x' } }).hash).toBe(base.hash)
    expect(norm({ ...solRing, oracle_text: '{T}: Add {C}{C}{C}.' }).hash).not.toBe(base.hash)
    expect(norm({ ...krenko, power: '4' }).hash).not.toBe(norm(krenko).hash)
  })
})

describe('diffCatalog', () => {
  const day1 = [solRing, manaCrypt, rhystic].map(norm)

  it('first import opens a version and a legality interval for every card', () => {
    const d = diffCatalog(new Map(), day1)
    expect(d.newVersions).toHaveLength(3)
    expect(d.closedVersions).toEqual([])
    expect(d.legalityChanges.map((c) => c.to)).toEqual(['legal', 'banned', 'legal'])
    expect(d.gameChangerChanges).toEqual([{ oracleId: day1[2]!.oracleId, to: true }])
  })

  it('the same import twice changes nothing (idempotent)', () => {
    expect(isEmpty(diffCatalog(stateOf(day1), day1))).toBe(true)
  })

  it('errata closes the old version and opens a new one; bans and Game Changer changes are tracked separately', () => {
    const day2 = [
      norm({ ...solRing, oracle_text: '{T}: Add {C}{C}. (errata)' }),
      norm({ ...manaCrypt, legalities: { commander: 'legal' } }),
      norm({ ...rhystic, game_changer: false }),
    ]
    const d = diffCatalog(stateOf(day1), day2)
    expect(d.closedVersions).toEqual([day1[0]!.oracleId])
    expect(d.newVersions.map((r) => r.name)).toEqual(['Sol Ring'])
    expect(d.legalityChanges).toEqual([{ oracleId: day1[1]!.oracleId, from: 'banned', to: 'legal' }])
    expect(d.gameChangerChanges).toEqual([{ oracleId: day1[2]!.oracleId, to: false }])
  })

  it('cards missing from an import are left untouched', () => {
    expect(isEmpty(diffCatalog(stateOf(day1), [day1[0]!]))).toBe(true)
  })
})
