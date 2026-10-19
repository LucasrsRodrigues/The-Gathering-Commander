// A fresh, migrated in-memory Postgres (PGlite) per test: the same SQL as production, no server needed.

import { join } from 'node:path'
import { afterEach } from 'vitest'
import { migrate, type Db } from '../src/db'
import { openPglite } from '../src/db/pglite'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')
const open: Db[] = []

afterEach(async () => {
  while (open.length) await open.pop()!.close()
})

export async function testDb(): Promise<Db> {
  const db = await openPglite()
  await migrate(db, MIGRATIONS)
  open.push(db)
  return db
}
