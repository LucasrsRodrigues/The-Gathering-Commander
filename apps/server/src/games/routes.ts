// "Minhas partidas" (épico 08, req. 19):
//   GET /api/games?cursor=   the signed-in account's finished games, newest first, PAGE_SIZE per page

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthService } from '../auth/routes'
import type { GameStore } from './store'

export interface GamesContext {
  allow: (userId: string) => boolean
  json: (res: ServerResponse, status: number, body: unknown) => void
}

export async function handleGames(auth: AuthService, store: GameStore, req: IncomingMessage, res: ServerResponse, ctx: GamesContext) {
  if (req.method !== 'GET') return ctx.json(res, 405, { error: 'método não permitido' })
  const account = await auth.accountFor(req)
  if (!account) return ctx.json(res, 401, { error: 'entre na conta para ver suas partidas' })
  if (!ctx.allow(account.id)) return ctx.json(res, 429, { error: 'Muitas consultas; tente em instantes.' })
  const cursor = new URL(req.url ?? '/', 'http://x').searchParams.get('cursor')
  ctx.json(res, 200, await store.forUser(account.id, cursor))
}
