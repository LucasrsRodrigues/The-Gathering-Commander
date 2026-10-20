import { describe, expect, it } from 'vitest'
import { DECK_LIMITS, type Deck, type DeckCard, type DeckZone } from '../src/deckDocument'
import { applyForward, diff, MAX_HISTORY_BYTES, MERGE_WINDOW_MS, record, restore, versionAt, withChange } from '../src/deckHistory'

const MIN = 60_000
const empty = (): Deck => ({ schemaVersion: 2, id: 'd', name: 'D', commanders: [], cards: [], maybe: [], history: [], createdAt: 0, updatedAt: 0 })

// A tiny editor: the same operations the app does, each recorded at `now`.
function edit(deck: Deck, zone: DeckZone, oracleId: string, n: number, now: number): Deck {
  const list = deck[zone]
  const existing = list.find((c) => c.oracleId === oracleId)
  let next: DeckCard[]
  if (n > 0) next = existing ? list.map((c) => (c === existing ? { ...c, count: c.count + n } : c)) : [...list, { oracleId, name: `Carta ${oracleId}`, count: n }]
  else next = list.flatMap((c) => (c !== existing ? [c] : c.count + n > 0 ? [{ ...c, count: c.count + n }] : []))
  return withChange(deck, { ...deck, [zone]: next, updatedAt: now }, now)
}

// Lists compared by content (order inside a list does not matter; tags and printings are not history).
const lists = (d: Deck) => Object.fromEntries((['commanders', 'cards', 'maybe'] as const).map((z) => [z, d[z].map((c) => `${c.oracleId}x${c.count}`).sort()]))

describe('deck history', () => {
  it('records what came in and went out, per list', () => {
    let d = edit(empty(), 'cards', 'sol', 1, 0)
    d = edit(d, 'maybe', 'rhystic', 1, 20 * MIN)
    expect(d.history).toEqual([
      { at: 0, added: [{ zone: 'cards', oracleId: 'sol', name: 'Carta sol', count: 1 }], removed: [] },
      { at: 20 * MIN, added: [{ zone: 'maybe', oracleId: 'rhystic', name: 'Carta rhystic', count: 1 }], removed: [] },
    ])
  })

  it('joins edits a few minutes apart, and a card that came and went cancels out', () => {
    let d = edit(empty(), 'cards', 'sol', 1, 0)
    d = edit(d, 'cards', 'bolt', 1, 2 * MIN)
    d = edit(d, 'cards', 'bolt', -1, 4 * MIN)
    expect(d.history).toHaveLength(1)
    expect(d.history[0]).toMatchObject({ at: 4 * MIN, added: [{ oracleId: 'sol', count: 1 }], removed: [] })
    const later = edit(d, 'cards', 'sol', -1, 4 * MIN + MERGE_WINDOW_MS - 1)
    expect(later.history).toEqual([]) // everything cancelled
  })

  it('fitness: undoing every change and reapplying them gives the current deck back', () => {
    let seed = 11
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const zones: DeckZone[] = ['commanders', 'cards', 'maybe']
    let d = empty()
    for (let step = 0; step < 300; step++) {
      const zone = zones[Math.floor(rand() * 3)]!
      const id = `c${Math.floor(rand() * 12)}`
      const n = rand() < 0.6 ? 1 + Math.floor(rand() * 3) : -(1 + Math.floor(rand() * 3))
      d = edit(d, zone, id, n, step * 3 * MIN) // some edits merge, some do not
    }
    const start = versionAt(d, -1)
    expect(lists(d.history.reduce(applyForward, start))).toEqual(lists(d))
    for (let i = 0; i < d.history.length; i++) {
      // every intermediate version, taken forward from the start, matches the one taken backward from the end
      expect(lists(d.history.slice(0, i + 1).reduce(applyForward, start))).toEqual(lists(versionAt(d, i)))
    }
  })

  it('keeps at most 50 entries and drops the oldest first', () => {
    let d = empty()
    for (let i = 0; i < 70; i++) d = edit(d, 'cards', `c${i}`, 1, i * 20 * MIN)
    expect(d.history).toHaveLength(DECK_LIMITS.history)
    expect(d.history[0]!.added[0]!.oracleId).toBe('c20')
  })

  it('keeps the history within its share of the document, always with the newest entry', () => {
    let d = empty()
    for (let i = 0; i < 40; i++) {
      const many = Array.from({ length: 30 }, (_, k) => ({ zone: 'cards' as const, oracleId: `o${i}-${k}`, name: 'N'.repeat(150), count: 1 }))
      d = record(d, { added: many, removed: [] }, i * 20 * MIN)
    }
    expect(JSON.stringify(d.history).length).toBeLessThanOrEqual(MAX_HISTORY_BYTES)
    expect(d.history.at(-1)!.at).toBe(39 * 20 * MIN)
  })

  it('shows an old version without changing the deck, and restoring is a new change that can be undone', () => {
    let d = edit(empty(), 'cards', 'sol', 1, 0)
    d = { ...d, cards: d.cards.map((c) => ({ ...c, tags: ['Ramp'], scryfallId: 'art' })) } // categories are not history
    d = edit(d, 'cards', 'bolt', 1, 20 * MIN)
    d = edit(d, 'cards', 'sol', -1, 40 * MIN)
    const old = versionAt(d, 0)
    expect(lists(old).cards).toEqual(['solx1'])
    expect(lists(d).cards).toEqual(['boltx1'])

    const restored = restore(d, 0, 41 * MIN) // within the merge window, still a separate entry
    expect(lists(restored).cards).toEqual(['solx1'])
    expect(restored.history).toHaveLength(d.history.length + 1)
    const undone = restore(restored, restored.history.length - 2, 42 * MIN)
    expect(lists(undone)).toEqual(lists(d))
  })

  it('a restored card that is still elsewhere in the deck keeps its categories and printing', () => {
    let d = edit(empty(), 'cards', 'sol', 1, 0)
    d = { ...d, cards: [{ ...d.cards[0]!, tags: ['Ramp'], scryfallId: 'art' }] }
    d = withChange(d, { ...d, cards: [], maybe: [{ ...d.cards[0]! }] }, 20 * MIN) // moved to Talvez
    const back = restore(d, 0, 40 * MIN)
    expect(back.cards).toEqual([{ oracleId: 'sol', name: 'Carta sol', count: 1, tags: ['Ramp'], scryfallId: 'art' }])
    expect(back.maybe).toEqual([])
  })

  it('diff ignores names, tags and printings', () => {
    const a = edit(empty(), 'cards', 'sol', 1, 0)
    const b = { ...a, name: 'Outro', cards: a.cards.map((c) => ({ ...c, tags: ['X'], scryfallId: 'y' })) }
    expect(diff(a, b)).toEqual({ added: [], removed: [] })
  })
})
