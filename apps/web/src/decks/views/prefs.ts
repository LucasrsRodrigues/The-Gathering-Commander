// How this browser likes to see decks (épico 10, req. 5): view, grouping and sorting. Not part of the deck, never
// synced; storage may be unavailable (private mode), so everything falls back to the defaults.

import { useEffect, useState } from 'react'
import type { DeckViewMode, GroupBy, SortBy } from './grouping'

export interface EditorPrefs {
  view: DeckViewMode
  groupBy: GroupBy
  sortBy: SortBy
}

const KEY = 'gh-editor-view-v1'
export const DEFAULT_PREFS: EditorPrefs = { view: 'stacks', groupBy: 'type', sortBy: 'mv' }
const VIEWS: DeckViewMode[] = ['list', 'stacks', 'grid']
const GROUPS: GroupBy[] = ['type', 'mv', 'color', 'category']
const SORTS: SortBy[] = ['name', 'mv']

export function readPrefs(storage: Pick<Storage, 'getItem'> | null): EditorPrefs {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<EditorPrefs> | null
    return {
      view: VIEWS.includes(raw?.view as DeckViewMode) ? raw!.view! : DEFAULT_PREFS.view,
      groupBy: GROUPS.includes(raw?.groupBy as GroupBy) ? raw!.groupBy! : DEFAULT_PREFS.groupBy,
      sortBy: SORTS.includes(raw?.sortBy as SortBy) ? raw!.sortBy! : DEFAULT_PREFS.sortBy,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function useEditorPrefs(): [EditorPrefs, (patch: Partial<EditorPrefs>) => void] {
  const [prefs, setPrefs] = useState(() => readPrefs(storage()))
  const update = (patch: Partial<EditorPrefs>) => setPrefs((p) => {
    const next = { ...p, ...patch }
    try {
      storage()?.setItem(KEY, JSON.stringify(next))
    } catch {
      // not saved: fine, it is only a convenience
    }
    return next
  })
  return [prefs, update]
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}
