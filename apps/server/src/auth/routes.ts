// Login routes (épico 08, req. 5–8):
//   GET  /api/auth/providers            which buttons to show (only configured providers)
//   GET  /api/auth/:provider/start      → redirect to the provider (state + PKCE in a signed cookie)
//   GET  /api/auth/:provider/callback   ← back from the provider: account, session cookie, redirect to /#/conta
//   GET  /api/me                        the logged-in account, or 401
//   POST /api/auth/logout               ends the session (same origin only)
//   GET  /api/me/export                 everything the server keeps about the account, as a JSON download
//   DELETE /api/me                      deletes the account for good (same origin, explicit confirmation)
// Every redirect goes to this site's own PUBLIC_URL: nothing in the request can choose where the browser lands.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Account, AccountStore } from './accounts'
import { SESSION_DAYS } from './accounts'
import { cookie, newOAuthState, OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE, readCookies, SESSION_COOKIE, signState, verifyState } from './cookies'
import { authorizeUrl, fetchProfile, type ProviderConfig } from './providers'

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export interface AuthConfig {
  publicUrl: string // where this server is reached, e.g. https://jogar.example.com (callbacks are built from it)
  appUrl?: string // where the browser goes after login; defaults to publicUrl (same-origin deploy)
  sessionSecret: string
  providers: ProviderConfig[]
  fetchFn?: Fetch
  now?: () => number
}

export interface AuthContext {
  sameOrigin: boolean // the request's Origin is this site (checked by the server)
  json: (res: ServerResponse, status: number, body: unknown) => void
}

export class AuthService {
  private readonly accounts: AccountStore
  private readonly config: AuthConfig
  private readonly secure: boolean

  constructor(accounts: AccountStore, config: AuthConfig) {
    this.accounts = accounts
    const trim = (u: string) => u.replace(/\/+$/, '')
    this.config = { ...config, publicUrl: trim(config.publicUrl), appUrl: trim(config.appUrl ?? config.publicUrl) }
    this.secure = this.config.publicUrl.startsWith('https://')
  }

  get enabled(): boolean {
    return this.config.providers.length > 0
  }

  async accountFor(req: IncomingMessage): Promise<Account | null> {
    const token = readCookies(req)[SESSION_COOKIE]
    return token ? this.accounts.accountForSession(token) : null
  }

  // Returns true when the request was an auth route (answered).
  async handle(req: IncomingMessage, res: ServerResponse, ctx: AuthContext): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = url.pathname
    if (req.method === 'GET' && path === '/api/auth/providers') {
      ctx.json(res, 200, { providers: this.config.providers.map((p) => p.id) })
      return true
    }
    if (req.method === 'GET' && path === '/api/me') {
      const account = await this.accountFor(req)
      ctx.json(res, account ? 200 : 401, { account })
      return true
    }
    if (path === '/api/me/export' && req.method === 'GET') {
      const account = await this.accountFor(req)
      if (!account) {
        ctx.json(res, 401, { error: 'entre na conta para exportar' })
        return true
      }
      const data = await this.accounts.exportAccount(account.id)
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="gathering-hall-minha-conta.json"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(JSON.stringify(data, null, 2))
      return true
    }
    if (path === '/api/me' && req.method === 'DELETE') {
      if (!ctx.sameOrigin) {
        ctx.json(res, 403, { error: 'origem não permitida' })
        return true
      }
      const account = await this.accountFor(req)
      if (!account) {
        ctx.json(res, 401, { error: 'entre na conta para excluir' })
        return true
      }
      const body = await readJson(req)
      if (!body || body.confirm !== 'excluir minha conta') {
        ctx.json(res, 400, { error: 'confirme digitando "excluir minha conta"' })
        return true
      }
      await this.accounts.deleteAccount(account.id)
      res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0, path: '/', secure: this.secure }))
      ctx.json(res, 200, { ok: true })
      return true
    }
    if (req.method === 'POST' && path === '/api/auth/logout') {
      if (!ctx.sameOrigin) {
        ctx.json(res, 403, { error: 'origem não permitida' })
        return true
      }
      const token = readCookies(req)[SESSION_COOKIE]
      if (token) await this.accounts.endSession(token)
      res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0, path: '/', secure: this.secure }))
      ctx.json(res, 200, { ok: true })
      return true
    }
    const m = /^\/api\/auth\/([a-z]+)\/(start|callback)$/.exec(path)
    if (req.method !== 'GET' || !m) return false
    const provider = this.config.providers.find((p) => p.id === m[1])
    if (!provider) {
      ctx.json(res, 404, { error: 'login por esse provedor não está ligado' })
      return true
    }
    if (m[2] === 'start') await this.start(provider, req, res)
    else await this.callback(provider, url, req, res)
    return true
  }

  private redirectUri(p: ProviderConfig) {
    return `${this.config.publicUrl}/api/auth/${p.id}/callback`
  }

  private now() {
    return (this.config.now ?? Date.now)()
  }

  private redirect(res: ServerResponse, to: string, cookies: string[] = []) {
    res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) })
    res.end()
  }

  private async start(p: ProviderConfig, req: IncomingMessage, res: ServerResponse) {
    const loggedIn = !!(await this.accountFor(req))
    const { data, challenge } = newOAuthState(p.id, loggedIn, this.now())
    this.redirect(res, authorizeUrl(p, this.redirectUri(p), data.state, challenge), [
      cookie(OAUTH_COOKIE, signState(data, this.config.sessionSecret), { maxAge: OAUTH_COOKIE_MAX_AGE, path: '/api/auth', secure: this.secure }),
    ])
  }

  private async callback(p: ProviderConfig, url: URL, req: IncomingMessage, res: ServerResponse) {
    const clear = cookie(OAUTH_COOKIE, '', { maxAge: 0, path: '/api/auth', secure: this.secure })
    const fail = (reason: string) => this.redirect(res, `${this.config.appUrl}/#/conta?erro=${reason}`, [clear])
    const saved = verifyState(readCookies(req)[OAUTH_COOKIE], this.config.sessionSecret, this.now())
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    if (!saved || saved.provider !== p.id || !state || state !== saved.state) return fail('sessao-expirada')
    if (url.searchParams.get('error') || !code) return fail('cancelado')

    let profile
    try {
      profile = await fetchProfile(p, code, saved.verifier, this.redirectUri(p), this.config.fetchFn ?? ((u, i) => fetch(u, i)))
    } catch {
      return fail('provedor')
    }
    const current = saved.link ? await this.accountFor(req) : null
    const result = await this.accounts.signIn(profile, current?.id ?? null)
    if ('error' in result) return fail('conta-em-uso')
    // Linking keeps the current session; a fresh sign-in starts one.
    const cookies = [clear]
    if (!current) {
      const token = await this.accounts.createSession(result.userId)
      cookies.push(cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 24 * 60 * 60, path: '/', secure: this.secure }))
    }
    this.redirect(res, `${this.config.appUrl}/#/conta`, cookies)
  }
}

const MAX_BODY = 4 * 1024

// Small JSON bodies only (a confirmation); anything bigger or malformed is null.
async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) return null
    chunks.push(chunk as Buffer)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}
