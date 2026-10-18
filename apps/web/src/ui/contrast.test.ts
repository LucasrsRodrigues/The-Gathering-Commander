/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// WCAG 2.2 AA guard for the design tokens in index.css: text needs 4.5:1 (1.4.3), control borders
// and the focus ring need 3:1 (1.4.11). Translucent tokens are blended over the surface first.

type RGB = [number, number, number]

function tokens(source: string): Record<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(source)?.[1] ?? ''
  return Object.fromEntries([...root.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

function parse(color: string, under?: RGB): RGB {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as RGB
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(color)
  if (!rgb) throw new Error(`cor não suportada: ${color}`)
  const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number) as RGB
  const a = rgb[4] === undefined ? 1 : Number(rgb[4])
  if (a < 1 && !under) throw new Error(`cor translúcida sem fundo: ${color}`)
  return a < 1 ? ([r, g, b].map((c, i) => c * a + under![i]! * (1 - a)) as RGB) : [r, g, b]
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// Read from disk: Vitest turns CSS imports (even ?raw) into empty modules.
const t = tokens(readFileSync(new URL('../index.css', import.meta.url), 'utf8'))
const SURFACES = ['bg', 'surface-solid', 'surface-hi']

describe('design tokens contrast (WCAG AA)', () => {
  it('reads the tokens from index.css', () => {
    expect(Object.keys(t)).toEqual(expect.arrayContaining(['text', 'muted', 'gold', 'gold-ink', 'control-border', ...SURFACES]))
  })

  for (const fg of ['text', 'muted', 'gold', 'danger', 'ok']) {
    for (const bg of SURFACES) {
      it(`--${fg} on --${bg} ≥ 4.5:1`, () => {
        expect(ratio(parse(t[fg]!), parse(t[bg]!))).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('--gold-ink on --gold ≥ 4.5:1 (primary buttons, current phase)', () => {
    expect(ratio(parse(t['gold-ink']!), parse(t.gold!))).toBeGreaterThanOrEqual(4.5)
  })

  for (const bg of SURFACES) {
    it(`control border and focus ring on --${bg} ≥ 3:1`, () => {
      const surface = parse(t[bg]!)
      expect(ratio(parse(t['control-border']!, surface), surface)).toBeGreaterThanOrEqual(3)
      expect(ratio(parse(t.gold!), surface)).toBeGreaterThanOrEqual(3)
    })
  }
})
