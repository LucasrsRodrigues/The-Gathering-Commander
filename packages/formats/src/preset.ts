import { makeRuleset } from '@gathering-hall/engine'
import { commanderVersion, latestCommanderVersion } from './format'
import type { Preset, ResolvedPreset } from './types'

export const OFFICIAL_PRESET_ID = 'official'

// The default preset: official Commander, latest version, no overrides.
export function officialPreset(): Preset {
  return { id: OFFICIAL_PRESET_ID, name: 'Commander oficial', base: { formatId: 'commander', version: latestCommanderVersion().version } }
}

// Official values for the preset's base version, with the group's overrides on top.
export function resolvePreset(preset: Preset): ResolvedPreset {
  const base = commanderVersion(preset.base.version) ?? latestCommanderVersion()
  const { banlist, ...deckOverrides } = preset.deckRules ?? {}
  return {
    ruleset: { ...makeRuleset(preset.ruleset ?? {}), version: base.version },
    deckRules: {
      ...base.deckRules,
      ...deckOverrides,
      banlist: { ...base.deckRules.banlist, ...banlist },
    },
  }
}
