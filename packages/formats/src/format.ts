// Official Commander format, as data. A new official change = a new version entry, never an edit in place.

import { COMMANDER_RULESET } from '@gathering-hall/engine'
import type { DeckRules } from './types'

export interface FormatVersion {
  formatId: 'commander'
  version: string
  effective: string // ISO date
  deckRules: DeckRules
}

export const COMMANDER_VERSIONS: readonly FormatVersion[] = [
  {
    formatId: 'commander',
    version: COMMANDER_RULESET.version,
    effective: '2026-10-01',
    deckRules: {
      deckSize: 100, // CR 903.5a
      sizeLevel: 'block',
      singleton: 'block', // CR 903.5b
      colorIdentity: 'block', // CR 903.5c
      commanderEligibility: 'block', // CR 903.3
      pairing: 'block', // CR 702.124 and related
      banlist: { source: 'official', extraBans: [], unbans: [], level: 'block' },
    },
  },
]

export function latestCommanderVersion(): FormatVersion {
  return COMMANDER_VERSIONS[COMMANDER_VERSIONS.length - 1]!
}

export function commanderVersion(version: string): FormatVersion | undefined {
  return COMMANDER_VERSIONS.find((v) => v.version === version)
}
