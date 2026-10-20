// Accounts and sessions (épico 08, req. 6–8). An account is one or more provider identities (Discord, Google) and
// a display name; a session is a random token whose sha256 is stored, valid for 30 days and renewed with use.

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Db } from '../db'

export interface Profile {
  provider: string
  providerUserId: string
  name: string
  avatarUrl: string | null
}

export interface Account {
  id: string
  name: string
  avatarUrl: string | null
  providers: string[]
}

// Data that belongs to an account and lives elsewhere (cloud decks, match history…). Each feature registers how to
// export it and how to erase it, so deleting an account (req. 9) and exporting it (req. 10) never forget a table.
export interface AccountDataPart {
  name: string // key in the export
  export(db: Db, userId: string): Promise<unknown>
  erase(db: Db, userId: string): Promise<void> // inside the deletion transaction
}

export const SESSION_DAYS = 30
const TOUCH_EVERY_MS = 60 * 60 * 1000 // last_seen (and the expiry) move at most once an hour

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export class AccountStore {
  private readonly db: Db
  private readonly parts: AccountDataPart[] = []
  constructor(db: Db) {
    this.db = db
  }

  register(part: AccountDataPart) {
    this.parts.push(part)
  }

  // Deletes the account for good: registered data first, then the user (identities and sessions cascade).
  async deleteAccount(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const part of this.parts) await part.erase(tx, userId)
      await tx.query('DELETE FROM app_user WHERE id = $1', [userId])
    })
  }

  // Everything the server keeps about the account, as JSON (req. 10).
  async exportAccount(userId: string): Promise<Record<string, unknown>> {
    const [user] = await this.db.query<{ id: string; display_name: string; avatar_url: string | null; created_at: Date | string }>(
      'SELECT id, display_name, avatar_url, created_at FROM app_user WHERE id = $1', [userId])
    if (!user) return {}
    const identities = await this.db.query<{ provider: string; created_at: Date | string }>(
      'SELECT provider, created_at FROM identity WHERE user_id = $1 ORDER BY provider', [userId])
    const sessions = await this.db.query<{ created_at: Date | string; last_seen: Date | string; expires_at: Date | string }>(
      'SELECT created_at, last_seen, expires_at FROM session WHERE user_id = $1 ORDER BY created_at', [userId])
    const iso = (d: Date | string) => new Date(d).toISOString()
    const out: Record<string, unknown> = {
      kind: 'gathering-hall/account-export',
      exportedAt: new Date().toISOString(),
      account: { id: user.id, name: user.display_name, avatarUrl: user.avatar_url, createdAt: iso(user.created_at) },
      identities: identities.map((i) => ({ provider: i.provider, linkedAt: iso(i.created_at) })),
      sessions: sessions.map((s) => ({ createdAt: iso(s.created_at), lastSeen: iso(s.last_seen), expiresAt: iso(s.expires_at) })),
    }
    for (const part of this.parts) out[part.name] = await part.export(this.db, userId)
    return out
  }

  // Finds the account of this identity or creates one. With `linkTo` (already logged in), the identity joins that
  // account instead — unless it already belongs to another one, which is refused rather than merged silently.
  async signIn(profile: Profile, linkTo: string | null): Promise<{ userId: string } | { error: 'identityInUse' }> {
    return this.db.transaction(async (tx) => {
      const [found] = await tx.query<{ user_id: string }>(
        'SELECT user_id FROM identity WHERE provider = $1 AND provider_user_id = $2', [profile.provider, profile.providerUserId])
      if (found) {
        if (linkTo && found.user_id !== linkTo) return { error: 'identityInUse' as const }
        await tx.query('UPDATE app_user SET display_name = $1, avatar_url = $2 WHERE id = $3 AND deleted_at IS NULL',
          [profile.name, profile.avatarUrl, found.user_id])
        return { userId: found.user_id }
      }
      let userId = linkTo
      if (!userId) {
        userId = randomUUID()
        await tx.query('INSERT INTO app_user (id, display_name, avatar_url) VALUES ($1, $2, $3)', [userId, profile.name, profile.avatarUrl])
      }
      await tx.query('INSERT INTO identity (provider, provider_user_id, user_id) VALUES ($1, $2, $3)', [profile.provider, profile.providerUserId, userId])
      return { userId }
    })
  }

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url')
    await this.db.query(
      `INSERT INTO session (id_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
      [hashToken(token), userId, SESSION_DAYS])
    return token
  }

  // The account behind a session cookie, or null (unknown, expired or deleted account).
  async accountForSession(token: string): Promise<Account | null> {
    const idHash = hashToken(token)
    const [row] = await this.db.query<{ id: string; display_name: string; avatar_url: string | null; last_seen: Date | string }>(
      `SELECT u.id, u.display_name, u.avatar_url, s.last_seen FROM session s JOIN app_user u ON u.id = s.user_id
       WHERE s.id_hash = $1 AND s.expires_at > now() AND u.deleted_at IS NULL`, [idHash])
    if (!row) return null
    if (Date.now() - new Date(row.last_seen).getTime() > TOUCH_EVERY_MS) {
      await this.db.query(`UPDATE session SET last_seen = now(), expires_at = now() + make_interval(days => $2) WHERE id_hash = $1`, [idHash, SESSION_DAYS])
    }
    const providers = await this.db.query<{ provider: string }>('SELECT provider FROM identity WHERE user_id = $1 ORDER BY provider', [row.id])
    return { id: row.id, name: row.display_name, avatarUrl: row.avatar_url, providers: providers.map((p) => p.provider) }
  }

  // Expired sessions are useless and still say when someone played: removed by the server's periodic sweep.
  async deleteExpiredSessions(): Promise<void> {
    await this.db.query('DELETE FROM session WHERE expires_at <= now()')
  }

  async endSession(token: string) {
    await this.db.query('DELETE FROM session WHERE id_hash = $1', [hashToken(token)])
  }
}
