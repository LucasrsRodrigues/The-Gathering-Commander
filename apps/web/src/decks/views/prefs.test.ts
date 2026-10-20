import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, readPrefs } from './prefs'

describe('editor view preferences', () => {
  it('reads what was saved, and falls back to defaults for anything unknown or broken', () => {
    const store = (v: string | null) => ({ getItem: () => v })
    expect(readPrefs(store('{"view":"grid","groupBy":"category","sortBy":"name"}'))).toEqual({ view: 'grid', groupBy: 'category', sortBy: 'name' })
    expect(readPrefs(store('{"view":"3d","groupBy":"price"}'))).toEqual(DEFAULT_PREFS)
    expect(readPrefs(store('not json'))).toEqual(DEFAULT_PREFS)
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS)
    expect(readPrefs({ getItem: () => { throw new Error('blocked') } })).toEqual(DEFAULT_PREFS)
  })
})
