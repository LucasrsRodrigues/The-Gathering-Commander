import { describe, expect, it } from 'vitest'
import { historyByDay, summarize } from './historyView'

const DAY = 24 * 60 * 60 * 1000
const now = new Date(2026, 9, 19, 15, 0).getTime()
const line = (zone: 'commanders' | 'cards' | 'maybe', name: string, count = 1) => ({ zone, oracleId: name, name, count })

describe('history on screen', () => {
  it('sums up a change per list, additions first', () => {
    expect(summarize({ added: [line('cards', 'Sol Ring', 2), line('maybe', 'Rhystic Study')], removed: [line('cards', 'Mind Stone')] }))
      .toEqual(['+2 Sol Ring, −1 Mind Stone', 'Talvez: +1 Rhystic Study'])
  })

  it('groups by day, newest first, with Hoje and Ontem', () => {
    const history = [
      { at: now - 3 * DAY, added: [line('cards', 'A')], removed: [] },
      { at: now - DAY, added: [line('cards', 'B')], removed: [] },
      { at: now - 60_000, added: [line('cards', 'C')], removed: [] },
      { at: now, added: [], removed: [line('cards', 'C')] },
    ]
    const days = historyByDay(history, now, () => '16 de out.')
    expect(days.map((d) => [d.label, d.items.map((i) => i.index)])).toEqual([['Hoje', [3, 2]], ['Ontem', [1]], ['16 de out.', [0]]])
  })
})
