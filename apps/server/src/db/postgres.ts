// Production adapter: a small pool over the `postgres` driver.

import postgres from 'postgres'
import type { Db, Row } from './db'

type Sql = postgres.Sql | postgres.TransactionSql

class PostgresDb implements Db {
  readonly kind = 'postgres'
  private readonly sql: Sql
  private readonly root: postgres.Sql | null
  constructor(sql: Sql, root: postgres.Sql | null) {
    this.sql = sql
    this.root = root
  }

  async query<T extends Row = Row>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    const rows = await this.sql.unsafe(text, params as postgres.ParameterOrJSON<never>[])
    return rows as unknown as T[]
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (!this.root) return fn(this) // already inside one
    return this.root.begin((tx) => fn(new PostgresDb(tx, null))) as Promise<T>
  }

  async exec(text: string): Promise<void> {
    await this.sql.unsafe(text)
  }

  async close(): Promise<void> {
    await this.root?.end({ timeout: 5 })
  }
}

export function openPostgres(url: string, opts: { ssl?: boolean } = {}): Db {
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
    ...(opts.ssl ? { ssl: 'require' as const } : {}),
  })
  return new PostgresDb(sql, sql)
}
