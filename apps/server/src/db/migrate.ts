// Versioned schema (épico 08, req. 2): `migrations/NNNN-name.sql`, applied in order, each in its own transaction and
// recorded in schema_migration. An applied migration is never edited; change the schema with a new one.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from './db'

const FILE = /^(\d{4})-[a-z0-9-]+\.sql$/

export interface MigrationResult {
  applied: string[]
}

export async function migrate(db: Db, dir: string): Promise<MigrationResult> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migration (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  const done = new Set((await db.query<{ id: string }>('SELECT id FROM schema_migration')).map((r) => r.id))
  const files = readdirSync(dir).filter((f) => FILE.test(f)).sort()
  const applied: string[] = []
  for (const file of files) {
    if (done.has(file)) continue
    const sql = readFileSync(join(dir, file), 'utf8')
    await db.transaction(async (tx) => {
      await tx.exec(sql)
      await tx.query('INSERT INTO schema_migration (id) VALUES ($1)', [file])
    })
    applied.push(file)
  }
  return { applied }
}
