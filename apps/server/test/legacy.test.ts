import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { importLegacyRooms } from '../src/legacy'
import { DbRoomStore } from '../src/store'
import { testDb } from './db.helpers'
import { msg, seatedRoom } from './helpers'

// A rooms.db exactly as the SQLite store wrote it before épico 08.
function oldFile(snapshots: unknown[], garbage = false): string {
  const path = join(mkdtempSync(join(tmpdir(), 'gh-legacy-')), 'rooms.db')
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE rooms (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, last_active INTEGER NOT NULL)')
  const insert = db.prepare('INSERT INTO rooms (id, snapshot, last_active) VALUES (?, ?, ?)')
  for (const s of snapshots as { id: string; lastActive: number }[]) insert.run(s.id, JSON.stringify(s), s.lastActive)
  if (garbage) insert.run('broken', '{not json', 0)
  db.close()
  return path
}

describe('transfer from the SQLite era', () => {
  it('copies the old rooms once, playable, and leaves the old file alone', async () => {
    const { room } = seatedRoom(2)
    room.receive('c0', msg({ t: 'start' }))
    const snap = room.snapshot()
    const path = oldFile([snap], true)
    const db = await testDb()
    const store = new DbRoomStore(db)

    expect(await importLegacyRooms(db, store, path)).toEqual({ copied: 1, skipped: 1 })
    const loaded = await store.load(snap.id)
    expect(loaded?.game?.seats).toEqual(snap.game?.seats)
    expect(loaded?.status).toBe('playing')

    expect(await importLegacyRooms(db, store, path)).toBeNull() // already done
    expect(await store.count()).toBe(1)
    const still = new DatabaseSync(path, { readOnly: true })
    expect((still.prepare('SELECT count(*) AS n FROM rooms').get() as { n: number }).n).toBe(2)
    still.close()
  })

  it('does nothing when there is no old file', async () => {
    const db = await testDb()
    expect(await importLegacyRooms(db, new DbRoomStore(db), join(tmpdir(), 'nope', 'rooms.db'))).toBeNull()
  })
})
