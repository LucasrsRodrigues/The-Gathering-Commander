import { officialPreset, resolvePreset, type DeckRules, type Preset, type ResolvedPreset } from '@gathering-hall/formats'

type Ruleset = ResolvedPreset['ruleset']

// Keeps only what differs from the official values, so presets stay small and follow future official updates.
export function toPreset(base: Preset, values: ResolvedPreset): Preset {
  const official = resolvePreset(officialPreset())
  const ruleset: NonNullable<Preset['ruleset']> = {}
  for (const key of Object.keys(values.ruleset) as (keyof Ruleset)[]) {
    if (key !== 'id' && key !== 'version' && values.ruleset[key] !== official.ruleset[key]) (ruleset as Record<string, unknown>)[key] = values.ruleset[key]
  }
  const { banlist, ...rest } = values.deckRules
  const deckRules: NonNullable<Preset['deckRules']> = {}
  for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
    if (rest[key] !== official.deckRules[key]) (deckRules as Record<string, unknown>)[key] = rest[key]
  }
  const ob = official.deckRules.banlist
  const bl: Partial<DeckRules['banlist']> = {}
  if (banlist.source !== ob.source) bl.source = banlist.source
  if (banlist.level !== ob.level) bl.level = banlist.level
  if (banlist.extraBans.length) bl.extraBans = banlist.extraBans
  if (banlist.unbans.length) bl.unbans = banlist.unbans
  if (banlist.asOf) bl.asOf = banlist.asOf
  if (Object.keys(bl).length) deckRules.banlist = bl
  return {
    id: base.id, name: base.name, base: base.base,
    ...(Object.keys(ruleset).length ? { ruleset } : {}),
    ...(Object.keys(deckRules).length ? { deckRules } : {}),
  }
}

