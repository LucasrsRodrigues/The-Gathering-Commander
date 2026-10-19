// Optional account (épico 08): talks to the server's /api/auth and /api/me. Nothing here is needed to play; when the
// server has no providers configured, the app simply shows no login.

import { createStore, type Store } from '../ui/store'

export type Provider = 'discord' | 'google'
const PROVIDERS: readonly Provider[] = ['discord', 'google']
const AVATAR_HOSTS = new Set(['cdn.discordapp.com', 'lh3.googleusercontent.com'])

export interface Account {
  id: string
  name: string
  avatarUrl: string | null
  providers: Provider[]
}

export type AccountState =
  | { status: 'loading' }
  | { status: 'off' } // server without accounts (or unreachable)
  | { status: 'anonymous'; providers: Provider[] }
  | { status: 'signedIn'; providers: Provider[]; account: Account }

export const PROVIDER_LABELS: Record<Provider, string> = { discord: 'Discord', google: 'Google' }

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

// Untrusted input: keep only what the UI uses, in the shapes it expects.
export function toAccount(raw: unknown): Account | null {
  const a = raw as Record<string, unknown> | null
  if (!a || typeof a.id !== 'string' || typeof a.name !== 'string' || !a.name.trim()) return null
  let avatarUrl: string | null = null
  if (typeof a.avatarUrl === 'string') {
    try {
      const u = new URL(a.avatarUrl)
      if (u.protocol === 'https:' && AVATAR_HOSTS.has(u.hostname)) avatarUrl = u.toString()
    } catch {
      avatarUrl = null
    }
  }
  const providers = Array.isArray(a.providers) ? PROVIDERS.filter((p) => (a.providers as unknown[]).includes(p)) : []
  return { id: a.id.slice(0, 64), name: a.name.slice(0, 64), avatarUrl, providers }
}

export class AccountClient {
  readonly state: Store<AccountState> = createStore<AccountState>({ status: 'loading' })
  private readonly base: string
  private readonly fetchFn: Fetch

  constructor(base: string, fetchFn: Fetch = (url, init) => fetch(url, init)) {
    this.base = base.replace(/\/+$/, '')
    this.fetchFn = fetchFn
  }

  // The browser navigates here to sign in (or, signed in, to link another provider).
  startUrl(provider: Provider): string {
    return `${this.base}/api/auth/${provider}/start`
  }

  exportUrl(): string {
    return `${this.base}/api/me/export`
  }

  private request(path: string, init: RequestInit = {}) {
    return this.fetchFn(`${this.base}${path}`, { ...init, credentials: 'include', headers: { Accept: 'application/json', ...init.headers } })
  }

  async refresh(): Promise<AccountState> {
    let next: AccountState
    try {
      const res = await this.request('/api/auth/providers')
      const body = (await res.json().catch(() => ({}))) as { providers?: unknown }
      const providers = Array.isArray(body.providers) ? PROVIDERS.filter((p) => (body.providers as unknown[]).includes(p)) : []
      if (!res.ok || !providers.length) next = { status: 'off' }
      else {
        const me = await this.request('/api/me')
        const account = me.ok ? toAccount(((await me.json()) as { account?: unknown }).account) : null
        next = account ? { status: 'signedIn', providers, account } : { status: 'anonymous', providers }
      }
    } catch {
      next = { status: 'off' }
    }
    this.state.set(next)
    return next
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    await this.refresh()
  }

  async deleteAccount(confirm: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const res = await this.request('/api/me', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown }
        return { ok: false, error: typeof body.error === 'string' ? body.error : `O servidor respondeu ${res.status}.` }
      }
      await this.refresh()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Sem conexão com o servidor.' }
    }
  }
}

// Messages for the ?erro= the server puts on /#/conta after a failed login.
export const LOGIN_ERRORS: Record<string, string> = {
  cancelado: 'O login foi cancelado.',
  'sessao-expirada': 'O login demorou demais ou veio de outra aba. Tente de novo.',
  provedor: 'O provedor não respondeu como esperado. Tente de novo em instantes.',
  'conta-em-uso': 'Essa conta do provedor já está ligada a outra conta daqui.',
}
