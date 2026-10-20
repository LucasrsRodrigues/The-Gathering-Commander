// Match history (épico 08, req. 18–19). Built from the room snapshot when a game ends; the room core knows nothing
// about it. Reads are per account and paginated by (ended_at, id), newest first.

import { randomUUID } from 'node:crypto'
import type { AccountDataPart } from '../auth/accounts'
import type { Db } from '../db'
import type { RoomSnapshot } from '../room/room'

export const PAGE_SIZE = 20

export interface GamePlayerSummary {
  seat: number
  name: string
  commanders: string[]
  won: boolean
  lossReason: string | null
  you: boolean
}

export interface GameSummary {
  id: string
  startedAt: number
  endedAt: number
  preset: string
  players: GamePlayerSummary[]
}

type GameRow = { id: string; started_at: string | number; ended_at: string | number; preset_name: string }
type PlayerRow = {
  game_id: string; seat: number; name: string; commanders: string[]; won: boolean; loss_reason: string | null; mine: boolean
}

export class GameStore {
  private readonly db: Db
  constructor(db: Db) {
    this.db = db
  }

  // Records a finished game from the room snapshot. Returns the new id, or null when there is no finished game in it.
  async record(snap: RoomSnapshot, endedAt: number): Promise<string | null> {
    const game = snap.game
    if (!game || game.status !== 'ended' || !snap.initial) return null
    const id = randomUUID()
    const winners = game.winners ?? []
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO game (id, room_id, started_at, ended_at, preset_name, preset, initial, actions, winners)
         VALUES ($1, $2, $3, $4, $5, ($6::text)::jsonb, ($7::text)::jsonb, ($8::text)::jsonb, ($9::text)::jsonb)`,
        [id, snap.id, snap.startedAt ?? endedAt, endedAt, snap.preset.name, JSON.stringify(snap.preset),
          JSON.stringify(snap.initial), JSON.stringify(snap.actions), JSON.stringify(winners)],
      )
      for (const pid of game.seats) {
        const seat = Number(pid.slice(1)) - 1
        const seated = snap.seats[seat]
        const userId = seated ? snap.members.find((m) => m.tokenHash === seated.member)?.userId ?? null : null
        const player = game.players[pid]!
        // An account deleted during the game is simply not linked (the subquery finds nothing).
        await tx.query(
          `INSERT INTO game_player (game_id, seat, player_id, user_id, name, commanders, won, loss_reason)
           VALUES ($1, $2, $3, (SELECT id FROM app_user WHERE id::text = $4), $5, ($6::text)::jsonb, $7, $8)`,
          [id, seat, pid, userId ?? '', player.name, JSON.stringify(seated?.deck.commanders.map((c) => c.name) ?? []),
            winners.includes(pid), player.lossReason ?? null],
        )
      }
    })
    return id
  }

  // One page of the account's games, newest first. cursor = the `next` of the previous page.
  async forUser(userId: string, cursor: string | null, limit = PAGE_SIZE): Promise<{ games: GameSummary[]; next: string | null }> {
    const [endedBefore, idBefore] = parseCursor(cursor)
    const games = await this.db.query<GameRow>(
      `SELECT g.id, g.started_at, g.ended_at, g.preset_name FROM game g
       WHERE EXISTS (SELECT 1 FROM game_player p WHERE p.game_id = g.id AND p.user_id = $1)
         AND ($2::bigint IS NULL OR (g.ended_at, g.id) < ($2::bigint, $3::uuid))
       ORDER BY g.ended_at DESC, g.id DESC LIMIT $4`,
      [userId, endedBefore, idBefore, limit + 1],
    )
    const page = games.slice(0, limit)
    const players = page.length
      ? await this.db.query<PlayerRow>(
        `SELECT game_id, seat, name, commanders, won, loss_reason, (user_id IS NOT NULL AND user_id = $1) AS mine
         FROM game_player WHERE game_id::text = ANY ($2::text[]) ORDER BY seat`,
        [userId, page.map((g) => g.id)],
      )
      : []
    const last = page[page.length - 1]
    return {
      games: page.map((g) => ({
        id: g.id, startedAt: Number(g.started_at), endedAt: Number(g.ended_at), preset: g.preset_name,
        players: players.filter((p) => p.game_id === g.id).map((p) => ({
          seat: p.seat, name: p.name, commanders: p.commanders, won: p.won, lossReason: p.loss_reason, you: p.mine,
        })),
      })),
      next: games.length > limit && last ? `${Number(last.ended_at)}_${last.id}` : null,
    }
  }

  // Export: the account's games as listed (no replay data). Erase: anonymize, so the others keep their history.
  accountPart(): AccountDataPart {
    return {
      name: 'games',
      export: async (_db, userId) => {
        const all: GameSummary[] = []
        let cursor: string | null = null
        do {
          const page = await this.forUser(userId, cursor, 200)
          all.push(...page.games)
          cursor = page.next
        } while (cursor)
        return all
      },
      erase: async (db, userId) => {
        await db.query(`UPDATE game_player SET user_id = NULL, name = 'Jogador ' || (seat + 1) WHERE user_id = $1`, [userId])
      },
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function parseCursor(cursor: string | null): [number | null, string | null] {
  const m = cursor ? /^(\d{1,15})_(.+)$/.exec(cursor) : null
  return m && UUID.test(m[2]!) ? [Number(m[1]), m[2]!] : [null, null]
}
