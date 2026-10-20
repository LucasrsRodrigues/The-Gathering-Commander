// Deck history (épico 10, req. 16–18): what came in and what went out, per list, kept inside the deck document so it
// syncs with it. Pure functions. Only card changes are recorded (not names, tags, printings or descriptions).
//
// Edits a few minutes apart become one entry, and a card that came in and went out within it cancels out. Looking at
// an older version means undoing the entries from the newest back; restoring records the result as a new entry.

import { DECK_LIMITS, DECK_ZONES, type ChangeLine, type Deck, type DeckCard, type DeckChange, type DeckZone } from './deckDocument'

export const MERGE_WINDOW_MS = 10 * 60 * 1000
export const MAX_HISTORY_BYTES = 64 * 1024 // the history's share of a deck document; the oldest entries go first

export interface Delta {
  added: ChangeLine[]
  removed: ChangeLine[]
}

const key = (zone: DeckZone, oracleId: string) => `${zone}\u0000${oracleId}`

function counts(deck: Deck): Map<string, { zone: DeckZone; oracleId: string; name: string; count: number }> {
  const out = new Map<string, { zone: DeckZone; oracleId: string; name: string; count: number }>()
  for (const zone of DECK_ZONES) {
    for (const c of deck[zone]) {
      const k = key(zone, c.oracleId)
      const prev = out.get(k)
      out.set(k, { zone, oracleId: c.oracleId, name: c.name, count: (prev?.count ?? 0) + c.count })
    }
  }
  return out
}

// Net change between two versions of the same deck.
export function diff(before: Deck, after: Deck): Delta {
  const a = counts(before)
  const b = counts(after)
  const delta: Delta = { added: [], removed: [] }
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const was = a.get(k)
    const now = b.get(k)
    const n = (now?.count ?? 0) - (was?.count ?? 0)
    const ref = (now ?? was)!
    if (n > 0) delta.added.push({ zone: ref.zone, oracleId: ref.oracleId, name: ref.name, count: n })
    if (n < 0) delta.removed.push({ zone: ref.zone, oracleId: ref.oracleId, name: ref.name, count: -n })
  }
  return delta
}

// Adds two deltas, cancelling what came in and went out.
function combine(first: Delta, second: Delta): Delta {
  const net = new Map<string, { line: ChangeLine; n: number }>()
  const add = (lines: ChangeLine[], sign: number) => {
    for (const l of lines) {
      const k = key(l.zone, l.oracleId)
      const entry = net.get(k) ?? { line: l, n: 0 }
      net.set(k, { line: { ...entry.line, name: l.name }, n: entry.n + sign * l.count })
    }
  }
  add(first.added, 1)
  add(first.removed, -1)
  add(second.added, 1)
  add(second.removed, -1)
  const delta: Delta = { added: [], removed: [] }
  for (const { line, n } of net.values()) {
    if (n > 0) delta.added.push({ ...line, count: n })
    if (n < 0) delta.removed.push({ ...line, count: -n })
  }
  return delta
}

const empty = (d: Delta) => d.added.length === 0 && d.removed.length === 0

function bounded(history: DeckChange[]): DeckChange[] {
  let out = history.slice(-DECK_LIMITS.history)
  // Always keep the newest entry; drop the oldest while the history is too big for the document.
  while (out.length > 1 && JSON.stringify(out).length > MAX_HISTORY_BYTES) out = out.slice(1)
  return out
}

// Records a delta in the deck's history. merge: false starts a new entry even inside the window (restores).
export function record(deck: Deck, delta: Delta, now: number, merge = true): Deck {
  if (empty(delta)) return deck
  const last = deck.history[deck.history.length - 1]
  if (merge && last && now - last.at < MERGE_WINDOW_MS && now >= last.at) {
    const joined = combine(last, delta)
    const history = deck.history.slice(0, -1)
    return { ...deck, history: bounded(empty(joined) ? history : [...history, { at: now, ...joined }]) }
  }
  return { ...deck, history: bounded([...deck.history, { at: now, ...delta }]) }
}

// `after` is `before` edited: records what changed in its cards.
export function withChange(before: Deck, after: Deck, now: number, merge = true): Deck {
  return record(after, diff(before, after), now, merge)
}

function adjust(list: DeckCard[], line: ChangeLine, n: number): DeckCard[] {
  const existing = list.find((c) => c.oracleId === line.oracleId)
  if (n > 0) {
    return existing ? list.map((c) => (c === existing ? { ...c, count: c.count + n } : c)) : [...list, { oracleId: line.oracleId, name: line.name, count: n }]
  }
  if (!existing) return list
  const left = existing.count + n
  return left > 0 ? list.map((c) => (c === existing ? { ...c, count: left } : c)) : list.filter((c) => c !== existing)
}

// Applies a delta forward (sign 1) or backward (sign -1) to the deck's lists; history untouched.
function apply(deck: Deck, delta: Delta, sign: 1 | -1): Deck {
  const lists: Record<DeckZone, DeckCard[]> = { commanders: deck.commanders, cards: deck.cards, maybe: deck.maybe }
  for (const l of delta.added) lists[l.zone] = adjust(lists[l.zone], l, sign * l.count)
  for (const l of delta.removed) lists[l.zone] = adjust(lists[l.zone], l, -sign * l.count)
  return { ...deck, ...lists }
}

export const applyForward = (deck: Deck, delta: Delta): Deck => apply(deck, delta, 1)
export const applyBackward = (deck: Deck, delta: Delta): Deck => apply(deck, delta, -1)

// The deck right after history[index] (index -1 = before the oldest entry kept). Only its lists change; a card
// brought back by undoing comes without the categories and printing it had.
export function versionAt(deck: Deck, index: number): Deck {
  let out = deck
  for (let i = deck.history.length - 1; i > index; i--) out = applyBackward(out, deck.history[i]!)
  return out
}

// Brings the lists back to how they were after history[index], as a new entry (which can itself be undone).
// Cards that are still in the deck keep their categories and printing.
export function restore(deck: Deck, index: number, now: number): Deck {
  const target = versionAt(deck, index)
  const keep = (list: DeckCard[], zone: DeckZone) => list.map((c) => {
    const current = deck[zone].find((x) => x.oracleId === c.oracleId) ?? DECK_ZONES.flatMap((z) => deck[z]).find((x) => x.oracleId === c.oracleId)
    return current ? { ...current, count: c.count } : c
  })
  const next: Deck = {
    ...deck,
    commanders: keep(target.commanders, 'commanders'), cards: keep(target.cards, 'cards'), maybe: keep(target.maybe, 'maybe'),
    updatedAt: now,
  }
  return withChange(deck, next, now, false)
}
