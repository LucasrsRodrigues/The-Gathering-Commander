// Entry point. Configuration comes from the environment (see DEPLOY.md).

import { dirname, join } from 'node:path'
import { loadHistory } from './catalog/history'
import { runCatalogImport } from './catalog/ingest'
import { CatalogCache } from './catalog/lookup'
import { CARD_FORMAT } from './catalog/normalize'
import { CatalogStore } from './catalog/store'
import { openDatabase, type Db } from './db'
import { DEFAULT_CONFIG, startServer, type ServerCatalog } from './server'
import { DbRoomStore } from './store'

const env = process.env
const config = {
  ...DEFAULT_CONFIG,
  port: Number(env.PORT ?? DEFAULT_CONFIG.port),
  allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) : DEFAULT_CONFIG.allowedOrigins,
  roomTtlMs: Number(env.ROOM_TTL_HOURS ?? 24) * 60 * 60 * 1000,
  maxRooms: Number(env.MAX_ROOMS ?? DEFAULT_CONFIG.maxRooms),
  trustProxy: env.TRUST_PROXY === '1',
  staticDir: env.STATIC_DIR || null,
}

// Data directory: PGlite lives here when there is no DATABASE_URL, and so do the raw catalog downloads.
const dataDir = env.DATA_DIR ?? (env.DB_PATH ? dirname(env.DB_PATH) : './data')
let db: Db
try {
  db = await openDatabase({
    url: env.DATABASE_URL || undefined,
    ssl: env.DATABASE_SSL === '1',
    dataDir,
    migrationsDir: join(import.meta.dirname, '..', 'migrations'),
  })
} catch (err) {
  console.error(env.DATABASE_URL
    ? 'Não foi possível conectar ao Postgres (DATABASE_URL). O serviço está no ar e a URL está certa?'
    : `Não foi possível abrir o banco local em ${dataDir}. A pasta existe e tem permissão de escrita?`, err)
  process.exit(1)
}

const store = new DbRoomStore(db)
let catalog: ServerCatalog | null = null
if (env.CATALOG !== 'off') {
  const catalogStore = new CatalogStore(db)
  catalog = { store: catalogStore, cache: new CatalogCache(catalogStore) }
  await catalog.cache.refreshCount()
}
const server = await startServer(config, store, undefined, catalog)
console.log(`The Gathering Hall server on :${server.port} (${db.kind}; origens: ${config.allowedOrigins.join(', ')}${config.staticDir ? ' + mesma origem' : ''})`)

// Catalog: import Scryfall's bulk on start if the last import is old, then check every 6 hours
// (an import only happens when Scryfall published a new bulk file, about once a day).
let importTimer: ReturnType<typeof setInterval> | null = null
if (catalog) {
  const { store: cat, cache } = catalog
  const history = loadHistory(join(import.meta.dirname, '..', 'history', 'commander.json'))
  const run = () => runCatalogImport(cat, {
    fetchFn: (url, init) => fetch(url, init), rawDir: join(dataDir, 'raw'), now: () => new Date(), history,
    log: (m) => console.log(m),
  }).then((result) => (result.status === 'ok' ? cache.invalidate() : undefined))
    .catch((err) => console.error('catálogo: erro', err))
  const last = await cat.lastRun('ok')
  const stale = !last?.finishedAt || Date.now() - Date.parse(last.finishedAt) > 20 * 60 * 60 * 1000 || (await cat.cardFormat()) !== CARD_FORMAT
  if (stale) setTimeout(run, 5_000)
  importTimer = setInterval(run, 6 * 60 * 60 * 1000)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (importTimer) clearInterval(importTimer)
    await server.close()
    await db.close()
    process.exit(0)
  })
}
