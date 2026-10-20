// npm run coverage -w @gathering-hall/server
// Measures card automation over the catalog in the database (DATABASE_URL, or the local PGlite in DATA_DIR) and
// prints the coverage of the top 1,000 and 5,000 most played cards plus the most common manual sentences.

import { join } from 'node:path'
import { formatReport, measureCoverage } from './catalog/coverage'
import { CatalogStore } from './catalog/store'
import { openDatabase } from './db'

const env = process.env
const db = await openDatabase({
  url: env.DATABASE_URL || undefined, ssl: env.DATABASE_SSL === '1', dataDir: env.DATA_DIR ?? './data',
  migrationsDir: join(import.meta.dirname, '..', 'migrations'),
})
try {
  const cards = await new CatalogStore(db).mostPlayed(5000)
  if (!cards.length) {
    console.error('O catálogo não tem ranking (edhrec_rank). Rode o import do catálogo antes (o servidor importa ao subir).')
    process.exitCode = 1
  } else {
    console.log(formatReport(measureCoverage(cards)))
  }
} finally {
  await db.close()
}
