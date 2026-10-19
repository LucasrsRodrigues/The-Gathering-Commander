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
