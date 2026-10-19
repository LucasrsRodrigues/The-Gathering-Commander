// Entry point. Configuration comes from the environment (see DEPLOY.md).

import { dirname, join } from 'node:path'
import { loadHistory } from './catalog/history'
import { runCatalogImport } from './catalog/ingest'
import { CatalogCache } from './catalog/lookup'
import { CARD_FORMAT } from './catalog/normalize'
import { CatalogStore } from './catalog/store'
import { openDatabase, type Db } from './db'
import { DEFAULT_CONFIG, startServer, type ServerCatalog } from './server'
import { AccountStore } from './auth/accounts'
import { providersFromEnv } from './auth/providers'
import { AuthService } from './auth/routes'
import { importLegacyRooms } from './legacy'
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

// First start after the move to Postgres: bring over the rooms of the old SQLite file, once.
const legacy = await importLegacyRooms(db, store, env.DB_PATH ?? join(dataDir, 'rooms.db')).catch((err) => {
  console.error('salas antigas: não foi possível copiar do SQLite', err)
  return null
})
if (legacy) console.log(`salas antigas: ${legacy.copied} copiada(s) do SQLite${legacy.skipped ? `, ${legacy.skipped} ignorada(s)` : ''}`)

// The full catalog needs a real Postgres: PGlite holds it all in WebAssembly memory (about 1.5 GB during an import).
// Without DATABASE_URL the catalog stays off unless CATALOG=on; the app then uses Scryfall directly, as it already can.
const catalogOn = env.CATALOG ? env.CATALOG !== 'off' : db.kind === 'postgres'
if (db.kind === 'pglite') {
  console.warn('banco: sem DATABASE_URL, usando PGlite local (bom para desenvolvimento; em produção, configure o Postgres).')
  if (!env.CATALOG) console.warn('catálogo: desligado com PGlite (defina DATABASE_URL, ou CATALOG=on se houver ~2 GB de memória).')
}
let catalog: ServerCatalog | null = null
if (catalogOn) {
  const catalogStore = new CatalogStore(db)
  catalog = { store: catalogStore, cache: new CatalogCache(catalogStore) }
  await catalog.cache.refreshCount()
}
// Optional accounts (épico 08): on when at least one provider has its keys, plus PUBLIC_URL and SESSION_SECRET.
const providers = providersFromEnv(env)
let auth: AuthService | null = null
if (providers.length) {
  if (!env.PUBLIC_URL || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    console.warn('contas: desligadas (defina PUBLIC_URL e SESSION_SECRET com 32+ caracteres para ligar o login).')
  } else {
    auth = new AuthService(new AccountStore(db), { publicUrl: env.PUBLIC_URL, appUrl: env.APP_URL, sessionSecret: env.SESSION_SECRET, providers })
    console.log(`contas: login com ${providers.map((p) => p.id).join(' e ')}`)
  }
}
const server = await startServer(config, store, undefined, catalog, auth)
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
