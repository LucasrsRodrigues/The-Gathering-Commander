// The database port (épico 08). Stores talk to this, never to a driver: production runs on Postgres, development and
// tests on PGlite (Postgres compiled to WebAssembly, in-process). Both speak the same SQL.

export type Row = Record<string, unknown>

export interface Db {
  // Parameters are positional ($1, $2, …). Rows come back as plain objects.
  query<T extends Row = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>
  // Runs `fn` in one transaction: everything or nothing. Nested calls reuse the outer transaction.
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
  // Several statements at once, no parameters (migrations).
  exec(sql: string): Promise<void>
  close(): Promise<void>
  readonly kind: 'postgres' | 'pglite'
}
