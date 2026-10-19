// A fresh, migrated database per test: PGlite in memory by default (the same SQL as production, no server needed),
// or a brand-new database on a real Postgres when TEST_DATABASE_URL is set (catches driver differences).

import { join } from 'node:path'
import { afterEach } from 'vitest'
import { migrate, type Db } from '../src/db'
import { openPglite } from '../src/db/pglite'
import { openPostgres } from '../src/db/postgres'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')
const REAL = process.env.TEST_DATABASE_URL
const cleanups: (() => Promise<void>)[] = []
let counter = 0

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

export async function testDb(): Promise<Db> {
  let db: Db
  if (REAL) {
    const name = `gh_test_${process.pid}_${++counter}`
    const admin = openPostgres(REAL)
    await admin.exec(`CREATE DATABASE ${name}`)
    const url = new URL(REAL)
    url.pathname = `/${name}`
    db = openPostgres(url.toString())
    cleanups.push(async () => {
      await db.close()
      await admin.exec(`DROP DATABASE IF EXISTS ${name}`)
      await admin.close()
    })
  } else {
    db = await openPglite()
    cleanups.push(() => db.close())
  }
  await migrate(db, MIGRATIONS)
  return db
}
