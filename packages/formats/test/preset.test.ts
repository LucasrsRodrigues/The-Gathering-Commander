import { COMMANDER_RULESET } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { decodePreset, encodePreset, latestCommanderVersion, officialPreset, resolvePreset, type Preset } from '../src'

describe('resolvePreset', () => {
  it('the official preset resolves to official values', () => {
    const { ruleset, deckRules } = resolvePreset(officialPreset())
    expect(ruleset).toEqual(COMMANDER_RULESET)
    expect(deckRules).toEqual(latestCommanderVersion().deckRules)
  })

  it('overrides change only what they mention', () => {
    const friday: Preset = {
      id: 'sexta', name: 'Regras de sexta', base: officialPreset().base,
      ruleset: { startingLife: 30 },
      deckRules: { banlist: { extraBans: ['Sol Ring'] } },
    }
    const { ruleset, deckRules } = resolvePreset(friday)
    expect(ruleset).toEqual({ ...COMMANDER_RULESET, startingLife: 30 })
    expect(deckRules.banlist).toEqual({ source: 'official', extraBans: ['Sol Ring'], unbans: [], level: 'block' })
    expect(deckRules.deckSize).toBe(100)
  })

  it('unknown base versions fall back to the latest official version', () => {
    const p: Preset = { ...officialPreset(), base: { formatId: 'commander', version: '1999-01' } }
    expect(resolvePreset(p).ruleset.version).toBe(latestCommanderVersion().version)
  })
})

describe('preset codec', () => {
  const friday: Preset = {
    id: 'sexta', name: 'Regras de sexta', base: officialPreset().base,
    ruleset: { startingLife: 30, priorityMode: 'strict', restrictToController: true },
    deckRules: { colorIdentity: 'warn', banlist: { source: 'custom', extraBans: ['Sol Ring'], level: 'warn' } },
  }

  it('round-trips a preset', () => {
    expect(decodePreset(encodePreset(friday))).toEqual({ ok: true, preset: friday })
  })

  it('drops unknown keys', () => {
    const text = JSON.stringify({ kind: 'gathering-hall/preset', v: 1, preset: { ...friday, evil: '<script>', ruleset: { ...friday.ruleset, hack: 1 } } })
    const result = decodePreset(text)
    expect(result).toEqual({ ok: true, preset: friday })
  })

  it.each([
    ['not JSON', 'olá'],
    ['wrong marker', JSON.stringify({ kind: 'other', v: 1, preset: friday })],
    ['absurd life', JSON.stringify({ kind: 'gathering-hall/preset', v: 1, preset: { ...friday, ruleset: { startingLife: 1_000_000 } } })],
    ['wrong level', JSON.stringify({ kind: 'gathering-hall/preset', v: 1, preset: { ...friday, deckRules: { singleton: 'maybe' } } })],
    ['too many bans', JSON.stringify({ kind: 'gathering-hall/preset', v: 1, preset: { ...friday, deckRules: { banlist: { extraBans: Array(201).fill('x') } } } })],
    ['huge text', 'x'.repeat(10_001)],
    ['empty name', JSON.stringify({ kind: 'gathering-hall/preset', v: 1, preset: { ...friday, name: '  ' } })],
  ])('rejects %s', (_label, text) => {
    expect(decodePreset(text).ok).toBe(false)
  })
})
