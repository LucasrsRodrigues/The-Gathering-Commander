// Development and test adapter: PGlite, in memory or persisted in a directory.

import { PGlite, type Transaction } from '@electric-sql/pglite'
import type { Db, Row } from './db'

class PgliteDb implements Db {
  readonly kind = 'pglite'
  private readonly pg: PGlite | Transaction
  private readonly root: PGlite | null
  constructor(pg: PGlite | Transaction, root: PGlite | null) {
    this.pg = pg
    this.root = root
  }

  async query<T extends Row = Row>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    const result = await this.pg.query<T>(text, params as unknown[])
    return result.rows
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (!this.root) return fn(this)
    return this.root.transaction((tx) => fn(new PgliteDb(tx, null)))
  }

  async exec(text: string): Promise<void> {
    await this.pg.exec(text)
  }

  async close(): Promise<void> {
    await this.root?.close()
  }
}

// `dataDir` undefined = in memory (tests).
export async function openPglite(dataDir?: string): Promise<Db> {
  const pg = await PGlite.create(dataDir)
  return new PgliteDb(pg, pg)
}
