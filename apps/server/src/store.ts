// Room persistence on SQLite (node:sqlite, no native dependency). Each room is one row holding its
// snapshot: lobby, game state, initial state and action log (enough to replay the game).

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { RoomSnapshot } from './room/room'

export interface RoomStore {
  load(id: string): RoomSnapshot | undefined
  save(snapshot: RoomSnapshot): void
  delete(id: string): void
  expired(before: number): string[]
  count(): number
  close(): void
}

export class SqliteRoomStore implements RoomStore {
  private readonly db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL,
        last_active INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS rooms_last_active ON rooms (last_active);
    `)
  }

  load(id: string): RoomSnapshot | undefined {
    const row = this.db.prepare('SELECT snapshot FROM rooms WHERE id = ?').get(id) as { snapshot: string } | undefined
    if (!row) return undefined
    try {
      const snap = JSON.parse(row.snapshot) as RoomSnapshot
      return snap.schema === 1 ? snap : undefined
    } catch {
      return undefined
    }
  }

  save(snapshot: RoomSnapshot) {
    this.db.prepare('INSERT INTO rooms (id, snapshot, last_active) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, last_active = excluded.last_active')
      .run(snapshot.id, JSON.stringify(snapshot), snapshot.lastActive)
  }

  delete(id: string) {
    this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id)
  }

  expired(before: number): string[] {
    return (this.db.prepare('SELECT id FROM rooms WHERE last_active < ?').all(before) as { id: string }[]).map((r) => r.id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }).n
  }

  close() {
    this.db.close()
  }
}
