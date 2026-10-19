// Versioned card catalog on SQLite. Intervals are [valid_from, valid_to) in ISO dates; an open interval has
// valid_to NULL. "As of D" = valid_from <= D AND (valid_to IS NULL OR valid_to > D).

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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

export class SqliteCatalogStore {
  private readonly db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS card_current (
        oracle_id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, front_norm TEXT,
        hash TEXT NOT NULL, legal TEXT NOT NULL, game_changer INTEGER NOT NULL, data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS card_current_name ON card_current (name_norm);
      CREATE INDEX IF NOT EXISTS card_current_front ON card_current (front_norm);
      CREATE TABLE IF NOT EXISTS oracle_version (
        oracle_id TEXT NOT NULL, valid_from TEXT NOT NULL, valid_to TEXT, hash TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (oracle_id, valid_from)
      );
      CREATE TABLE IF NOT EXISTS legality_version (
        oracle_id TEXT NOT NULL, status TEXT NOT NULL, valid_from TEXT NOT NULL, valid_to TEXT, source TEXT NOT NULL,
        UNIQUE (oracle_id, valid_from, source)
      );
      CREATE TABLE IF NOT EXISTS game_changer_version (
        oracle_id TEXT NOT NULL, valid_from TEXT NOT NULL, valid_to TEXT, source TEXT NOT NULL,
        UNIQUE (oracle_id, valid_from, source)
      );
      CREATE TABLE IF NOT EXISTS import_run (
        id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT, bulk_updated_at TEXT,
        status TEXT NOT NULL, cards INTEGER NOT NULL DEFAULT 0, changes INTEGER NOT NULL DEFAULT 0, error TEXT
      );
    `)
  }

  close() {
    this.db.close()
  }

  // ---- import ----

  currentState(): Map<string, CurrentState> {
    const rows = this.db.prepare('SELECT oracle_id, hash, legal, game_changer FROM card_current').all() as
      { oracle_id: string; hash: string; legal: Legality; game_changer: number }[]
    return new Map(rows.map((r) => [r.oracle_id, { hash: r.hash, legal: r.legal, gameChanger: r.game_changer === 1 }]))
  }

  // Applies a diff and refreshes the current cards in ONE transaction: a failure leaves nothing half done.
  apply(diff: CatalogDiff, records: CatalogRecord[], date: string): number {
    const tx = (fn: () => void) => {
      this.db.exec('BEGIN')
      try {
        fn()
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw err
      }
    }
    tx(() => {
      const close = this.db.prepare('UPDATE oracle_version SET valid_to = ? WHERE oracle_id = ? AND valid_to IS NULL')
      for (const id of diff.closedVersions) close.run(date, id)
      const open = this.db.prepare('INSERT OR REPLACE INTO oracle_version (oracle_id, valid_from, valid_to, hash, data) VALUES (?, ?, NULL, ?, ?)')
      for (const r of diff.newVersions) open.run(r.oracleId, date, r.hash, JSON.stringify(r.card))

      const closeLegal = this.db.prepare("UPDATE legality_version SET valid_to = ? WHERE oracle_id = ? AND valid_to IS NULL AND source = 'scryfall'")
      const openLegal = this.db.prepare("INSERT OR IGNORE INTO legality_version (oracle_id, status, valid_from, valid_to, source) VALUES (?, ?, ?, NULL, 'scryfall')")
      for (const c of diff.legalityChanges) {
        closeLegal.run(date, c.oracleId)
        openLegal.run(c.oracleId, c.to, date)
      }
      const closeGc = this.db.prepare("UPDATE game_changer_version SET valid_to = ? WHERE oracle_id = ? AND valid_to IS NULL AND source = 'scryfall'")
      const openGc = this.db.prepare("INSERT OR IGNORE INTO game_changer_version (oracle_id, valid_from, valid_to, source) VALUES (?, ?, NULL, 'scryfall')")
      for (const c of diff.gameChangerChanges) {
        closeGc.run(date, c.oracleId)
        if (c.to) openGc.run(c.oracleId, date)
      }

      const upsert = this.db.prepare(`INSERT INTO card_current (oracle_id, name, name_norm, front_norm, hash, legal, game_changer, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(oracle_id) DO UPDATE SET name = excluded.name, name_norm = excluded.name_norm,
        front_norm = excluded.front_norm, hash = excluded.hash, legal = excluded.legal, game_changer = excluded.game_changer, data = excluded.data`)
      for (const r of records) {
        upsert.run(r.oracleId, r.name, normalizeName(r.name), r.frontName ? normalizeName(r.frontName) : null, r.hash, r.legal, r.gameChanger ? 1 : 0, JSON.stringify(r.card))
      }
    })
    return diff.newVersions.length + diff.closedVersions.length + diff.legalityChanges.length + diff.gameChangerChanges.length
  }

  // Dated entries from before the first import (announcements); intervals are clipped to that date so
  // they never overlap what Scryfall data says afterwards. Idempotent.
  seedHistory(entries: HistoryEntry[]): { applied: number; unknown: string[] } {
    const first = this.firstImportDate()
    if (!first) return { applied: 0, unknown: [] }
    const unknown: string[] = []
    let applied = 0
    const legal = this.db.prepare('INSERT OR IGNORE INTO legality_version (oracle_id, status, valid_from, valid_to, source) VALUES (?, ?, ?, ?, ?)')
    const gc = this.db.prepare('INSERT OR IGNORE INTO game_changer_version (oracle_id, valid_from, valid_to, source) VALUES (?, ?, ?, ?)')
    for (const e of entries) {
      if (e.from >= first) continue
      const id = this.idByName(e.name)
      if (!id) {
        unknown.push(e.name)
        continue
      }
      const to = !e.to || e.to > first ? first : e.to
      const res = e.kind === 'banned' ? legal.run(id, 'banned', e.from, to, e.source) : gc.run(id, e.from, to, e.source)
      applied += Number(res.changes)
    }
    return { applied, unknown }
  }

  startRun(startedAt: string): number {
    return Number(this.db.prepare("INSERT INTO import_run (started_at, status) VALUES (?, 'running')").run(startedAt).lastInsertRowid)
  }

  finishRun(id: number, patch: { finishedAt: string; status: ImportRun['status']; bulkUpdatedAt?: string | null; cards?: number; changes?: number; error?: string | null }) {
    this.db.prepare('UPDATE import_run SET finished_at = ?, status = ?, bulk_updated_at = ?, cards = ?, changes = ?, error = ? WHERE id = ?')
      .run(patch.finishedAt, patch.status, patch.bulkUpdatedAt ?? null, patch.cards ?? 0, patch.changes ?? 0, patch.error ?? null, id)
  }

  lastRun(status?: ImportRun['status']): ImportRun | null {
    const row = (status
      ? this.db.prepare('SELECT * FROM import_run WHERE status = ? ORDER BY id DESC LIMIT 1').get(status)
      : this.db.prepare('SELECT * FROM import_run ORDER BY id DESC LIMIT 1').get()) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: Number(row.id), startedAt: String(row.started_at), finishedAt: (row.finished_at as string) ?? null,
      bulkUpdatedAt: (row.bulk_updated_at as string) ?? null, status: row.status as ImportRun['status'],
      cards: Number(row.cards), changes: Number(row.changes), error: (row.error as string) ?? null,
    }
  }

  firstImportDate(): string | null {
    const row = this.db.prepare("SELECT MIN(valid_from) AS d FROM legality_version WHERE source = 'scryfall'").get() as { d: string | null }
    return row.d
  }

  cardCount(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM card_current').get() as { n: number }).n)
  }

  // ---- queries ----

  private idByName(name: string): string | undefined {
    const key = normalizeName(name)
    const row = this.db.prepare(`SELECT oracle_id FROM card_current WHERE name_norm = ? OR front_norm = ?
      ORDER BY CASE legal WHEN 'not_legal' THEN 1 ELSE 0 END LIMIT 1`).get(key, key) as { oracle_id: string } | undefined
    return row?.oracle_id
  }

  // Current cards by name (full name or front face), preferring Commander-relevant cards on name clashes.
  resolveNames(names: string[]): Map<string, ClientCard> {
    const found = new Map<string, ClientCard>()
    const stmt = this.db.prepare(`SELECT data FROM card_current WHERE name_norm = ? OR front_norm = ?
      ORDER BY CASE legal WHEN 'not_legal' THEN 1 ELSE 0 END LIMIT 1`)
    for (const name of names) {
      const key = normalizeName(name)
      if (found.has(key)) continue
      const row = stmt.get(key, key) as { data: string } | undefined
      if (row) found.set(key, JSON.parse(row.data) as ClientCard)
    }
    return found
  }

  oracleAt(oracleId: string, date: string): ClientCard | null {
    const row = this.db.prepare('SELECT data FROM oracle_version WHERE oracle_id = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?) ORDER BY valid_from DESC LIMIT 1')
      .get(oracleId, date, date) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as ClientCard) : null
  }

  commanderAt(date: string): CommanderSnapshot {
    const banned = this.db.prepare(`SELECT DISTINCT l.oracle_id AS id, c.name FROM legality_version l JOIN card_current c ON c.oracle_id = l.oracle_id
      WHERE l.status = 'banned' AND l.valid_from <= ? AND (l.valid_to IS NULL OR l.valid_to > ?) ORDER BY c.name`).all(date, date) as { id: string; name: string }[]
    const gcs = this.db.prepare(`SELECT DISTINCT g.oracle_id AS id, c.name FROM game_changer_version g JOIN card_current c ON c.oracle_id = g.oracle_id
      WHERE g.valid_from <= ? AND (g.valid_to IS NULL OR g.valid_to > ?) ORDER BY c.name`).all(date, date) as { id: string; name: string }[]
    return {
      date,
      banned: banned.map((r) => ({ oracleId: r.id, name: r.name })),
      gameChangers: gcs.map((r) => ({ oracleId: r.id, name: r.name })),
    }
  }
}
