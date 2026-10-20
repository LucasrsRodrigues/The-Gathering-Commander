// Public deck links (épico 10, req. 25–28):
//   PUT    /api/decks/:id/share     the deck's link (created if needed)    account + same origin
//   DELETE /api/decks/:id/share     turns it off                            account + same origin
//   GET    /api/shares              the account's links                     account
//   GET    /api/public/decks/:slug  the deck as the public page shows it    anyone (rate limited per IP)

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthService } from '../auth/routes'
import type { ShareStore } from './store'

const DECK_ID = /^[A-Za-z0-9_-]{1,64}$/

export interface ShareContext {
  sameOrigin: boolean
  now: number
  allowAccount: (userId: string) => boolean
  allowPublic: () => boolean
  json: (res: ServerResponse, status: number, body: unknown) => void
}

export function isShareRoute(url: string): boolean {
  return /^\/api\/decks\/[^/]+\/share$/.test(url) || url === '/api/shares' || url.startsWith('/api/public/decks/')
}

export async function handleShare(auth: AuthService, store: ShareStore, req: IncomingMessage, res: ServerResponse, ctx: ShareContext): Promise<void> {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  const pub = /^\/api\/public\/decks\/([^/]+)$/.exec(path)
  if (pub) {
    if (req.method !== 'GET') return ctx.json(res, 405, { error: 'método não permitido' })
    if (!ctx.allowPublic()) return ctx.json(res, 429, { error: 'Muitas consultas; tente em instantes.' })
    const deck = await store.read(decodeURIComponent(pub[1]!))
    return deck ? ctx.json(res, 200, { deck }) : ctx.json(res, 404, { error: 'Esse link não existe ou foi desligado.' })
  }

  const account = await auth.accountFor(req)
  if (!account) return ctx.json(res, 401, { error: 'entre na conta para compartilhar decks' })
  if (!ctx.allowAccount(account.id)) return ctx.json(res, 429, { error: 'Muitas chamadas; tente em instantes.' })
  if (path === '/api/shares') {
    if (req.method !== 'GET') return ctx.json(res, 405, { error: 'método não permitido' })
    return ctx.json(res, 200, { shares: await store.list(account.id) })
  }
  const m = /^\/api\/decks\/([^/]+)\/share$/.exec(path)
  const deckId = m ? decodeURIComponent(m[1]!) : ''
  if (!m || !DECK_ID.test(deckId)) return ctx.json(res, 400, { error: 'deck inválido' })
  if (req.method !== 'PUT' && req.method !== 'DELETE') return ctx.json(res, 405, { error: 'método não permitido' })
  if (!ctx.sameOrigin) return ctx.json(res, 403, { error: 'origem não permitida' })
  if (req.method === 'DELETE') {
    await store.unshare(account.id, deckId)
    return ctx.json(res, 200, { ok: true })
  }
  const result = await store.share(account.id, deckId, ctx.now)
  if (!result.ok) return ctx.json(res, 409, { error: 'O deck ainda não está na nuvem. Espere a sincronização e tente de novo.' })
  ctx.json(res, 200, { slug: result.slug })
}
