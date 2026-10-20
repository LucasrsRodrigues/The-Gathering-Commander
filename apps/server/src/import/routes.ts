// POST /api/import/deck { url } → { deck } | { error, message }. No account needed; the same origin and a rate limit
// per IP (each call makes the server fetch another site).

import type { IncomingMessage, ServerResponse } from 'node:http'
import { importDeck, type ImportError } from './decks'

type Fetch = (url: string, init: RequestInit) => Promise<Response>

const MESSAGES: Record<ImportError, [number, string]> = {
  link: [400, 'Cole o link de um deck do Archidekt (archidekt.com/decks/…) ou do Moxfield (moxfield.com/decks/…).'],
  naoEncontrado: [404, 'Esse deck não foi encontrado. Confira o link.'],
  privado: [403, 'Esse deck é privado. Deixe-o público no site ou exporte a lista como texto e cole aqui.'],
  bloqueado: [502, 'O site não deixou o servidor ler o deck. Exporte a lista como texto lá e cole aqui.'],
  foraDoAr: [502, 'O site não respondeu agora. Tente de novo, ou exporte a lista como texto e cole aqui.'],
  formato: [502, 'A resposta do site veio num formato que não conhecemos. Exporte a lista como texto e cole aqui.'],
}

export interface ImportContext {
  sameOrigin: boolean
  allow: () => boolean
  fetchFn: Fetch
  json: (res: ServerResponse, status: number, body: unknown) => void
}

async function readSmall(req: IncomingMessage, max = 2048): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > max) return null
    chunks.push(chunk as Buffer)
  }
  try {
    const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function handleImport(req: IncomingMessage, res: ServerResponse, ctx: ImportContext) {
  if (req.method !== 'POST') return ctx.json(res, 405, { error: 'metodo', message: 'método não permitido' })
  if (!ctx.sameOrigin) return ctx.json(res, 403, { error: 'origem', message: 'origem não permitida' })
  if (!ctx.allow()) return ctx.json(res, 429, { error: 'limite', message: 'Muitas importações seguidas; tente em um minuto.' })
  const body = await readSmall(req)
  const result = await importDeck(body?.url, ctx.fetchFn)
  if (result.ok) return ctx.json(res, 200, { deck: result.deck })
  const [status, message] = MESSAGES[result.error]
  ctx.json(res, status, { error: result.error, message })
}
