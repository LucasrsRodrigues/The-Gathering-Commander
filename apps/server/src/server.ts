// HTTP + WebSocket adapter around RoomCore. One process holds every live room in memory as an actor. Each room has
// a queue: loading it, preparing what a message needs from the catalog, handling the message and saving the snapshot
// happen in order for that room (épico 08: the database is async), and replies go out only after the save, so a
// restart never loses a game.

import { createHash, randomBytes, randomInt } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { decodeClientMessage, MAX_MESSAGE_BYTES, ROOM_ID, serverError, type ServerMessage } from '@gathering-hall/protocol'
import { WebSocketServer, type WebSocket } from 'ws'
import { TokenBucket, WindowLimiter } from './limits'
import { securityHeaders, serveStatic } from './static'
import { Room, type Outgoing, type RoomDeps } from './room/room'
import type { RoomStore } from './store'
import { resolvePreset } from '@gathering-hall/formats'
import type { ClientMessage } from '@gathering-hall/protocol'
import { makeRulesFiller } from './catalog/cardRules'
import { makeDeckChecker } from './catalog/deckCheck'
import type { CatalogCache } from './catalog/lookup'
import { handleCatalog } from './catalog/routes'
import type { AuthService } from './auth/routes'
import { handleCloud } from './cloud/routes'
import type { CloudStore } from './cloud/store'
import type { CatalogStore } from './catalog/store'
import { handleGames } from './games/routes'
import type { GameStore } from './games/store'

export interface ServerCatalog {
  store: CatalogStore
  cache: CatalogCache
}

export interface ServerConfig {
  port: number
  allowedOrigins: string[] // exact origins of the web app, e.g. https://jogar.example.com
  roomTtlMs: number
  maxRooms: number
  roomsPerIpPerHour: number
  trustProxy: boolean // read the client IP / host / protocol from X-Forwarded-* (behind Caddy, Traefik…)
  staticDir: string | null // built web app to serve from the same origin (single-container deploys)
  catalogRequestsPerMinute: number
}

export const DEFAULT_CONFIG: ServerConfig = {
  port: 8787,
  allowedOrigins: ['http://localhost:5180', 'http://localhost:5173'],
  roomTtlMs: 24 * 60 * 60 * 1000,
  maxRooms: 500,
  roomsPerIpPerHour: 20,
  trustProxy: false,
  staticDir: null,
  catalogRequestsPerMinute: 300,
}

const MESSAGES_PER_SECOND = 20
export const CONNECTION_LIMITS = { perIp: 30, total: 3_000 }
const HEARTBEAT_MS = 30_000

export const cryptoDeps: RoomDeps = {
  newToken: () => randomBytes(16).toString('base64url'),
  hash: (token) => createHash('sha256').update(token).digest('hex'),
  seed: () => randomInt(0, 2 ** 32 - 1),
  now: () => Date.now(),
}

export interface RunningServer {
  port: number
  close(): Promise<void>
}

export function startServer(
  config: ServerConfig, store: RoomStore, baseDeps: RoomDeps = cryptoDeps, catalog: ServerCatalog | null = null, auth: AuthService | null = null,
  cloud: CloudStore | null = null, games: GameStore | null = null,
): Promise<RunningServer> {
  const deps: RoomDeps = catalog
    ? { checkDeck: makeDeckChecker(catalog.cache), cardRules: makeRulesFiller(catalog.cache), ...baseDeps }
    : baseDeps
  const rooms = new Map<string, Room>()
  const sockets = new Map<string, WebSocket>() // connId → socket
  const connectionsByIp = new Map<string, number>()
  const creation = new WindowLimiter(config.roomsPerIpPerHour, 60 * 60 * 1000)
  const catalogLimit = new WindowLimiter(config.catalogRequestsPerMinute, 60 * 1000)
  const loginLimit = new WindowLimiter(20, 60 * 1000) // login starts and callbacks per IP per minute
  const accountLimit = new WindowLimiter(120, 60 * 1000) // any account route per IP per minute (me, export, delete)
  const cloudLimit = new WindowLimiter(120, 60 * 1000) // cloud requests per account per minute
  let nextConn = 0
  let closing = false // during shutdown, sockets closing must not touch the store anymore

  // One promise chain per room: tasks for the same room run in order, other rooms are not held up.
  const queues = new Map<string, Promise<void>>()
  const enqueue = (roomId: string, task: () => Promise<void>): Promise<void> => {
    const next = (queues.get(roomId) ?? Promise.resolve()).then(task).catch((err) => {
      console.error(`sala ${roomId}:`, err instanceof Error ? err.message : err)
    })
    queues.set(roomId, next)
    void next.finally(() => {
      if (queues.get(roomId) === next) queues.delete(roomId)
    })
    return next
  }

  const getRoom = async (id: string): Promise<Room | undefined> => {
    let room = rooms.get(id)
    if (!room) {
      const snap = await store.load(id)
      if (snap && !rooms.has(id)) rooms.set(id, new Room(snap, deps))
      room = rooms.get(id)
    }
    return room
  }

  const deliver = async (room: Room, out: Outgoing[]) => {
    if (closing) return
    await store.save(room.snapshot())
    for (const { to, msg } of out) send(sockets.get(to), msg)
  }

  // The room core reads the catalog synchronously: fetch what this message needs into the cache first.
  const prepare = async (room: Room, msg: ClientMessage) => {
    if (!catalog) return
    const snap = room.snapshot()
    if (msg.t === 'sit') {
      const asOf = resolvePreset(snap.preset).deckRules.banlist.asOf
      await catalog.cache.warm([...msg.deck.commanders, ...msg.deck.cards].map((c) => c.name), [asOf])
    } else if (msg.t === 'configure') {
      const names = snap.seats.flatMap((seat) => (seat ? [...seat.deck.commanders, ...seat.deck.cards].map((c) => c.name) : []))
      await catalog.cache.warm(names, [resolvePreset(msg.preset).deckRules.banlist.asOf])
    }
  }

  const forwarded = (req: IncomingMessage, name: string) =>
    config.trustProxy ? String(req.headers[name] ?? '').split(',')[0]?.trim() || undefined : undefined
  const isHttps = (req: IncomingMessage) => forwarded(req, 'x-forwarded-proto') === 'https'
  const clientIp = (req: IncomingMessage) => forwarded(req, 'x-forwarded-for') || req.socket.remoteAddress || '?'

  // Listed origins, plus the server's own origin when it also serves the web app (same-origin deploy).
  const originAllowed = (origin: string | undefined, req: IncomingMessage) => {
    if (!origin) return false
    if (config.allowedOrigins.includes(origin)) return true
    if (!config.staticDir) return false
    try {
      return new URL(origin).host === (forwarded(req, 'x-forwarded-host') ?? req.headers.host)
    } catch {
      return false
    }
  }

  // ---- HTTP: create rooms, health ----
  const http = createHttpServer((req, res) => {
    const origin = req.headers.origin
    if (originAllowed(origin, req)) {
      res.setHeader('Access-Control-Allow-Origin', origin!)
      res.setHeader('Access-Control-Allow-Credentials', 'true') // the session cookie, for the dev app on another port
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Max-Age', '600')
      return end(res, 204)
    }
    if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size, catalog: catalog?.cache.cardCount() ?? 0 })
    if (req.url?.startsWith('/api/auth/') || req.url === '/api/me' || req.url?.startsWith('/api/me/')) {
      if (!auth) {
        if (req.url === '/api/auth/providers') return json(res, 200, { providers: [] })
        return json(res, 404, { error: 'contas desligadas neste servidor' })
      }
      const ip = clientIp(req)
      if (/\/(start|callback)(\?|$)/.test(req.url) && !loginLimit.allow(ip, deps.now())) return json(res, 429, { error: 'Muitas tentativas de login; tente em instantes.' })
      if (!accountLimit.allow(ip, deps.now())) return json(res, 429, { error: 'Muitas chamadas; tente em instantes.' })
      auth.handle(req, res, { sameOrigin: originAllowed(origin, req), json })
        .then((handled) => handled || json(res, 404, { error: 'não encontrado' }))
        .catch(() => json(res, 500, { error: 'erro no login' }))
      return
    }
    if (req.url?.startsWith('/api/sync') || req.url?.startsWith('/api/decks/') || req.url?.startsWith('/api/presets/')) {
      if (!auth || !cloud) return json(res, 404, { error: 'contas desligadas neste servidor' })
      handleCloud(auth, cloud, req, res, { sameOrigin: originAllowed(origin, req), now: deps.now(), allow: (id) => cloudLimit.allow(id, deps.now()), json })
        .then((handled) => handled || json(res, 404, { error: 'não encontrado' }))
        .catch(() => json(res, 500, { error: 'erro na nuvem' }))
      return
    }
    if (req.url === '/api/games' || req.url?.startsWith('/api/games?')) {
      if (!auth || !games) return json(res, 404, { error: 'contas desligadas neste servidor' })
      handleGames(auth, games, req, res, { allow: (id) => cloudLimit.allow(id, deps.now()), json })
        .catch(() => json(res, 500, { error: 'erro no histórico' }))
      return
    }
    if (req.url?.startsWith('/api/catalog/')) {
      if (!catalogLimit.allow(clientIp(req), deps.now())) return json(res, 429, { error: 'Muitas consultas; tente em instantes.' })
      handleCatalog(catalog?.store ?? null, req, res, json).catch(() => json(res, 500, { error: 'erro no catálogo' }))
      return
    }
    if (req.method === 'POST' && req.url === '/api/rooms') {
      if (!originAllowed(origin, req)) return json(res, 403, { error: 'origem não permitida' })
      if (!creation.allow(clientIp(req), deps.now())) return json(res, 429, { error: 'Muitas salas criadas; tente mais tarde.' })
      void (async () => {
        if ((await store.count()) >= config.maxRooms) return json(res, 503, { error: 'O servidor está cheio; tente mais tarde.' })
        const id = randomBytes(16).toString('base64url')
        const host = auth ? await auth.accountFor(req).catch(() => null) : null
        const { room, hostToken } = Room.create(id, deps, host?.id ?? null)
        rooms.set(id, room)
        await store.save(room.snapshot())
        json(res, 201, { room: id, token: hostToken })
      })().catch(() => json(res, 500, { error: 'Não foi possível criar a sala.' }))
      return
    }
    if (config.staticDir && !req.url?.startsWith('/api/') && serveStatic(config.staticDir, req, res, isHttps(req))) return
    securityHeaders(res, isHttps(req))
    return json(res, 404, { error: 'não encontrado' })
  })

  // ---- WebSocket: one connection = one seat or spectator in one room ----
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const roomId = url.searchParams.get('room') ?? ''
    if (url.pathname !== '/ws' || !originAllowed(req.headers.origin, req) || !ROOM_ID.test(roomId)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      return socket.destroy()
    }
    // Per-IP and global caps: the per-connection rate limit alone would allow thousands of sockets.
    const ip = clientIp(req)
    if (sockets.size >= CONNECTION_LIMITS.total || (connectionsByIp.get(ip) ?? 0) >= CONNECTION_LIMITS.perIp) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
      return socket.destroy()
    }
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1)
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.once('close', () => {
        const n = (connectionsByIp.get(ip) ?? 1) - 1
        if (n > 0) connectionsByIp.set(ip, n)
        else connectionsByIp.delete(ip)
      })
      onConnection(ws, roomId, req)
    })
  })

  function onConnection(ws: WebSocket, roomId: string, req: IncomingMessage) {
    const connId = `c${++nextConn}`
    let room: Room | undefined
    let userId: string | null = null // the session cookie's account, if any: the room only sees this opaque id
    // Listeners go on at once (messages may arrive while the room loads); the room queue keeps the order.
    void enqueue(roomId, async () => {
      userId = auth ? ((await auth.accountFor(req).catch(() => null))?.id ?? null) : null
      room = await getRoom(roomId)
      if (room) return
      send(ws, serverError('noRoom', 'Essa sala não existe ou expirou.'))
      ws.close(4404)
    })
    sockets.set(connId, ws)
    const bucket = new TokenBucket(MESSAGES_PER_SECOND, MESSAGES_PER_SECOND, deps.now())
    let alive = true
    ws.on('pong', () => (alive = true))
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate()
      alive = false
      ws.ping()
    }, HEARTBEAT_MS)

    ws.on('message', (data, isBinary) => {
      if (isBinary) return send(ws, serverError('badMessage', 'Só mensagens de texto.'))
      if (!bucket.take(deps.now())) return send(ws, serverError('rateLimited', 'Devagar: muitas mensagens.'))
      const decoded = decodeClientMessage(data.toString())
      if (!decoded.ok) return send(ws, serverError('badMessage', decoded.error))
      if (decoded.msg.t === 'hello' && decoded.msg.room !== roomId) return send(ws, serverError('noRoom', 'Sala diferente da conexão.'))
      const msg = decoded.msg
      void enqueue(roomId, async () => {
        if (!room || closing) return
        await prepare(room, msg)
        const wasPlaying = room.snapshot().status === 'playing'
        const out = room.receive(connId, msg, userId)
        await deliver(room, out)
        // A game just ended: record it in the history. The replies already went out; staying in the room queue means
        // a shutdown waits for the record, and a failure only costs the history entry.
        if (games && wasPlaying && room.snapshot().status === 'ended') {
          await games.record(room.snapshot(), deps.now()).catch((err) => console.error(`histórico, sala ${roomId}:`, err))
        }
      })
    })
    ws.on('close', () => {
      clearInterval(heartbeat)
      sockets.delete(connId)
      void enqueue(roomId, async () => {
        if (room) await deliver(room, room.disconnect(connId))
      })
    })
  }

  // ---- Expiry: rooms idle for longer than the TTL and with nobody connected are deleted ----
  const sweep = async () => {
    const now = deps.now()
    creation.sweep(now)
    catalogLimit.sweep(now)
    loginLimit.sweep(now)
    accountLimit.sweep(now)
    await auth?.sweep().catch(() => {})
    cloudLimit.sweep(now)
    for (const id of await store.expired(now - config.roomTtlMs)) {
      await enqueue(id, async () => {
        const live = rooms.get(id)
        if (live && live.connectionCount > 0) return
        rooms.delete(id)
        await store.delete(id)
      })
    }
  }
  const sweeper = setInterval(() => void sweep().catch(() => {}), 10 * 60 * 1000)

  return new Promise((resolve) => {
    http.listen(config.port, () => {
      resolve({
        port: (http.address() as AddressInfo).port,
        close: async () => {
          closing = true
          clearInterval(sweeper)
          for (const ws of wss.clients) ws.terminate()
          wss.close()
          await new Promise<void>((done) => http.close(() => done()))
          await Promise.all(queues.values()) // nothing half-written when the database closes
        },
      })
    })
  })
}

function send(ws: WebSocket | undefined, msg: ServerMessage) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function json(res: ServerResponse, status: number, body: unknown, cache = 'no-store') {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}

function end(res: ServerResponse, status: number) {
  res.writeHead(status)
  res.end()
}
