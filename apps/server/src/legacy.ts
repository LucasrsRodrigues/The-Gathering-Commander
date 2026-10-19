// One-time transfer from the SQLite era (épico 08, req. 3). On the first start with the new database, rooms saved in
// the old rooms.db are copied over (snapshots migrated on read, like any load). The catalog is not copied: the import
// rebuilds it from Scryfall in seconds and reapplies the dated history. The old file stays on the volume, untouched,
// as a way back.

import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { Db } from './db'
import { readSnapshot, type RoomStore } from './store'

const FLAG = 'legacyRoomsImported'

export async function importLegacyRooms(db: Db, store: RoomStore, sqlitePath: string): Promise<{ copied: number; skipped: number } | null> {
  if (!existsSync(sqlitePath)) return null
  const [done] = await db.query("SELECT 1 FROM catalog_meta WHERE key = $1", [FLAG])
  if (done) return null
  const old = new DatabaseSync(sqlitePath, { readOnly: true })
  let copied = 0
  let skipped = 0
  try {
    const hasRooms = old.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get()
    const rows = hasRooms ? (old.prepare('SELECT snapshot FROM rooms').all() as { snapshot: string }[]) : []
    for (const row of rows) {
      let snap
      try {
        snap = readSnapshot(JSON.parse(row.snapshot))
      } catch {
        snap = undefined
      }
      if (!snap) {
        skipped++
        continue
      }
      await store.save(snap)
      copied++
    }
  } finally {
    old.close()
  }
  await db.query('INSERT INTO catalog_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [FLAG, new Date().toISOString()])
  return { copied, skipped }
}
