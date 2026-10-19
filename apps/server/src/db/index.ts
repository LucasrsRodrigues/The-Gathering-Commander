// Picks the database: Postgres when DATABASE_URL is set (production), PGlite in the data directory otherwise.

import { join } from 'node:path'
import type { Db } from './db'
import { migrate } from './migrate'
import { openPglite } from './pglite'
import { openPostgres } from './postgres'

export type { Db, Row } from './db'
export { migrate } from './migrate'

export async function openDatabase(opts: { url?: string; ssl?: boolean; dataDir: string; migrationsDir: string }): Promise<Db> {
  const db = opts.url ? openPostgres(opts.url, { ssl: opts.ssl }) : await openPglite(join(opts.dataDir, 'pg'))
  await migrate(db, opts.migrationsDir)
  return db
}
