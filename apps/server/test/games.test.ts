import { describe, expect, it } from 'vitest'
import { AccountStore } from '../src/auth/accounts'
import { GameStore } from '../src/games/store'
import { Room } from '../src/room/room'
import { testDb } from './db.helpers'
import { deck, msg, testDeps } from './helpers'

async function accountsIn(db: Awaited<ReturnType<typeof testDb>>, ...who: string[]) {
  const accounts = new AccountStore(db)
  const ids: string[] = []
  for (const w of who) {
    const r = await accounts.signIn({ provider: 'discord', providerUserId: w, name: w, avatarUrl: null }, null)
    if ('error' in r) throw new Error(r.error)
    ids.push(r.userId)
  }
  return { accounts, ids }
}

// A finished 3-player game: seat 0 and 1 with accounts (when given), seat 2 anonymous; seats 1 and 2 concede.
function finishedRoom(users: (string | null)[]) {
  const { room, hostToken } = Room.create('r', testDeps(), users[0])
  room.receive('c0', msg({ t: 'hello', room: 'r', token: hostToken }), users[0])
  room.receive('c0', msg({ t: 'sit', seat: 0, name: 'Ana', deck: { ...deck, commanders: [{ name: 'Krenko', typeLine: 'Legendary Creature — Goblin' }] } }))
  for (const i of [1, 2]) {
    room.receive(`c${i}`, msg({ t: 'hello', room: 'r' }), users[i] ?? null)
    room.receive(`c${i}`, msg({ t: 'sit', seat: i, name: `P${i + 1}`, deck }))
  }
  room.receive('c0', msg({ t: 'start' }))
  room.receive('c1', msg({ t: 'act', seq: 1, action: { type: 'concede' } as never }))
  room.receive('c2', msg({ t: 'act', seq: 1, action: { type: 'concede' } as never }))
  expect(room.snapshot().status).toBe('ended')
  return room.snapshot()
}

describe('match history', () => {
  it('records a finished game and lists it for each account, with the right result', async () => {
    const db = await testDb()
    const { ids: [ana, bia] } = await accountsIn(db, 'ana', 'bia')
    const games = new GameStore(db)
    expect(await games.record(finishedRoom([ana!, bia!, null]), 5_000)).toBeTruthy()

    const forAna = await games.forUser(ana!, null)
    expect(forAna.games).toHaveLength(1)
    const g = forAna.games[0]!
    expect(g).toMatchObject({ startedAt: 1_000, endedAt: 5_000, preset: expect.any(String) })
    expect(g.players.map((p) => [p.name, p.won, p.lossReason, p.you])).toEqual([
      ['Ana', true, null, true], ['P2', false, 'conceded', false], ['P3', false, 'conceded', false],
    ])
    expect(g.players[0]!.commanders).toEqual(['Krenko'])
    const forBia = await games.forUser(bia!, null)
    expect(forBia.games[0]!.players.find((p) => p.you)).toMatchObject({ name: 'P2', won: false })
    expect(JSON.stringify(forBia)).not.toContain(ana!) // never other players' account ids
  })

  it('games without accounts are recorded too, but belong to no one', async () => {
    const db = await testDb()
    const games = new GameStore(db)
    await games.record(finishedRoom([null, null, null]), 5_000)
    const [row] = await db.query<{ n: string | number }>('SELECT count(*) AS n FROM game')
    expect(Number(row!.n)).toBe(1)
    const { ids: [x] } = await accountsIn(db, 'x')
    expect((await games.forUser(x!, null)).games).toEqual([])
  })

  it('pages newest first with a cursor', async () => {
    const db = await testDb()
    const { ids: [ana] } = await accountsIn(db, 'ana')
    const games = new GameStore(db)
    for (let i = 1; i <= 5; i++) await games.record(finishedRoom([ana!, null, null]), i * 10_000)
    const first = await games.forUser(ana!, null, 2)
    expect(first.games.map((g) => g.endedAt)).toEqual([50_000, 40_000])
    const second = await games.forUser(ana!, first.next, 2)
    const third = await games.forUser(ana!, second.next, 2)
    expect([...second.games, ...third.games].map((g) => g.endedAt)).toEqual([30_000, 20_000, 10_000])
    expect(third.next).toBeNull()
    expect((await games.forUser(ana!, 'garbage', 2)).games).toHaveLength(2) // a bad cursor starts over
  })

  it('exports the history; deleting the account anonymizes it and keeps it for the others', async () => {
    const db = await testDb()
    const { accounts, ids: [ana, bia] } = await accountsIn(db, 'ana', 'bia')
    const games = new GameStore(db)
    accounts.register(games.accountPart())
    await games.record(finishedRoom([ana!, bia!, null]), 5_000)
    const exported = (await accounts.exportAccount(ana!)) as { games: unknown[] }
    expect(exported.games).toHaveLength(1)

    await accounts.deleteAccount(ana!)
    const forBia = await games.forUser(bia!, null)
    expect(forBia.games[0]!.players[0]).toMatchObject({ name: 'Jogador 1', won: true, you: false })
    const [left] = await db.query<{ n: string | number }>('SELECT count(*) AS n FROM game_player WHERE user_id IS NOT NULL')
    expect(Number(left!.n)).toBe(1)
  })
})
