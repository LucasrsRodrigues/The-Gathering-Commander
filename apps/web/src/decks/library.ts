// The deck library (épico 10, req. 19–21): folders, search and sorting. Pure. A folder is just a field of the deck
// (it syncs with it); a folder with no deck yet lives only in this browser (emptyFolders) until a deck goes in.

import type { Color } from '@gathering-hall/formats'
import { DECK_LIMITS } from '@gathering-hall/formats'
import type { Deck } from './model'

export type FolderFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'folder'; name: string }
export type LibrarySort = 'updated' | 'name' | 'color'
export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = { updated: 'Editado', name: 'Nome', color: 'Cor' }

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function cleanFolder(name: string): string | null {
  // oxlint-disable-next-line no-control-regex -- control characters never belong in a folder name
  const n = name.replace(/[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, DECK_LIMITS.folder).trim()
  return n || null
}

export function foldersOf(decks: readonly Deck[], emptyFolders: readonly string[] = []): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = []
  for (const name of [...decks.flatMap((d) => (d.folder ? [d.folder] : [])), ...emptyFolders]) {
    const hit = out.find((f) => same(f.name, name))
    if (!hit) out.push({ name, count: 0 })
  }
  for (const d of decks) if (d.folder) out.find((f) => same(f.name, d.folder!))!.count++
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function inFolder(deck: Deck, filter: FolderFilter): boolean {
  if (filter.kind === 'all') return true
  if (filter.kind === 'none') return !deck.folder
  return !!deck.folder && same(deck.folder, filter.name)
}

// By deck name or a commander's name, ignoring case and accents.
export function matchesQuery(deck: Deck, query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  return [deck.name, ...deck.commanders.map((c) => c.name)].some((n) => fold(n).includes(q))
}

const ORDER = 'WUBRG'
// WUBRG for one color, then multicolor (fewer colors first, then WUBRG order), colorless, and unknown last.
function colorRank(identity: readonly Color[] | undefined): [number, number, string] {
  if (!identity) return [4, 0, '']
  if (identity.length === 0) return [3, 0, '']
  const key = [...identity].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('')
  return identity.length === 1 ? [1, ORDER.indexOf(key), key] : [2, identity.length, key]
}

export function sortDecks(decks: readonly Deck[], by: LibrarySort, identityOf: (deck: Deck) => readonly Color[] | undefined = () => undefined): Deck[] {
  const byName = (a: Deck, b: Deck) => a.name.localeCompare(b.name)
  if (by === 'name') return [...decks].sort(byName)
  if (by === 'updated') return [...decks].sort((a, b) => b.updatedAt - a.updatedAt)
  return [...decks].sort((a, b) => {
    const [ga, na, ka] = colorRank(identityOf(a))
    const [gb, nb, kb] = colorRank(identityOf(b))
    return ga - gb || na - nb || ka.localeCompare(kb) || byName(a, b)
  })
}

export function setFolder(deck: Deck, folder: string | null, now: number): Deck {
  const name = folder ? cleanFolder(folder) : null
  const { folder: _old, ...rest } = deck
  return { ...rest, ...(name ? { folder: name } : {}), updatedAt: now }
}
