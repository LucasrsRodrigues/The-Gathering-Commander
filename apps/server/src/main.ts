// Entry point. Configuration comes from the environment (see DEPLOY.md).

import { dirname, join } from 'node:path'
import { loadHistory } from './catalog/history'
import { runCatalogImport } from './catalog/ingest'
import { SqliteCatalogStore } from './catalog/store'
import { DEFAULT_CONFIG, startServer } from './server'
import { SqliteRoomStore } from './store'

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

const dbPath = env.DB_PATH ?? './data/rooms.db'
let store: SqliteRoomStore
let catalog: SqliteCatalogStore | null = null
try {
  store = new SqliteRoomStore(dbPath)
  if (env.CATALOG !== 'off') catalog = new SqliteCatalogStore(env.CATALOG_DB_PATH ?? join(dirname(dbPath), 'catalog.db'))
} catch (err) {
  console.error(`Não foi possível abrir os bancos em ${dirname(dbPath)}. A pasta existe e tem permissão de escrita?`, err)
  process.exit(1)
}
const server = await startServer(config, store, undefined, catalog)
console.log(`The Gathering Hall server on :${server.port} (origens: ${config.allowedOrigins.join(', ')}${config.staticDir ? ' + mesma origem' : ''})`)

// Catalog: import Scryfall's bulk on start if the last import is old, then check every 6 hours
// (an import only happens when Scryfall published a new bulk file, about once a day).
let importTimer: ReturnType<typeof setInterval> | null = null
if (catalog) {
  const cat = catalog
  const history = loadHistory(join(import.meta.dirname, '..', 'history', 'commander.json'))
  const run = () => runCatalogImport(cat, {
    fetchFn: (url, init) => fetch(url, init), rawDir: join(dirname(dbPath), 'raw'), now: () => new Date(), history,
    log: (m) => console.log(m),
  }).catch((err) => console.error('catálogo: erro', err))
  const last = cat.lastRun('ok')
  const stale = !last?.finishedAt || Date.now() - Date.parse(last.finishedAt) > 20 * 60 * 60 * 1000
  if (stale) setTimeout(run, 5_000)
  importTimer = setInterval(run, 6 * 60 * 60 * 1000)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (importTimer) clearInterval(importTimer)
    await server.close()
    store.close()
    catalog?.close()
    process.exit(0)
  })
}
