// Versioned card catalog (épico 01) on the Db port (épico 08: Postgres, or PGlite in development). Intervals are
// [valid_from, valid_to) in ISO dates; an open interval has valid_to NULL. "As of D" = valid_from <= D AND
// (valid_to IS NULL OR valid_to > D). Imports write in batches with unnest(), one transaction for the whole run.

import type { Db } from '../db'
import type { CatalogDiff, CurrentState } from './diff'
import { normalizeName, type CatalogRecord, type ClientCard, type Legality } from './normalize'

export interface ImportRun {
  id: number
  startedAt: string
  finishedAt: string | null
  bulkUpdatedAt: string | null
  status: 'running' | 'ok' | 'failed' | 'skipped'
  cards: number
  changes: number
  error: string | null
}

export interface HistoryEntry {
  name: string
  kind: 'banned' | 'gameChanger'
  from: string // ISO date
  to?: string
  source: string // URL of the announcement
}

export interface CommanderSnapshot {
  date: string
  banned: { oracleId: string; name: string }[]
  gameChangers: { oracleId: string; name: string }[]
}

const BATCH = 1000
// Array parameters always go as text[] and are cast in SQL: the postgres driver sends a JS boolean[] as a single
// boolean (which Postgres cannot cast to boolean[]), while text arrays work the same on Postgres and PGlite.

// Splits rows into batches and calls `fn` with one array per column (for unnest).
async function inBatches<T>(rows: T[], fn: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += BATCH) await fn(rows.slice(i, i + BATCH))
}

export class CatalogStore {
  private readonly db: Db
  constructor(db: Db) {
    this.db = db
  }

  // Version of the stored ClientCard shape (see CARD_FORMAT); 1 for catalogs imported before it existed.
  async cardFormat(): Promise<number> {
    const [row] = await this.db.query<{ value: string }>("SELECT value FROM catalog_meta WHERE key = 'cardFormat'")
    return row ? Number(row.value) : 1
  }

  // The most played cards first (Commander, by edhrec_rank), for the coverage command (épico 11).
  async mostPlayed(limit: number): Promise<{ rank: number; card: ClientCard }[]> {
    const rows = await this.db.query<{ edhrec_rank: number; data: ClientCard }>(
      'SELECT edhrec_rank, data FROM card_current WHERE edhrec_rank IS NOT NULL ORDER BY edhrec_rank LIMIT $1', [limit])
    return rows.map((r) => ({ rank: Number(r.edhrec_rank), card: r.data }))
  }

  async setCardFormat(format: number) {
    await this.db.query(
      "INSERT INTO catalog_meta (key, value) VALUES ('cardFormat', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      [String(format)],
    )
  }

  // ---- import ----

  async currentState(): Promise<Map<string, CurrentState>> {
    const rows = await this.db.query<{ oracle_id: string; hash: string; legal: Legality; game_changer: boolean }>(
      'SELECT oracle_id, hash, legal, game_changer FROM card_current',
    )
    return new Map(rows.map((r) => [r.oracle_id, { hash: r.hash, legal: r.legal, gameChanger: r.game_changer }]))
  }

  // Applies a diff and refreshes the current cards in ONE transaction: a failure leaves nothing half done.
  async apply(diff: CatalogDiff, records: CatalogRecord[], date: string): Promise<number> {
    await this.db.transaction(async (tx) => {
      await inBatches(diff.closedVersions, (ids) =>
        tx.query('UPDATE oracle_version SET valid_to = $1 WHERE oracle_id = ANY($2::text[]) AND valid_to IS NULL', [date, ids]).then(() => {}))
      await inBatches(diff.newVersions, async (rs) => {
        await tx.query(
          `INSERT INTO oracle_version (oracle_id, valid_from, valid_to, hash, data)
           SELECT id, $1, NULL, hash, data::jsonb FROM unnest($2::text[], $3::text[], $4::text[]) AS t(id, hash, data)
           ON CONFLICT (oracle_id, valid_from) DO UPDATE SET valid_to = NULL, hash = excluded.hash, data = excluded.data`,
          [date, rs.map((r) => r.oracleId), rs.map((r) => r.hash), rs.map((r) => JSON.stringify(r.card))],
        )
      })

      await inBatches(diff.legalityChanges, async (cs) => {
        const ids = cs.map((c) => c.oracleId)
        await tx.query("UPDATE legality_version SET valid_to = $1 WHERE oracle_id = ANY($2::text[]) AND valid_to IS NULL AND source = 'scryfall'", [date, ids])
        await tx.query(
          `INSERT INTO legality_version (oracle_id, status, valid_from, valid_to, source)
           SELECT id, status, $1, NULL, 'scryfall' FROM unnest($2::text[], $3::text[]) AS t(id, status)
           ON CONFLICT DO NOTHING`,
          [date, ids, cs.map((c) => c.to)],
        )
      })
      await inBatches(diff.gameChangerChanges, async (cs) => {
        await tx.query("UPDATE game_changer_version SET valid_to = $1 WHERE oracle_id = ANY($2::text[]) AND valid_to IS NULL AND source = 'scryfall'", [date, cs.map((c) => c.oracleId)])
        const opened = cs.filter((c) => c.to).map((c) => c.oracleId)
        if (opened.length) {
          await tx.query(
            `INSERT INTO game_changer_version (oracle_id, valid_from, valid_to, source)
             SELECT id, $1, NULL, 'scryfall' FROM unnest($2::text[]) AS t(id) ON CONFLICT DO NOTHING`,
            [date, opened],
          )
        }
      })

      await inBatches(records, async (rs) => {
        await tx.query(
          `INSERT INTO card_current (oracle_id, name, name_norm, front_norm, hash, legal, game_changer, data, edhrec_rank)
           SELECT id, name, name_norm, front_norm, hash, legal, gc::boolean, data::jsonb, rank::integer
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
             AS t(id, name, name_norm, front_norm, hash, legal, gc, data, rank)
           ON CONFLICT (oracle_id) DO UPDATE SET name = excluded.name, name_norm = excluded.name_norm, front_norm = excluded.front_norm,
             hash = excluded.hash, legal = excluded.legal, game_changer = excluded.game_changer, data = excluded.data,
             edhrec_rank = excluded.edhrec_rank`,
          [
            rs.map((r) => r.oracleId), rs.map((r) => r.name), rs.map((r) => normalizeName(r.name)),
            rs.map((r) => (r.frontName ? normalizeName(r.frontName) : null)), rs.map((r) => r.hash), rs.map((r) => r.legal),
            rs.map((r) => String(r.gameChanger)), rs.map((r) => JSON.stringify(r.card)),
            rs.map((r) => (r.edhrecRank === null ? null : String(r.edhrecRank))),
          ],
        )
      })
    })
    return diff.newVersions.length + diff.closedVersions.length + diff.legalityChanges.length + diff.gameChangerChanges.length
  }

  // Dated entries from before the first import (announcements); intervals are clipped to that date so
  // they never overlap what Scryfall data says afterwards. Idempotent.
  async seedHistory(entries: HistoryEntry[]): Promise<{ applied: number; unknown: string[] }> {
    const first = await this.firstImportDate()
    if (!first) return { applied: 0, unknown: [] }
    const unknown: string[] = []
    let applied = 0
    for (const e of entries) {
      if (e.from >= first) continue
      const id = await this.idByName(e.name)
      if (!id) {
        unknown.push(e.name)
        continue
      }
      const to = !e.to || e.to > first ? first : e.to
      const rows = e.kind === 'banned'
        ? await this.db.query("INSERT INTO legality_version (oracle_id, status, valid_from, valid_to, source) VALUES ($1, 'banned', $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1", [id, e.from, to, e.source])
        : await this.db.query('INSERT INTO game_changer_version (oracle_id, valid_from, valid_to, source) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1', [id, e.from, to, e.source])
      applied += rows.length
    }
    return { applied, unknown }
  }

  async startRun(startedAt: string): Promise<number> {
    const [row] = await this.db.query<{ id: string | number }>("INSERT INTO import_run (started_at, status) VALUES ($1, 'running') RETURNING id", [startedAt])
    return Number(row!.id)
  }

  async finishRun(id: number, patch: { finishedAt: string; status: ImportRun['status']; bulkUpdatedAt?: string | null; cards?: number; changes?: number; error?: string | null }) {
    await this.db.query(
      'UPDATE import_run SET finished_at = $1, status = $2, bulk_updated_at = $3, cards = $4, changes = $5, error = $6 WHERE id = $7',
      [patch.finishedAt, patch.status, patch.bulkUpdatedAt ?? null, patch.cards ?? 0, patch.changes ?? 0, patch.error ?? null, id],
    )
  }

  async lastRun(status?: ImportRun['status']): Promise<ImportRun | null> {
    const [row] = status
      ? await this.db.query('SELECT * FROM import_run WHERE status = $1 ORDER BY id DESC LIMIT 1', [status])
      : await this.db.query('SELECT * FROM import_run ORDER BY id DESC LIMIT 1')
    if (!row) return null
    return {
      id: Number(row.id), startedAt: String(row.started_at), finishedAt: (row.finished_at as string) ?? null,
      bulkUpdatedAt: (row.bulk_updated_at as string) ?? null, status: row.status as ImportRun['status'],
      cards: Number(row.cards), changes: Number(row.changes), error: (row.error as string) ?? null,
    }
  }

  async firstImportDate(): Promise<string | null> {
    const [row] = await this.db.query<{ d: string | null }>("SELECT min(valid_from) AS d FROM legality_version WHERE source = 'scryfall'")
    return row?.d ?? null
  }

  async cardCount(): Promise<number> {
    const [row] = await this.db.query<{ n: string | number }>('SELECT count(*) AS n FROM card_current')
    return Number(row?.n ?? 0)
  }

  // ---- queries ----

  private async idByName(name: string): Promise<string | undefined> {
    const key = normalizeName(name)
    const [row] = await this.db.query<{ oracle_id: string }>(
      `SELECT oracle_id FROM card_current WHERE name_norm = $1 OR front_norm = $1
       ORDER BY (legal = 'not_legal') LIMIT 1`, [key])
    return row?.oracle_id
  }

  // Current cards by name (full name or front face), preferring Commander-relevant cards on name clashes.
  async resolveNames(names: string[]): Promise<Map<string, ClientCard>> {
    const keys = [...new Set(names.map(normalizeName))]
    if (!keys.length) return new Map()
    const rows = await this.db.query<{ key: string; data: ClientCard }>(
      `SELECT DISTINCT ON (k.key) k.key, c.data FROM unnest($1::text[]) AS k(key)
       JOIN card_current c ON c.name_norm = k.key OR c.front_norm = k.key
       ORDER BY k.key, (c.legal = 'not_legal')`, [keys])
    const byKey = new Map(rows.map((r) => [r.key, r.data]))
    // Keep the caller's order (the first spelling of each name wins), like the lookup it replaces.
    return new Map(keys.flatMap((k) => (byKey.has(k) ? [[k, byKey.get(k)!] as const] : [])))
  }

  async oracleAt(oracleId: string, date: string): Promise<ClientCard | null> {
    const [row] = await this.db.query<{ data: ClientCard }>(
      `SELECT data FROM oracle_version WHERE oracle_id = $1 AND valid_from <= $2 AND (valid_to IS NULL OR valid_to > $2)
       ORDER BY valid_from DESC LIMIT 1`, [oracleId, date])
    return row?.data ?? null
  }

  async commanderAt(date: string): Promise<CommanderSnapshot> {
    const banned = await this.db.query<{ id: string; name: string }>(
      `SELECT DISTINCT l.oracle_id AS id, c.name FROM legality_version l JOIN card_current c ON c.oracle_id = l.oracle_id
       WHERE l.status = 'banned' AND l.valid_from <= $1 AND (l.valid_to IS NULL OR l.valid_to > $1) ORDER BY c.name`, [date])
    const gcs = await this.db.query<{ id: string; name: string }>(
      `SELECT DISTINCT g.oracle_id AS id, c.name FROM game_changer_version g JOIN card_current c ON c.oracle_id = g.oracle_id
       WHERE g.valid_from <= $1 AND (g.valid_to IS NULL OR g.valid_to > $1) ORDER BY c.name`, [date])
    return {
      date,
      banned: banned.map((r) => ({ oracleId: r.id, name: r.name })),
      gameChangers: gcs.map((r) => ({ oracleId: r.id, name: r.name })),
    }
  }
}
