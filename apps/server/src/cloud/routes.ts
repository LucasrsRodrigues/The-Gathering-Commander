// Cloud sync API (épico 08, req. 11–15). Signed in only; writes also need the same origin.
//   GET    /api/sync?since=<ms>             changes after `since` (server time) and the next `since`
//   PUT    /api/decks/:id   { data, updatedAt }   200 { doc } | 409 { doc } (the server's newer version) | 413 | 422
//   DELETE /api/decks/:id   { updatedAt }         tombstone, same rule
//   (the same for /api/presets/:id)

import type { IncomingMessage, ServerResponse } from 'node:http'
import { decodePreset, hasV2Content, isLegacyDeck, sanitizeDeck } from '@gathering-hall/formats'
import type { AuthService } from '../auth/routes'
import { MAX_DOC_BYTES, type CloudStore, type DocKind } from './store'

const ID = /^[A-Za-z0-9_-]{1,64}$/

export interface CloudContext {
  sameOrigin: boolean
  now: number
  allow: (userId: string) => boolean // per-account rate limit
  json: (res: ServerResponse, status: number, body: unknown) => void
}

// The document as the app would store it, or null when it is not valid for that kind and id.
function validate(kind: DocKind, id: string, data: unknown): unknown | null {
  if (kind === 'deck') {
    const deck = sanitizeDeck(data)
    return deck && deck.id === id ? deck : null
  }
  const decoded = decodePreset(JSON.stringify({ kind: 'gathering-hall/preset', v: 1, preset: data }))
  return decoded.ok && decoded.preset.id === id ? decoded.preset : null
}

export async function handleCloud(auth: AuthService, store: CloudStore, req: IncomingMessage, res: ServerResponse, ctx: CloudContext): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://x')
  const doc = /^\/api\/(decks|presets)\/([^/]+)$/.exec(url.pathname)
  if (url.pathname !== '/api/sync' && !doc) return false
  const account = await auth.accountFor(req)
  if (!account) {
    ctx.json(res, 401, { error: 'entre na conta para sincronizar' })
    return true
  }
  if (!ctx.allow(account.id)) {
    ctx.json(res, 429, { error: 'Muitas sincronizações; tente em instantes.' })
    return true
  }

  if (url.pathname === '/api/sync' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since') ?? 0)
    ctx.json(res, 200, await store.changesSince(account.id, Number.isFinite(since) && since > 0 ? since : 0, ctx.now))
    return true
  }
  if (!doc || (req.method !== 'PUT' && req.method !== 'DELETE')) {
    ctx.json(res, 405, { error: 'método não permitido' })
    return true
  }
  if (!ctx.sameOrigin) {
    ctx.json(res, 403, { error: 'origem não permitida' })
    return true
  }
  const kind: DocKind = doc[1] === 'decks' ? 'deck' : 'preset'
  const id = decodeURIComponent(doc[2]!)
  if (!ID.test(id)) {
    ctx.json(res, 400, { error: 'id inválido' })
    return true
  }
  const body = await readBody(req, MAX_DOC_BYTES[kind])
  if (body === 'tooBig') {
    ctx.json(res, 413, { error: 'documento grande demais' })
    return true
  }
  const updatedAt = body?.updatedAt
  if (!body || typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) {
    ctx.json(res, 400, { error: 'envie { data, updatedAt }' })
    return true
  }
  let data: unknown | null = null
  if (req.method === 'PUT') {
    data = validate(kind, id, body.data)
    if (data === null) {
      ctx.json(res, 422, { error: kind === 'deck' ? 'deck inválido' : 'regras inválidas' })
      return true
    }
  }
  // A deck from an app older than épico 10 (v1) never replaces one with categories, Talvez, folder or history: the
  // device gets the stored version back (409), as with a newer edit, and nothing is lost.
  const keepOver = kind === 'deck' && req.method === 'PUT' && isLegacyDeck(body.data)
    ? (stored: unknown) => { const deck = sanitizeDeck(stored); return !!deck && hasV2Content(deck) }
    : undefined
  const result = await store.put(account.id, kind, id, data, updatedAt, ctx.now, keepOver)
  if (result.status === 'limit') ctx.json(res, 409, { error: kind === 'deck' ? 'Limite de 500 decks na conta.' : 'Limite de 100 regras da casa na conta.', limit: true })
  else ctx.json(res, result.status === 'ok' ? 200 : 409, { doc: result.doc })
  return true
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown> | null | 'tooBig'> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > maxBytes + 1024) return 'tooBig'
    chunks.push(chunk as Buffer)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}
