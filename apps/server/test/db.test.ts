import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrate, type Db } from '../src/db'
import { openPglite } from '../src/db/pglite'
import { openPostgres } from '../src/db/postgres'

// The same suite runs on PGlite always, and on a real Postgres when TEST_DATABASE_URL is set.
const targets: [string, () => Promise<Db>][] = [['pglite', () => openPglite()]]
if (process.env.TEST_DATABASE_URL) targets.push(['postgres', async () => openPostgres(process.env.TEST_DATABASE_URL!)])

function migrations(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gh-migrations-'))
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql)
  return dir
}

const opened: Db[] = []
afterEach(async () => {
  while (opened.length) await opened.pop()!.close()
})

for (const [name, open] of targets) {
  describe(`Db on ${name}`, () => {
    const db = async () => {
      const d = await open()
      opened.push(d)
      // Isolate runs on a shared real database.
      await d.exec('DROP TABLE IF EXISTS schema_migration, t_note, t_half')
      return d
    }

    it('runs queries with positional parameters and returns plain rows (jsonb included)', async () => {
      const d = await db()
      await d.exec('CREATE TABLE t_note (id int PRIMARY KEY, data jsonb NOT NULL)')
      await d.query('INSERT INTO t_note (id, data) VALUES ($1, $2)', [1, { deck: 'Krenko', cards: [1, 2] }])
      expect(await d.query('SELECT id, data FROM t_note WHERE id = $1', [1])).toEqual([{ id: 1, data: { deck: 'Krenko', cards: [1, 2] } }])
    })

    it('transactions are all or nothing', async () => {
      const d = await db()
      await d.exec('CREATE TABLE t_note (id int PRIMARY KEY, data jsonb NOT NULL)')
      await expect(d.transaction(async (tx) => {
        await tx.query('INSERT INTO t_note (id, data) VALUES (1, $1)', [{}])
        await tx.query('INSERT INTO t_note (id, data) VALUES (1, $1)', [{}]) // duplicate key
      })).rejects.toThrow()
      expect(await d.query('SELECT * FROM t_note')).toEqual([])
    })

    it('applies migrations in order, once, each one atomically', async () => {
      const d = await db()
      const dir = migrations({
        '0001-note.sql': 'CREATE TABLE t_note (id int PRIMARY KEY);',
        '0002-half.sql': 'CREATE TABLE t_half (id int); SELECT broken FROM nowhere;',
        'README.md': 'not a migration',
      })
      await expect(migrate(d, dir)).rejects.toThrow()
      expect((await d.query<{ id: string }>('SELECT id FROM schema_migration')).map((r) => r.id)).toEqual(['0001-note.sql'])
      expect(await d.query("SELECT to_regclass('t_half') AS t")).toEqual([{ t: null }]) // the failed one left nothing

      writeFileSync(join(dir, '0002-half.sql'), 'CREATE TABLE t_half (id int);')
      expect(await migrate(d, dir)).toEqual({ applied: ['0002-half.sql'] })
      expect(await migrate(d, dir)).toEqual({ applied: [] })
    })
  })
}

describe('openDatabase', () => {
  it('without DATABASE_URL keeps a PGlite database in the data directory, migrated, across restarts', async () => {
    const { openDatabase } = await import('../src/db')
    const dataDir = mkdtempSync(join(tmpdir(), 'gh-data-'))
    const migrationsDir = migrations({ '0001-note.sql': 'CREATE TABLE t_note (id int PRIMARY KEY);' })
    const first = await openDatabase({ dataDir, migrationsDir })
    expect(first.kind).toBe('pglite')
    await first.query('INSERT INTO t_note (id) VALUES (7)')
    await first.close()
    const again = await openDatabase({ dataDir, migrationsDir })
    opened.push(again)
    expect(await again.query('SELECT id FROM t_note')).toEqual([{ id: 7 }])
  })
})
