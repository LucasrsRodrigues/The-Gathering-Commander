// Pure diff between what the catalog knows today and a new bulk import. Every tracked dimension
// (rules text, Commander legality, Game Changer) gets its own validity intervals: a change closes the
// current interval and opens a new one on the import date. Cards absent from an import are left as they are.

import type { CatalogRecord, Legality } from './normalize'

export interface CurrentState {
  hash: string
  legal: Legality
  gameChanger: boolean
}

export interface CatalogDiff {
  newVersions: CatalogRecord[] // open a rules version (new card or changed rules text)
  closedVersions: string[] // oracle ids whose open rules version ends on this date
  legalityChanges: { oracleId: string; from: Legality | null; to: Legality }[]
  gameChangerChanges: { oracleId: string; to: boolean }[]
}

export function diffCatalog(current: ReadonlyMap<string, CurrentState>, incoming: Iterable<CatalogRecord>): CatalogDiff {
  const diff: CatalogDiff = { newVersions: [], closedVersions: [], legalityChanges: [], gameChangerChanges: [] }
  const seen = new Set<string>()
  for (const rec of incoming) {
    if (seen.has(rec.oracleId)) continue // one record per oracle id per import
    seen.add(rec.oracleId)
    const now = current.get(rec.oracleId)
    if (!now) {
      diff.newVersions.push(rec)
      diff.legalityChanges.push({ oracleId: rec.oracleId, from: null, to: rec.legal })
      if (rec.gameChanger) diff.gameChangerChanges.push({ oracleId: rec.oracleId, to: true })
      continue
    }
    if (now.hash !== rec.hash) {
      diff.closedVersions.push(rec.oracleId)
      diff.newVersions.push(rec)
    }
    if (now.legal !== rec.legal) diff.legalityChanges.push({ oracleId: rec.oracleId, from: now.legal, to: rec.legal })
    if (now.gameChanger !== rec.gameChanger) diff.gameChangerChanges.push({ oracleId: rec.oracleId, to: rec.gameChanger })
  }
  return diff
}

export function isEmpty(diff: CatalogDiff): boolean {
  return !diff.newVersions.length && !diff.closedVersions.length && !diff.legalityChanges.length && !diff.gameChangerChanges.length
}
