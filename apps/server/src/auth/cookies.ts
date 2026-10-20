// Cookies (épico 08, req. 7): the session cookie and a short-lived, HMAC-signed cookie that carries the OAuth
// `state` and PKCE verifier between /start and /callback.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export const SESSION_COOKIE = 'gh_session'
export const OAUTH_COOKIE = 'gh_oauth'
const OAUTH_TTL_S = 10 * 60

export function readCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    const key = part.slice(0, i).trim()
    if (!key || key in out) continue
    // A malformed cookie from anything else on the domain must not break the login: it is just ignored.
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      continue
    }
  }
  return out
}

export function cookie(name: string, value: string, opts: { maxAge: number; path: string; secure: boolean }): string {
  return [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`, `Max-Age=${opts.maxAge}`, 'HttpOnly', 'SameSite=Lax', ...(opts.secure ? ['Secure'] : [])].join('; ')
}

export interface OAuthState {
  provider: string
  state: string
  verifier: string
  link: boolean // started while logged in: link the identity to that account
  exp: number // epoch seconds
}

export function newOAuthState(provider: string, link: boolean, now: number): { data: OAuthState; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const data = { provider, state: randomBytes(16).toString('base64url'), verifier, link, exp: Math.floor(now / 1000) + OAUTH_TTL_S }
  return { data, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export function signState(data: OAuthState, secret: string): string {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

export function verifyState(value: string | undefined, secret: string, now: number): OAuthState | null {
  if (!value) return null
  const [body, mac] = value.split('.')
  if (!body || !mac) return null
  const expected = createHmac('sha256', secret).update(body).digest()
  const given = Buffer.from(mac, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState
    return data.exp > now / 1000 ? data : null
  } catch {
    return null
  }
}

export const OAUTH_COOKIE_MAX_AGE = OAUTH_TTL_S
