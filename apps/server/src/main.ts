// Entry point. Configuration comes from the environment (see .env.example and DEPLOY.md).

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
}

const store = new SqliteRoomStore(env.DB_PATH ?? './data/rooms.db')
const server = await startServer(config, store)
console.log(`The Gathering Hall server on :${server.port} (origens: ${config.allowedOrigins.join(', ')})`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.close()
    store.close()
    process.exit(0)
  })
}
