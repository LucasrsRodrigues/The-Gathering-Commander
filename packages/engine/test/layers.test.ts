import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, type CardRef, type GameState, type OracleFacts } from '../src'
import { charsOf, colorsOfCost } from '../src/layers'
import { nextRandom } from '../src/rng'
import { keepAll } from './helpers'

const SRC = join(import.meta.dirname, '..', 'src')
const files = readdirSync(SRC, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, code: readFileSync(join(SRC, f), 'utf8') }))
// The reader and the characteristics themselves are the only places that look at the printed card.
const READERS = (name: string) => name === 'layers.ts' || name === 'cards.ts' || name === 'deriveRules.ts' || name.startsWith('oracle/')

describe('characteristics (épico 12, T12.1)', () => {
  it('fitness: no rule reads the printed types, keywords, P/T or colors; only layers.ts uses cards.ts', () => {
    for (const { name, code } of files) {
      if (READERS(name)) continue
      expect(/rules\??!?\.(types|subtypes|supertypes|keywords|power|toughness|colors)\b/.test(code), name).toBe(false)
      expect(/typesOf\(|from\s+['"](\.\.?\/)+cards['"]/.test(code), name).toBe(false)
    }
  })

  it('a card\'s color comes from its mana cost (CR 202.2), hybrid and Phyrexian symbols included', () => {
    const cost = (s: string) => deriveCardRules({ name: 'x', typeLine: 'Instant', manaCost: s, oracleText: '', keywords: [], colorIdentity: [] }).cost
    expect(colorsOfCost(cost('{2}{W}{U}'))).toEqual(['W', 'U'])
    expect(colorsOfCost(cost('{R/G}'))).toEqual(['R', 'G'])
    expect(colorsOfCost(cost('{1}{B/P}'))).toEqual(['B'])
    expect(colorsOfCost(cost('{3}'))).toEqual([])
    expect(colorsOfCost(null)).toEqual([])
  })

  // Real cards with types, keywords and P/T, spread on the battlefield with random counters and adjustments.
  const facts: OracleFacts[] = ['oracle.json', 'spells.json', 'etb.json', 'activated.json', 'counts.json', 'library.json']
    .flatMap((f) => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', f), 'utf8')) as OracleFacts[])
  const cards: CardRef[] = facts.map((f) => ({ name: f.name, typeLine: f.typeLine, rules: deriveCardRules(f) }))
  function board(seed: number, perPlayer: number): GameState {
    const deck = { commanders: [cards.find((c) => c.rules?.types.includes('creature'))!], cards: Array.from({ length: 99 }, (_, i) => cards[i % cards.length]!) }
    const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, name: id, deck }))
    const s = keepAll(createGame({ seed, startingPlayer: 'p1', players }))
    let r = seed
    const roll = (n: number) => {
      const [value, next] = nextRandom(r)
      r = next
      return Math.floor(value * n)
    }
    const objects = { ...s.objects }
    const battlefield: string[] = []
    for (const p of s.seats) {
      for (const id of s.zones[p]!.library.slice(0, perPlayer)) {
        objects[id] = {
          ...objects[id]!, zone: 'battlefield', counters: roll(3) ? {} : { '+1/+1': roll(4), '-1/-1': roll(2) },
          ptMods: roll(3) ? [] : [{ power: roll(5) - 2, toughness: roll(5) - 2 }],
        }
        battlefield.push(id)
      }
    }
    const zones = Object.fromEntries(s.seats.map((p) => [p, { ...s.zones[p]!, library: s.zones[p]!.library.slice(perPlayer) }]))
    return { ...s, objects, battlefield, zones }
  }

  it('property: without continuous effects, the characteristics are the printed card plus counters and adjustments', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = board(seed, 25)
      expect(s.battlefield.some((id) => s.objects[id]!.ptMods.length && Object.keys(s.objects[id]!.counters).length)).toBe(true) // the board is varied
      for (const id of s.battlefield) {
        const obj = s.objects[id]!
        const r = obj.card.rules!
        const delta = (obj.counters['+1/+1'] ?? 0) - (obj.counters['-1/-1'] ?? 0)
        const mods = obj.ptMods.reduce((n, m) => ({ p: n.p + m.power, t: n.t + m.toughness }), { p: 0, t: 0 })
        expect(charsOf(s, obj)).toEqual({
          types: r.types, subtypes: r.subtypes, supertypes: r.supertypes, colors: colorsOfCost(r.cost), keywords: r.keywords,
          power: (r.power ?? 0) + delta + mods.p, toughness: (r.toughness ?? 0) + delta + mods.t, controller: obj.controller, known: true,
          statics: r.statics ?? [], manaAbilities: r.manaAbilities,
        })
      }
    }
  })

  it('budget: every characteristic of 100 permanents in under 2 ms', () => {
    const s = board(7, 25)
    expect(s.battlefield).toHaveLength(100)
    for (const id of s.battlefield) charsOf(s, s.objects[id]!) // warm up
    const start = performance.now()
    const rounds = 50
    for (let i = 0; i < rounds; i++) for (const id of s.battlefield) charsOf(s, s.objects[id]!)
    expect((performance.now() - start) / rounds).toBeLessThan(2)
  })
})
