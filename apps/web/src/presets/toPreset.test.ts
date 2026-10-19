import { officialPreset, resolvePreset, type Preset } from '@gathering-hall/formats'
import { describe, expect, it } from 'vitest'
import { toPreset } from './toPreset'

const base: Preset = { id: 'g', name: 'Grupo', base: officialPreset().base }

describe('toPreset', () => {
  it('official values produce an empty diff', () => {
    expect(toPreset(base, resolvePreset(officialPreset()))).toEqual(base)
  })

  it('keeps only what changed, and resolves back to the edited values', () => {
    const edited = resolvePreset(officialPreset())
    edited.ruleset = { ...edited.ruleset, startingLife: 30, priorityMode: 'strict' }
    edited.deckRules = { ...edited.deckRules, colorIdentity: 'warn', banlist: { ...edited.deckRules.banlist, extraBans: ['Sol Ring'] } }
    const preset = toPreset(base, edited)
    expect(preset).toEqual({
      ...base,
      ruleset: { startingLife: 30, priorityMode: 'strict' },
      deckRules: { colorIdentity: 'warn', banlist: { extraBans: ['Sol Ring'] } },
    })
    expect(resolvePreset(preset)).toEqual(edited)
  })
})
