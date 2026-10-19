// Read-only catalog API. Public data (same as Scryfall's), but still bounded: body size, list size,
// date format and a per-IP request window.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SqliteCatalogStore } from './store'

const MAX_BODY = 64 * 1024
const MAX_NAMES = 300
const DATE = /^\d{4}-\d{2}-\d{2}$/
const ORACLE_ID = /^[0-9a-f-]{36}$/i

type Json = (res: ServerResponse, status: number, body: unknown, cache?: string) => void

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// Returns true when the request was a catalog route (answered or rejected).
export async function handleCatalog(store: SqliteCatalogStore | null, req: IncomingMessage, res: ServerResponse, json: Json): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith('/api/catalog/')) return false
  if (!store) {
    json(res, 503, { error: 'catálogo desligado neste servidor' })
    return true
  }
  const at = url.searchParams.get('at') ?? today()
  if (!DATE.test(at)) {
    json(res, 400, { error: 'data inválida (use AAAA-MM-DD)' })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/catalog/status') {
    json(res, 200, { cards: store.cardCount(), since: store.firstImportDate(), lastRun: store.lastRun() }, 'no-store')
    return true
  }
  if (req.method === 'POST' && url.pathname === '/api/catalog/resolve') {
    const body = await readBody(req)
    let names: unknown
    try {
      names = body === null ? null : (JSON.parse(body) as { names?: unknown }).names
    } catch {
      names = null
    }
    if (!Array.isArray(names) || names.length > MAX_NAMES || !names.every((n) => typeof n === 'string' && n.length > 0 && n.length <= 200)) {
      json(res, 400, { error: `envie { names: [...] } com até ${MAX_NAMES} nomes` })
      return true
    }
    json(res, 200, { cards: [...store.resolveNames(names as string[]).values()] }, 'no-store')
    return true
  }
  const oracle = /^\/api\/catalog\/oracle\/([^/]+)$/.exec(url.pathname)
  if (req.method === 'GET' && oracle) {
    if (!ORACLE_ID.test(oracle[1]!)) {
      json(res, 400, { error: 'oracle id inválido' })
      return true
    }
    const card = store.oracleAt(oracle[1]!, at)
    json(res, card ? 200 : 404, card ?? { error: 'sem versão nessa data' }, at < today() ? 'public, max-age=86400' : 'public, max-age=3600')
    return true
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/commander') {
    json(res, 200, store.commanderAt(at), at < today() ? 'public, max-age=86400' : 'public, max-age=3600')
    return true
  }
  json(res, 404, { error: 'não encontrado' })
  return true
}
