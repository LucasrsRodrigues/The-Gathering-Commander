import { describe, expect, it } from 'vitest'
import { effectiveQuery } from './searchQuery'

describe('effectiveQuery', () => {
  it('looks for commanders while the deck has none', () => {
    expect(effectiveQuery(' krenko ', true, null, true)).toBe('krenko is:commander')
  })
  it('limits to the commander color identity unless turned off', () => {
    expect(effectiveQuery('t:creature', false, ['R', 'G'], true)).toBe('t:creature id<=RG')
    expect(effectiveQuery('sol ring', false, [], true)).toBe('sol ring id<=c')
    expect(effectiveQuery('sol ring', false, ['R'], false)).toBe('sol ring')
  })
  it('empty text means no search', () => {
    expect(effectiveQuery('   ', false, ['R'], true)).toBe('')
  })
})
