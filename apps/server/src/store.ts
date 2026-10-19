// Room persistence (épico 08: Postgres, or PGlite in development). Each room is one row holding its snapshot:
// lobby, game state, initial state and action log (enough to replay the game).

import { migrateState } from '@gathering-hall/engine'
import type { Db } from './db'
import type { RoomSnapshot } from './room/room'

export interface RoomStore {
  load(id: string): Promise<RoomSnapshot | undefined>
  save(snapshot: RoomSnapshot): Promise<void>
  delete(id: string): Promise<void>
  expired(before: number): Promise<string[]>
  count(): Promise<number>
}

// Snapshots saved by an older engine are migrated on read (new turn rules stay off for them); anything this
// server does not understand is treated as missing.
export function readSnapshot(raw: unknown): RoomSnapshot | undefined {
  const snap = raw as RoomSnapshot | null
  if (!snap || typeof snap !== 'object' || snap.schema !== 1) return undefined
  const game = snap.game && migrateState(snap.game)
  const initial = snap.initial && migrateState(snap.initial)
  if ((snap.game && !game) || (snap.initial && !initial)) return undefined
  return { ...snap, game: game ?? null, initial: initial ?? null }
}

export class DbRoomStore implements RoomStore {
  private readonly db: Db
  constructor(db: Db) {
    this.db = db
  }

  async load(id: string): Promise<RoomSnapshot | undefined> {
    const [row] = await this.db.query<{ snapshot: unknown }>('SELECT snapshot FROM room WHERE id = $1', [id])
    return row ? readSnapshot(row.snapshot) : undefined
  }

  async save(snapshot: RoomSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO room (id, snapshot, last_active) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (id) DO UPDATE SET snapshot = excluded.snapshot, last_active = excluded.last_active`,
      [snapshot.id, JSON.stringify(snapshot), snapshot.lastActive],
    )
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM room WHERE id = $1', [id])
  }

  async expired(before: number): Promise<string[]> {
    return (await this.db.query<{ id: string }>('SELECT id FROM room WHERE last_active < $1', [before])).map((r) => r.id)
  }

  async count(): Promise<number> {
    const [row] = await this.db.query<{ n: string | number }>('SELECT count(*) AS n FROM room')
    return Number(row?.n ?? 0)
  }
}
