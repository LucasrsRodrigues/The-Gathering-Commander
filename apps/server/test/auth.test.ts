import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore } from '../src/auth/accounts'
import type { ProviderConfig } from '../src/auth/providers'
import { AuthService } from '../src/auth/routes'
import { DEFAULT_CONFIG, startServer, type RunningServer } from '../src/server'
import { DbRoomStore } from '../src/store'
import { testDb } from './db.helpers'

// A fake OAuth provider: issues codes, checks PKCE and client credentials, serves one profile per code.
function fakeProvider() {
  const codes = new Map<string, { challenge: string; profile: Record<string, unknown> }>()
  let issued = 0
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/token') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const form = new URLSearchParams(body)
        const entry = codes.get(form.get('code') ?? '')
        const verifier = form.get('code_verifier') ?? ''
        const pkceOk = entry && createHash('sha256').update(verifier).digest('base64url') === entry.challenge
        if (!entry || !pkceOk || form.get('client_secret') !== 'secret') return void res.writeHead(400).end('{}')
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ access_token: `at-${form.get('code')}` }))
      })
      return
    }
    if (url.pathname === '/me') {
      const code = String(req.headers.authorization ?? '').replace('Bearer at-', '')
      const entry = codes.get(code)
      return void (entry ? res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(entry.profile)) : res.writeHead(401).end())
    }
    res.writeHead(404).end()
  })
  return {
    async listen() {
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    },
    // What the provider does when the user approves: a code tied to the PKCE challenge it was sent.
    approve(authorizeLocation: string, profile: Record<string, unknown>) {
      const u = new URL(authorizeLocation)
      const code = `code${++issued}`
      codes.set(code, { challenge: u.searchParams.get('code_challenge')!, profile })
      return { code, state: u.searchParams.get('state')! }
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
})

async function setup() {
  const provider = fakeProvider()
  const base = await provider.listen()
  const conf = (id: 'discord' | 'google'): ProviderConfig => ({
    id, clientId: 'client', clientSecret: 'secret', authorizeUrl: `${base}/authorize`, tokenUrl: `${base}/token`, profileUrl: `${base}/me`,
    scope: id === 'discord' ? 'identify' : 'openid profile',
  })
  const db = await testDb()
  const accounts = new AccountStore(db)
  // The auth service needs the server's public address up front: reserve a free port first.
  const port = await freePort()
  const publicUrl = `http://127.0.0.1:${port}`
  const auth = new AuthService(accounts, { publicUrl, sessionSecret: 'x'.repeat(40), providers: [conf('discord'), conf('google')] })
  const server: RunningServer = await startServer({ ...DEFAULT_CONFIG, port, allowedOrigins: [publicUrl] }, new DbRoomStore(db), undefined, null, auth)
  cleanup.push(() => provider.close(), () => server.close())
  return { provider, url: publicUrl, db }
}

// Runs the browser's side of a login: start → (provider approves) → callback. Returns the cookies and redirect.
async function login(env: Awaited<ReturnType<typeof setup>>, providerId: string, profile: Record<string, unknown>, session?: string) {
  const start = await fetch(`${env.url}/api/auth/${providerId}/start`, { redirect: 'manual', headers: session ? { Cookie: `gh_session=${session}` } : {} })
  expect(start.status).toBe(302)
  const oauthCookie = start.headers.get('set-cookie')!.split(';')[0]!
  const { code, state } = env.provider.approve(start.headers.get('location')!, profile)
  const back = await fetch(`${env.url}/api/auth/${providerId}/callback?code=${code}&state=${state}`, {
    redirect: 'manual', headers: { Cookie: [oauthCookie, ...(session ? [`gh_session=${session}`] : [])].join('; ') },
  })
  const setCookies = back.headers.getSetCookie()
  const sessionCookie = setCookies.find((c) => c.startsWith('gh_session='))
  return { back, start, sessionCookie, session: sessionCookie?.split(';')[0]!.slice('gh_session='.length) }
}
const me = (env: { url: string }, session: string) => fetch(`${env.url}/api/me`, { headers: { Cookie: `gh_session=${session}` } })

describe('login with OAuth + PKCE (Discord, Google)', () => {
  it('signs in, sets a safe session cookie and knows who you are', async () => {
    const env = await setup()
    const { start, back, sessionCookie, session } = await login(env, 'discord', { id: '1234567890', username: 'ana', global_name: 'Ana', avatar: 'a'.repeat(32) })
    const authorize = new URL(start.headers.get('location')!)
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${env.url}/api/auth/discord/callback`)
    expect(authorize.searchParams.get('scope')).toBe('identify')
    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toBe(`${env.url}/#/conta`)
    expect(sessionCookie).toMatch(/HttpOnly/)
    expect(sessionCookie).toMatch(/SameSite=Lax/)
    const res = await me(env, session!)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ account: { name: 'Ana', providers: ['discord'], avatarUrl: `https://cdn.discordapp.com/avatars/1234567890/${'a'.repeat(32)}.png?size=128` } })
  })

  it('the same identity comes back to the same account; the session can end', async () => {
    const env = await setup()
    const first = await login(env, 'google', { sub: 'g-1', name: 'Bia', picture: 'https://evil.example/x.png' })
    const second = await login(env, 'google', { sub: 'g-1', name: 'Bia S.' })
    const a = (await (await me(env, first.session!)).json()) as { account: { id: string; avatarUrl: string | null } }
    const b = (await (await me(env, second.session!)).json()) as { account: { id: string; name: string } }
    expect(b.account.id).toBe(a.account.id)
    expect(b.account.name).toBe('Bia S.')
    expect(a.account.avatarUrl).toBeNull() // avatars only from the providers' own hosts
    await fetch(`${env.url}/api/auth/logout`, { method: 'POST', headers: { Cookie: `gh_session=${second.session}`, Origin: env.url } })
    expect((await me(env, second.session!)).status).toBe(401)
  })

  it('logged in, a second provider links to the same account', async () => {
    const env = await setup()
    const { session } = await login(env, 'discord', { id: '42', username: 'caio' })
    const linked = await login(env, 'google', { sub: 'g-42', name: 'Caio' }, session)
    expect(linked.sessionCookie).toBeUndefined() // the current session stays
    expect(((await (await me(env, session!)).json()) as { account: { providers: string[] } }).account.providers).toEqual(['discord', 'google'])
  })

  it('refuses a wrong or missing state, a failed token exchange and an identity that belongs to someone else', async () => {
    const env = await setup()
    const start = await fetch(`${env.url}/api/auth/discord/start`, { redirect: 'manual' })
    const oauthCookie = start.headers.get('set-cookie')!.split(';')[0]!
    const { code } = env.provider.approve(start.headers.get('location')!, { id: '7', username: 'x' })
    const wrongState = await fetch(`${env.url}/api/auth/discord/callback?code=${code}&state=nope`, { redirect: 'manual', headers: { Cookie: oauthCookie } })
    expect(wrongState.headers.get('location')).toBe(`${env.url}/#/conta?erro=sessao-expirada`)
    const noCookie = await fetch(`${env.url}/api/auth/discord/callback?code=${code}&state=x`, { redirect: 'manual' })
    expect(noCookie.headers.get('location')).toMatch(/erro=sessao-expirada/)
    const badCode = await fetch(`${env.url}/api/auth/discord/callback?code=forged&state=${new URL(start.headers.get('location')!).searchParams.get('state')}`, { redirect: 'manual', headers: { Cookie: oauthCookie } })
    expect(badCode.headers.get('location')).toMatch(/erro=provedor/)

    const owner = await login(env, 'discord', { id: '99', username: 'dono' })
    const other = await login(env, 'google', { sub: 'g-other', name: 'Outro' })
    expect(owner.session && other.session).toBeTruthy()
    const steal = await login(env, 'discord', { id: '99', username: 'dono' }, other.session)
    expect(steal.back.headers.get('location')).toMatch(/erro=conta-em-uso/)
  })

  it('logout needs the same origin; providers without keys are off; no provider token is stored', async () => {
    const env = await setup()
    const { session } = await login(env, 'discord', { id: '5', username: 'e' })
    expect((await fetch(`${env.url}/api/auth/logout`, { method: 'POST', headers: { Cookie: `gh_session=${session}`, Origin: 'https://evil.example' } })).status).toBe(403)
    expect(await (await fetch(`${env.url}/api/auth/providers`)).json()).toEqual({ providers: ['discord', 'google'] })
    expect((await fetch(`${env.url}/api/auth/github/start`, { redirect: 'manual' })).status).toBe(404)
    const columns = await env.db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('app_user','identity','session')")
    expect(columns.map((c) => c.column_name).filter((c) => /token|secret|email|password/.test(c))).toEqual([])
  })
})

describe('without accounts configured', () => {
  it('the server says there are no providers and nothing else changes', async () => {
    const db = await testDb()
    const server = await startServer({ ...DEFAULT_CONFIG, port: 0 }, new DbRoomStore(db))
    cleanup.push(() => server.close())
    const base = `http://127.0.0.1:${server.port}`
    expect(await (await fetch(`${base}/api/auth/providers`)).json()).toEqual({ providers: [] })
    expect((await fetch(`${base}/api/me`)).status).toBe(404)
  })
})

describe('deleting and exporting the account (req. 9, 10)', () => {
  it('exports what the server keeps, as a download, only with a session', async () => {
    const env = await setup()
    const { session } = await login(env, 'discord', { id: '11', username: 'ana' })
    await login(env, 'google', { sub: 'g-11', name: 'Ana' }, session)
    expect((await fetch(`${env.url}/api/me/export`)).status).toBe(401)
    const res = await fetch(`${env.url}/api/me/export`, { headers: { Cookie: `gh_session=${session}` } })
    expect(res.headers.get('content-disposition')).toMatch(/attachment/)
    const data = (await res.json()) as Record<string, unknown>
    expect(data).toMatchObject({ kind: 'gathering-hall/account-export', account: { name: 'ana' } })
    expect((data.identities as { provider: string }[]).map((i) => i.provider)).toEqual(['discord', 'google'])
    expect(JSON.stringify(data)).not.toMatch(/at-code|secret/) // no provider tokens, no secrets
  })

  it('deletes everything, ends every session, and needs the same origin and the typed confirmation', async () => {
    const env = await setup()
    const phone = await login(env, 'discord', { id: '12', username: 'bia' })
    const laptop = await login(env, 'discord', { id: '12', username: 'bia' })
    const del = (headers: Record<string, string>, body: unknown) =>
      fetch(`${env.url}/api/me`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Cookie: `gh_session=${laptop.session}`, ...headers }, body: JSON.stringify(body) })
    expect((await del({ Origin: 'https://evil.example' }, { confirm: 'excluir minha conta' })).status).toBe(403)
    expect((await del({ Origin: env.url }, { confirm: 'sim' })).status).toBe(400)
    const ok = await del({ Origin: env.url }, { confirm: 'excluir minha conta' })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('set-cookie')).toMatch(/gh_session=;.*Max-Age=0/)
    expect((await me(env, phone.session!)).status).toBe(401) // the other device's session is gone too
    expect(await env.db.query('SELECT 1 FROM app_user')).toEqual([])
    expect(await env.db.query('SELECT 1 FROM identity')).toEqual([])
    expect(await env.db.query('SELECT 1 FROM session')).toEqual([])
    // Signing in again later starts a brand-new account.
    const again = await login(env, 'discord', { id: '12', username: 'bia' })
    expect((await me(env, again.session!)).status).toBe(200)
  })

  it('registered account data is exported and erased with the account', async () => {
    const db = await testDb()
    const accounts = new AccountStore(db)
    await db.exec('CREATE TABLE t_note (user_id uuid, text text)')
    accounts.register({
      name: 'notes',
      export: async (d, id) => (await d.query<{ text: string }>('SELECT text FROM t_note WHERE user_id = $1', [id])).map((r) => r.text),
      erase: async (d, id) => void (await d.query('DELETE FROM t_note WHERE user_id = $1', [id])),
    })
    const signed = await accounts.signIn({ provider: 'discord', providerUserId: '13', name: 'Caio', avatarUrl: null }, null)
    const id = 'userId' in signed ? signed.userId : ''
    await db.query('INSERT INTO t_note VALUES ($1, $2)', [id, 'deck do Caio'])
    expect((await accounts.exportAccount(id)).notes).toEqual(['deck do Caio'])
    await accounts.deleteAccount(id)
    expect(await db.query('SELECT 1 FROM t_note')).toEqual([])
  })
})

describe('security review (T8.11)', () => {
  it('a malformed cookie from elsewhere on the domain does not break the login', async () => {
    const env = await setup()
    const { session } = await login(env, 'discord', { id: '42', username: 'ana' })
    const res = await fetch(`${env.url}/api/me`, { headers: { Cookie: `other=%E0%A4%A; gh_session=${session}` } })
    expect(res.status).toBe(200)
  })

  it('expired sessions are removed, not just ignored', async () => {
    const env = await setup()
    const accounts = new AccountStore(env.db)
    const { session } = await login(env, 'discord', { id: '43', username: 'bia' })
    await env.db.query(`UPDATE session SET expires_at = now() - interval '1 day'`)
    expect((await me(env, session!)).status).toBe(401)
    await accounts.deleteExpiredSessions()
    expect(await env.db.query('SELECT 1 FROM session')).toEqual([])
  })

  it('account routes are rate limited per IP', async () => {
    const env = await setup()
    const codes: number[] = []
    for (let i = 0; i < 125; i++) codes.push((await fetch(`${env.url}/api/me`)).status)
    expect(codes.slice(0, 120).every((c) => c === 401)).toBe(true)
    expect(codes.at(-1)).toBe(429)
  })
})
