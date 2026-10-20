import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SYMBOL_HOST } from '../catalog/hosts'
import { symbolUrl } from './manaSymbols'

describe('mana symbols', () => {
  it('maps the codes of rules text to Scryfall symbol files', () => {
    const base = `https://${SYMBOL_HOST}/card-symbols/`
    expect(symbolUrl('T')).toBe(`${base}T.svg`)
    expect(symbolUrl('g')).toBe(`${base}G.svg`)
    expect(symbolUrl('2')).toBe(`${base}2.svg`)
    expect(symbolUrl('W/U')).toBe(`${base}WU.svg`)
    expect(symbolUrl('2/W')).toBe(`${base}2W.svg`)
    expect(symbolUrl('G/P')).toBe(`${base}GP.svg`)
    expect(symbolUrl('½')).toBe(`${base}HALF.svg`)
  })

  it('anything else is not a symbol (stays as text, never becomes a URL)', () => {
    for (const bad of ['../x', 'GG', 'W/U/B', '<b>', 'http://evil', '100', '']) expect(symbolUrl(bad), bad).toBeNull()
  })

  it('the symbol host is allowed by the page CSP', () => {
    const html = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8')
    expect(html).toMatch(new RegExp(`img-src[^;]*https://${SYMBOL_HOST.replace(/\./g, '\\.')}`))
  })
})
