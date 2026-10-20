// Cloud documents (épico 08, req. 11–15): last write wins per document, deletions as tombstones, limits per account.

import type { Db } from '../db'
import type { AccountDataPart } from '../auth/accounts'

export type DocKind = 'deck' | 'preset'

export interface CloudDoc {
  id: string
  data: unknown | null // null = deleted
  updatedAt: number
  deleted: boolean
}

export const LIMITS = { deck: 500, preset: 100 } as const
export const MAX_DOC_BYTES = 64 * 1024
export const FUTURE_SLACK_MS = 5 * 60 * 1000 // a device clock further ahead than this counts as "now"

export type PutResult = { status: 'ok'; doc: CloudDoc } | { status: 'conflict'; doc: CloudDoc } | { status: 'limit' }

type Row = { id: string; data: unknown | null; updated_at: string | number }
const toDoc = (r: Row): CloudDoc => ({ id: r.id, data: r.data, updatedAt: Number(r.updated_at), deleted: r.data === null })

export class CloudStore {
  private readonly db: Db
  constructor(db: Db) {
    this.db = db
  }

  // Everything that changed for the account after `since` (server time), and the time to ask from next.
  async changesSince(userId: string, since: number, now: number): Promise<{ decks: CloudDoc[]; presets: CloudDoc[]; now: number }> {
    const rows = await this.db.query<Row & { kind: DocKind }>(
      'SELECT kind, id, data, updated_at FROM cloud_doc WHERE user_id = $1 AND changed_at > $2 ORDER BY changed_at', [userId, since])
    return {
      decks: rows.filter((r) => r.kind === 'deck').map(toDoc),
      presets: rows.filter((r) => r.kind === 'preset').map(toDoc),
      now,
    }
  }

  // Writes (or deletes, with data null) when the edit is newer than what the server has; otherwise answers with the
  // server's version (a conflict the device then adopts). One transaction, so two devices racing cannot both win.
  async put(userId: string, kind: DocKind, id: string, data: unknown | null, updatedAt: number, now: number): Promise<PutResult> {
    const clamped = updatedAt > now + FUTURE_SLACK_MS ? now : updatedAt
    return this.db.transaction(async (tx) => {
      const [current] = await tx.query<Row>('SELECT id, data, updated_at FROM cloud_doc WHERE user_id = $1 AND kind = $2 AND id = $3 FOR UPDATE', [userId, kind, id])
      if (current && Number(current.updated_at) >= clamped) return { status: 'conflict' as const, doc: toDoc(current) }
      if (data !== null && (!current || current.data === null)) {
        const [count] = await tx.query<{ n: string | number }>('SELECT count(*) AS n FROM cloud_doc WHERE user_id = $1 AND kind = $2 AND data IS NOT NULL', [userId, kind])
        if (Number(count?.n ?? 0) >= LIMITS[kind]) return { status: 'limit' as const }
      }
      await tx.query(
        `INSERT INTO cloud_doc (user_id, kind, id, data, updated_at, changed_at) VALUES ($1, $2, $3, ($4::text)::jsonb, $5, $6)
         ON CONFLICT (user_id, kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, changed_at = excluded.changed_at`,
        [userId, kind, id, data === null ? null : JSON.stringify(data), clamped, now])
      return { status: 'ok' as const, doc: { id, data, updatedAt: clamped, deleted: data === null } }
    })
  }

  // Part of the account (export and deletion, épico 08 req. 9–10).
  accountPart(): AccountDataPart {
    return {
      name: 'cloud',
      export: async (db, userId) => {
        const rows = await db.query<Row & { kind: DocKind }>('SELECT kind, id, data, updated_at FROM cloud_doc WHERE user_id = $1 AND data IS NOT NULL ORDER BY kind, id', [userId])
        return { decks: rows.filter((r) => r.kind === 'deck').map((r) => r.data), presets: rows.filter((r) => r.kind === 'preset').map((r) => r.data) }
      },
      erase: async (db, userId) => void (await db.query('DELETE FROM cloud_doc WHERE user_id = $1', [userId])),
    }
  }
}
