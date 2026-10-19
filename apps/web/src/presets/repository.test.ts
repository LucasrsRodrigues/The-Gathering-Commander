import { officialPreset, type Preset } from '@gathering-hall/formats'
import { describe, expect, it } from 'vitest'
import { LocalPresetRepository } from './repository'

function memory(): Storage {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } as Storage
}

const friday: Preset = { id: 'sexta', name: 'Regras de sexta', base: officialPreset().base, ruleset: { startingLife: 30 } }

describe('LocalPresetRepository', () => {
  it('lists the official preset first and saves, gets and removes custom ones', () => {
    const repo = new LocalPresetRepository(memory())
    expect(repo.list().map((p) => p.id)).toEqual(['official'])
    repo.save(friday)
    expect(repo.list().map((p) => p.id)).toEqual(['official', 'sexta'])
    expect(repo.get('sexta')).toEqual(friday)
    expect(repo.get('missing').id).toBe('official')
    repo.remove('sexta')
    expect(repo.list()).toHaveLength(1)
  })

  it('never overwrites the official preset and ignores tampered storage', () => {
    const storage = memory()
    storage.setItem('gh-presets-v1', JSON.stringify(['{"kind":"gathering-hall/preset","v":1,"preset":{"id":"x","name":"X","base":{"formatId":"commander","version":"v"},"ruleset":{"startingLife":-5}}}', 42, 'junk']))
    const repo = new LocalPresetRepository(storage)
    expect(repo.list().map((p) => p.id)).toEqual(['official'])
    repo.save({ ...officialPreset(), name: 'Hack' })
    expect(repo.get('official').name).toBe('Commander oficial')
  })
})
