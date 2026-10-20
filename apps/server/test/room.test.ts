import { officialPreset } from '@gathering-hall/formats'
import { describe, expect, it } from 'vitest'
import { Room } from '../src/room/room'
import { deck, msg, seatedRoom, testDeps, to } from './helpers'

describe('Room lobby', () => {
  it('the creator is host; guests get their own token on hello', () => {
    const { room, hostToken } = Room.create('r', testDeps())
    const host = room.receive('a', msg({ t: 'hello', room: 'r', token: hostToken }))
    expect(to(host, 'a', 'welcome')[0]).toMatchObject({ host: true, seat: null })
    expect(to(host, 'a', 'welcome')[0]).not.toHaveProperty('token')

    const guest = room.receive('b', msg({ t: 'hello', room: 'r' }))
    const welcome = to(guest, 'b', 'welcome')[0]
    expect(welcome).toMatchObject({ host: false })
    expect(welcome && 'token' in welcome && welcome.token).toMatch(/^tok/)
  })

  it('reconnecting with the same token restores the seat', () => {
    const { room } = Room.create('r', testDeps())
    const first = room.receive('b', msg({ t: 'hello', room: 'r' }))
    const token = (to(first, 'b', 'welcome')[0] as { token: string }).token
    room.receive('b', msg({ t: 'sit', seat: 2, name: 'Bia', deck }))
    room.disconnect('b')
    const again = room.receive('b2', msg({ t: 'hello', room: 'r', token }))
    expect(to(again, 'b2', 'welcome')[0]).toMatchObject({ seat: 2, player: 'p3' })
  })

  it('seats cannot be stolen; moving seats frees the old one', () => {
    const { room } = seatedRoom(2)
    const steal = room.receive('c1', msg({ t: 'sit', seat: 0, name: 'Thief', deck }))
    expect(to(steal, 'c1', 'error')[0]).toMatchObject({ code: 'seatTaken' })
    const move = room.receive('c1', msg({ t: 'sit', seat: 3, name: 'P2', deck }))
    const lobby = to(move, 'c0', 'lobby')[0] as { seats: { taken: boolean }[] }
    expect(lobby.seats.map((s) => s.taken)).toEqual([true, false, false, true])
  })

  it('only the host configures and starts, with at least 2 seated players', () => {
    const { room } = seatedRoom(1)
    room.receive('g', msg({ t: 'hello', room: 'room-1' }))
    expect(to(room.receive('g', msg({ t: 'start' })), 'g', 'error')[0]).toMatchObject({ code: 'notHost' })
    expect(to(room.receive('g', msg({ t: 'configure', preset: officialPreset() })), 'g', 'error')[0]).toMatchObject({ code: 'notHost' })
    expect(to(room.receive('c0', msg({ t: 'start' })), 'c0', 'error')[0]).toMatchObject({ code: 'tooFewPlayers' })
  })

  it('spectators and strangers cannot act', () => {
    const { room } = seatedRoom(2)
    room.receive('s', msg({ t: 'hello', room: 'room-1', spectator: true }))
    expect(to(room.receive('s', msg({ t: 'sit', seat: 3, name: 'X', deck })), 's', 'error')[0]).toMatchObject({ code: 'notMember' })
    expect(to(room.receive('nobody', msg({ t: 'start' })), 'nobody', 'error')[0]).toMatchObject({ code: 'notMember' })
  })
})

describe('Room game', () => {
  function started(players = 2) {
    const r = seatedRoom(players)
    r.room.receive('c0', msg({ t: 'configure', preset: { ...officialPreset(), id: 'x', name: 'X', ruleset: { startingLife: 30 } } }))
    const out = r.room.receive('c0', msg({ t: 'start' }))
    return { ...r, out }
  }

  it('starts with the preset ruleset and sends each seat its own view', () => {
    const { out } = started(2)
    expect(to(out, 'c1', 'lobby')[0]).toMatchObject({ status: 'playing' })
    const p1 = to(out, 'c0', 'state')[0] as { view: { viewer: string; players: Record<string, { life: number; hand: string[] }> } }
    const p2 = to(out, 'c1', 'state')[0] as typeof p1
    expect(p1.view.viewer).toBe('p1')
    expect(p2.view.viewer).toBe('p2')
    expect(p1.view.players.p1!.life).toBe(30)
    expect(p1.view.players.p1!.hand).toHaveLength(7)
    expect(p1.view.players.p2!.hand).toEqual([])
  })

  // Seat i is connection c<i> and player p<i+1>; the seed decides who goes first.
  const connOf = (player: string) => `c${Number(player.slice(1)) - 1}`

  it('applies actions as the connection seat, never as a claimed player', () => {
    const { room } = started(2)
    const first = room.snapshot().game!.pending!.player
    const other = first === 'p1' ? 'p2' : 'p1'
    const wrong = room.receive(connOf(other), msg({ t: 'act', seq: 1, action: { type: 'keepHand' } }))
    expect(to(wrong, connOf(other), 'rejected')[0]).toMatchObject({ seq: 1, error: { code: 'notYourDecision' } })
    expect(to(wrong, connOf(first))).toEqual([])
    const ok = room.receive(connOf(first), msg({ t: 'act', seq: 2, action: { type: 'keepHand' } }))
    expect(to(ok, connOf(other), 'state')).toHaveLength(1)
    expect(room.snapshot().actions).toEqual([{ type: 'keepHand', player: first }])
  })

  it('a late joiner watches without seeing hands; reconnecting players get the current view', () => {
    const { room } = started(2)
    const late = room.receive('late', msg({ t: 'hello', room: 'room-1' }))
    const view = (to(late, 'late', 'state')[0] as { view: { viewer: null; players: Record<string, { hand: string[] }> } }).view
    expect(view.viewer).toBeNull()
    expect(Object.values(view.players).every((p) => p.hand.length === 0)).toBe(true)
  })

  it('records the initial state and actions so the game can be replayed', () => {
    const { room } = started(2)
    for (let seq = 1; room.snapshot().game!.pending; seq++) {
      room.receive(connOf(room.snapshot().game!.pending!.player), msg({ t: 'act', seq, action: { type: 'keepHand' } }))
    }
    const snap = room.snapshot()
    expect(snap.initial?.status).toBe('mulligan')
    expect(snap.game?.status).toBe('playing')
    expect(snap.version).toBe(3)
  })

  it('a finished game goes back to the lobby on rematch', () => {
    const { room } = started(2)
    room.receive('c1', msg({ t: 'act', seq: 1, action: { type: 'concede' } }))
    expect(room.snapshot().status).toBe('ended')
    const back = room.receive('c0', msg({ t: 'rematch' }))
    expect(to(back, 'c1', 'lobby')[0]).toMatchObject({ status: 'lobby' })
    expect(room.snapshot().game).toBeNull()
  })
})

describe('Room seats and accounts (épico 08)', () => {
  it('the same account finds its seat again from another device, without the token', () => {
    const { room } = Room.create('r', testDeps())
    room.receive('pc', msg({ t: 'hello', room: 'r' }), 'user-1')
    room.receive('pc', msg({ t: 'sit', seat: 1, name: 'Bia', deck }))
    room.disconnect('pc')
    const tablet = room.receive('tab', msg({ t: 'hello', room: 'r' }), 'user-1')
    const welcome = to(tablet, 'tab', 'welcome')[0]
    expect(welcome).toMatchObject({ seat: 1, player: 'p2' })
    expect(welcome).not.toHaveProperty('token') // the account is the credential; no new member was made
    expect(room.snapshot().members).toHaveLength(2)
  })

  it('an idle token from this device gives way to the account place; a seated one keeps winning', () => {
    const { room } = Room.create('r', testDeps())
    room.receive('pc', msg({ t: 'hello', room: 'r' }), 'user-1')
    room.receive('pc', msg({ t: 'sit', seat: 2, name: 'Bia', deck }))
    const anon = room.receive('tab', msg({ t: 'hello', room: 'r' }))
    const anonToken = (to(anon, 'tab', 'welcome')[0] as { token: string }).token
    room.disconnect('tab')
    const back = room.receive('tab2', msg({ t: 'hello', room: 'r', token: anonToken }), 'user-1')
    expect(to(back, 'tab2', 'welcome')[0]).toMatchObject({ seat: 2 })
  })

  it('the host created with an account is host on any device; without an account nothing changes', () => {
    const { room } = Room.create('r', testDeps(), 'host-user')
    expect(to(room.receive('x', msg({ t: 'hello', room: 'r' }), 'host-user'), 'x', 'welcome')[0]).toMatchObject({ host: true })
    expect(to(room.receive('y', msg({ t: 'hello', room: 'r' })), 'y', 'welcome')[0]).toMatchObject({ host: false })
    expect(to(room.receive('z', msg({ t: 'hello', room: 'r' }), 'other'), 'z', 'welcome')[0]).toMatchObject({ host: false, seat: null })
  })

  it('a member joined by token is linked to the account it first comes back with', () => {
    const { room } = Room.create('r', testDeps())
    const first = room.receive('a', msg({ t: 'hello', room: 'r' }))
    const token = (to(first, 'a', 'welcome')[0] as { token: string }).token
    room.receive('a', msg({ t: 'sit', seat: 0, name: 'Ana', deck }))
    room.receive('a2', msg({ t: 'hello', room: 'r', token }), 'user-a')
    expect(to(room.receive('a3', msg({ t: 'hello', room: 'r' }), 'user-a'), 'a3', 'welcome')[0]).toMatchObject({ seat: 0 })
    // the lobby never shows the account id
    expect(JSON.stringify(to(room.receive('s', msg({ t: 'hello', room: 'r', spectator: true })), 's', 'lobby'))).not.toContain('user-a')
  })
})
