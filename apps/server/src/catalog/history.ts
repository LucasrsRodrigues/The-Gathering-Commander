// Loads the dated ban / Game Changer history kept in the repository (apps/server/history/commander.json).
// The file is reviewed data, but it is still validated: bad entries are skipped, never trusted blindly.

import { readFileSync } from 'node:fs'
import type { HistoryEntry } from './store'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseHistory(json: string): HistoryEntry[] {
  const parsed = JSON.parse(json) as { entries?: unknown }
  if (!Array.isArray(parsed.entries)) return []
  return parsed.entries.flatMap((e): HistoryEntry[] => {
    if (!e || typeof e !== 'object') return []
    const { name, kind, from, to, source } = e as Record<string, unknown>
    if (typeof name !== 'string' || !name || name.length > 200) return []
    if (kind !== 'banned' && kind !== 'gameChanger') return []
    if (typeof from !== 'string' || !DATE.test(from)) return []
    if (to !== undefined && (typeof to !== 'string' || !DATE.test(to) || to <= from)) return []
    if (typeof source !== 'string' || !source.startsWith('https://')) return [] // every entry cites its source
    return [{ name, kind, from, ...(to ? { to } : {}), source }]
  })
}

export function loadHistory(path: string): HistoryEntry[] {
  try {
    return parseHistory(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}
