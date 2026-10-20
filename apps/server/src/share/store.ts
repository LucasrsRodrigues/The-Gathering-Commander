// Public deck links (épico 10, req. 25–28). A slug points to (account, deck); the page reads the deck's current
// version from the cloud, so it is always up to date. Only what the page shows leaves the server: never the account
// id, the history or the folder.

import { randomBytes } from 'node:crypto'
import { sanitizeDeck } from '@gathering-hall/formats'
import type { AccountDataPart } from '../auth/accounts'
import type { Db } from '../db'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const SLUG = /^[0-9A-Za-z]{10}$/

export function newSlug(): string {
  const bytes = randomBytes(10)
  return [...bytes].map((b) => ALPHABET[b % 62]).join('') // 62^10 ≈ 8·10^17; the tiny modulo bias does not matter here
}

export interface PublicDeck {
  name: string
  description?: string
  commanders: unknown[]
  cards: unknown[]
  maybe: unknown[]
  tagOrder?: string[]
  owner: string // display name only
  updatedAt: number
}

export type ShareResult = { ok: true; slug: string } | { ok: false; error: 'notInCloud' }

export class ShareStore {
  private readonly db: Db
  private readonly slug: () => string
  constructor(db: Db, slug: () => string = newSlug) {
    this.db = db
    this.slug = slug
  }

  // The deck's link, creating one if it has none. The deck must be in the account's cloud.
  async share(userId: string, deckId: string, now: number): Promise<ShareResult> {
    return this.db.transaction(async (tx) => {
      const [doc] = await tx.query<{ id: string }>(`SELECT id FROM cloud_doc WHERE user_id = $1 AND kind = 'deck' AND id = $2 AND data IS NOT NULL`, [userId, deckId])
      if (!doc) return { ok: false as const, error: 'notInCloud' as const }
      const [existing] = await tx.query<{ slug: string }>('SELECT slug FROM deck_share WHERE user_id = $1 AND deck_id = $2', [userId, deckId])
      if (existing) return { ok: true as const, slug: existing.slug }
      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = this.slug()
        const [used] = await tx.query<{ slug: string }>('SELECT slug FROM deck_share_used WHERE slug = $1', [slug])
        if (used) continue
        await tx.query('INSERT INTO deck_share_used (slug) VALUES ($1)', [slug])
        await tx.query('INSERT INTO deck_share (slug, user_id, deck_id, created_at) VALUES ($1, $2, $3, $4)', [slug, userId, deckId, now])
        return { ok: true as const, slug }
      }
      throw new Error('não foi possível gerar um link')
    })
  }

  async unshare(userId: string, deckId: string): Promise<void> {
    await this.db.query('DELETE FROM deck_share WHERE user_id = $1 AND deck_id = $2', [userId, deckId])
  }

  async list(userId: string): Promise<{ deckId: string; slug: string }[]> {
    const rows = await this.db.query<{ deck_id: string; slug: string }>('SELECT deck_id, slug FROM deck_share WHERE user_id = $1 ORDER BY created_at', [userId])
    return rows.map((r) => ({ deckId: r.deck_id, slug: r.slug }))
  }

  // What the public page shows, or null (unknown or turned-off link, deck deleted, account deleted).
  async read(slug: string): Promise<PublicDeck | null> {
    if (!SLUG.test(slug)) return null
    const [row] = await this.db.query<{ data: unknown; display_name: string }>(
      `SELECT c.data, u.display_name FROM deck_share s
       JOIN cloud_doc c ON c.user_id = s.user_id AND c.kind = 'deck' AND c.id = s.deck_id
       JOIN app_user u ON u.id = s.user_id
       WHERE s.slug = $1 AND c.data IS NOT NULL AND u.deleted_at IS NULL`, [slug])
    const deck = row ? sanitizeDeck(row.data) : null
    if (!row || !deck) return null
    return {
      name: deck.name, ...(deck.description ? { description: deck.description } : {}),
      commanders: deck.commanders, cards: deck.cards, maybe: deck.maybe, ...(deck.tagOrder ? { tagOrder: deck.tagOrder } : {}),
      owner: row.display_name, updatedAt: deck.updatedAt,
    }
  }

  // Export lists the active links; deletion removes them (the cascade does too).
  accountPart(): AccountDataPart {
    return {
      name: 'publicLinks',
      export: async (db, userId) => (await db.query<{ deck_id: string; slug: string }>('SELECT deck_id, slug FROM deck_share WHERE user_id = $1', [userId]))
        .map((r) => ({ deckId: r.deck_id, slug: r.slug })),
      erase: async (db, userId) => void (await db.query('DELETE FROM deck_share WHERE user_id = $1', [userId])),
    }
  }
}
