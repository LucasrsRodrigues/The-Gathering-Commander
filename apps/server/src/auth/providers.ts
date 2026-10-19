// OAuth 2.0 providers (épico 08, req. 6): Authorization Code + PKCE (S256), minimal scopes, profile read once and the
// provider's token thrown away. Endpoints are configurable only so tests can point at a fake provider.

import type { Profile } from './accounts'

export type ProviderId = 'discord' | 'google'

export interface ProviderConfig {
  id: ProviderId
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  profileUrl: string
  scope: string
}

const MAX_NAME = 64
// oxlint-disable-next-line no-control-regex -- control characters and bidi overrides never belong in a display name
const UNSAFE = /[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/g
const AVATAR_HOSTS = new Set(['cdn.discordapp.com', 'lh3.googleusercontent.com'])

export function providersFromEnv(env: NodeJS.ProcessEnv): ProviderConfig[] {
  const list: ProviderConfig[] = []
  if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) {
    list.push({
      id: 'discord', clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET,
      authorizeUrl: 'https://discord.com/oauth2/authorize', tokenUrl: 'https://discord.com/api/oauth2/token',
      profileUrl: 'https://discord.com/api/users/@me', scope: 'identify',
    })
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    list.push({
      id: 'google', clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
      profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid profile',
    })
  }
  return list
}

export function authorizeUrl(p: ProviderConfig, redirectUri: string, state: string, challenge: string): string {
  const url = new URL(p.authorizeUrl)
  url.search = new URLSearchParams({
    response_type: 'code', client_id: p.clientId, redirect_uri: redirectUri, scope: p.scope, state,
    code_challenge: challenge, code_challenge_method: 'S256', prompt: p.id === 'google' ? 'select_account' : 'consent',
  }).toString()
  return url.toString()
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

// Code → access token → profile. The token never leaves this function.
export async function fetchProfile(p: ProviderConfig, code: string, verifier: string, redirectUri: string, fetchFn: Fetch): Promise<Profile> {
  const tokenRes = await fetchFn(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier,
      client_id: p.clientId, client_secret: p.clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!tokenRes.ok) throw new Error(`token respondeu ${tokenRes.status}`)
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: unknown }
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('token ausente')
  const profileRes = await fetchFn(p.profileUrl, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) })
  if (!profileRes.ok) throw new Error(`perfil respondeu ${profileRes.status}`)
  return toProfile(p.id, (await profileRes.json()) as Record<string, unknown>)
}

function toProfile(provider: ProviderId, raw: Record<string, unknown>): Profile {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const id = provider === 'discord' ? str(raw.id) : str(raw.sub)
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error('perfil sem id válido')
  const rawName = provider === 'discord' ? str(raw.global_name) || str(raw.username) : str(raw.name)
  const name = rawName.replace(UNSAFE, '').trim().slice(0, MAX_NAME) || 'Jogador'
  let avatar: string | null = null
  if (provider === 'discord' && /^(a_)?[0-9a-f]{32}$/.test(str(raw.avatar))) avatar = `https://cdn.discordapp.com/avatars/${id}/${str(raw.avatar)}.png?size=128`
  if (provider === 'google') avatar = str(raw.picture) || null
  if (avatar) {
    try {
      const u = new URL(avatar)
      if (u.protocol !== 'https:' || !AVATAR_HOSTS.has(u.hostname)) avatar = null
    } catch {
      avatar = null
    }
  }
  return { provider, providerUserId: id, name, avatarUrl: avatar }
}
