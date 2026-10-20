// How the history reads on screen (épico 10, req. 16–18): entries newest first, grouped by day, each summed up as
// "+2 Sol Ring, −1 Mind Stone" per list. Pure.

import type { ChangeLine, DeckChange } from '@gathering-hall/formats'

const ZONE_PREFIX = { commanders: 'Comandante: ', cards: '', maybe: 'Talvez: ' } as const

export interface HistoryItem {
  index: number // position in deck.history
  at: number
  lines: string[] // one per list touched
}

export interface HistoryDay {
  day: string // yyyy-mm-dd in local time
  label: string
  items: HistoryItem[]
}

function part(lines: ChangeLine[], sign: '+' | '−') {
  return lines.map((l) => `${sign}${l.count} ${l.name}`)
}

export function summarize(change: Pick<DeckChange, 'added' | 'removed'>): string[] {
  const out: string[] = []
  for (const zone of ['commanders', 'cards', 'maybe'] as const) {
    const items = [...part(change.added.filter((l) => l.zone === zone), '+'), ...part(change.removed.filter((l) => l.zone === zone), '−')]
    if (items.length) out.push(`${ZONE_PREFIX[zone]}${items.join(', ')}`)
  }
  return out
}

const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function historyByDay(history: readonly DeckChange[], now: number, format: (t: number) => string): HistoryDay[] {
  const days = new Map<string, HistoryDay>()
  const today = dayKey(now)
  const yesterday = dayKey(now - 24 * 60 * 60 * 1000)
  for (let i = history.length - 1; i >= 0; i--) {
    const change = history[i]!
    const key = dayKey(change.at)
    const label = key === today ? 'Hoje' : key === yesterday ? 'Ontem' : format(change.at)
    const day = days.get(key) ?? { day: key, label, items: [] }
    day.items.push({ index: i, at: change.at, lines: summarize(change) })
    days.set(key, day)
  }
  return [...days.values()]
}
