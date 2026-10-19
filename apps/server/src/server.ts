// HTTP + WebSocket adapter around RoomCore. One process holds every live room in memory as an actor;
// Node runs handlers one at a time, so each room sees its messages in a total order. Every change is
// persisted to SQLite before replies go out, so a restart never loses a game.

import { createHash, randomBytes, randomInt } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { decodeClientMessage, MAX_MESSAGE_BYTES, ROOM_ID, serverError, type ServerMessage } from '@gathering-hall/protocol'
import { WebSocketServer, type WebSocket } from 'ws'
import { TokenBucket, WindowLimiter } from './limits'
import { Room, type Outgoing, type RoomDeps } from './room/room'
import type { RoomStore } from './store'

export interface ServerConfig {
  port: number
  allowedOrigins: string[] // exact origins of the web app, e.g. https://jogar.example.com
  roomTtlMs: number
  maxRooms: number
  roomsPerIpPerHour: number
  trustProxy: boolean // read the client IP from X-Forwarded-For (behind Caddy)
}

export const DEFAULT_CONFIG: ServerConfig = {
  port: 8787,
  allowedOrigins: ['http://localhost:5180', 'http://localhost:5173'],
  roomTtlMs: 24 * 60 * 60 * 1000,
  maxRooms: 500,
  roomsPerIpPerHour: 20,
  trustProxy: false,
}

const MESSAGES_PER_SECOND = 20
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

export function startServer(config: ServerConfig, store: RoomStore, deps: RoomDeps = cryptoDeps): Promise<RunningServer> {
  const rooms = new Map<string, Room>()
  const sockets = new Map<string, WebSocket>() // connId → socket
  const creation = new WindowLimiter(config.roomsPerIpPerHour, 60 * 60 * 1000)
  let nextConn = 0
  let closing = false // during shutdown, sockets closing must not touch the store anymore

  const getRoom = (id: string): Room | undefined => {
    let room = rooms.get(id)
    if (!room) {
      const snap = store.load(id)
      if (snap) rooms.set(id, (room = new Room(snap, deps)))
    }
    return room
  }

  const deliver = (room: Room, out: Outgoing[]) => {
    if (closing) return
    store.save(room.snapshot())
    for (const { to, msg } of out) send(sockets.get(to), msg)
  }

  const clientIp = (req: IncomingMessage) =>
    (config.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '') || req.socket.remoteAddress || '?'

  const originAllowed = (origin: string | undefined) => !!origin && config.allowedOrigins.includes(origin)

  // ---- HTTP: create rooms, health ----
  const http = createHttpServer((req, res) => {
    const origin = req.headers.origin
    if (originAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin!)
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST')
      res.setHeader('Access-Control-Max-Age', '600')
      return end(res, 204)
    }
    if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size })
    if (req.method === 'POST' && req.url === '/api/rooms') {
      if (!originAllowed(origin)) return json(res, 403, { error: 'origem não permitida' })
      if (!creation.allow(clientIp(req), deps.now())) return json(res, 429, { error: 'Muitas salas criadas; tente mais tarde.' })
      if (store.count() >= config.maxRooms) return json(res, 503, { error: 'O servidor está cheio; tente mais tarde.' })
      const id = randomBytes(16).toString('base64url')
      const { room, hostToken } = Room.create(id, deps)
      rooms.set(id, room)
      store.save(room.snapshot())
      return json(res, 201, { room: id, token: hostToken })
    }
    return json(res, 404, { error: 'não encontrado' })
  })

  // ---- WebSocket: one connection = one seat or spectator in one room ----
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const roomId = url.searchParams.get('room') ?? ''
    if (url.pathname !== '/ws' || !originAllowed(req.headers.origin) || !ROOM_ID.test(roomId)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      return socket.destroy()
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, roomId))
  })

  function onConnection(ws: WebSocket, roomId: string) {
    const room = getRoom(roomId)
    if (!room) {
      send(ws, serverError('noRoom', 'Essa sala não existe ou expirou.'))
      return ws.close(4404)
    }
    const connId = `c${++nextConn}`
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
      deliver(room, room.receive(connId, decoded.msg))
    })
    ws.on('close', () => {
      clearInterval(heartbeat)
      sockets.delete(connId)
      deliver(room, room.disconnect(connId))
    })
  }

  // ---- Expiry: rooms idle for longer than the TTL and with nobody connected are deleted ----
  const sweeper = setInterval(() => {
    const now = deps.now()
    creation.sweep(now)
    for (const id of store.expired(now - config.roomTtlMs)) {
      const live = rooms.get(id)
      if (live && live.connectionCount > 0) continue
      rooms.delete(id)
      store.delete(id)
    }
  }, 10 * 60 * 1000)

  return new Promise((resolve) => {
    http.listen(config.port, () => {
      resolve({
        port: (http.address() as AddressInfo).port,
        close: () => new Promise<void>((done) => {
          closing = true
          clearInterval(sweeper)
          for (const ws of wss.clients) ws.terminate()
          wss.close()
          http.close(() => done())
        }),
      })
    })
  })
}

function send(ws: WebSocket | undefined, msg: ServerMessage) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}

function end(res: ServerResponse, status: number) {
  res.writeHead(status)
  res.end()
}
