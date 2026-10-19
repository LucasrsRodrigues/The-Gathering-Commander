import type { GameState, PlayerId } from '@gathering-hall/engine'
import { officialPreset } from '@gathering-hall/formats'
import { SKIP_AFTER_MS, type ServerMessage } from '@gathering-hall/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from '../src/room/room'
import { deck, msg, testDeps, to } from './helpers'

// Host on c0 (seat 0, p1) and a guest on c1 (seat 1, p2). The clock is moved by hand.
function game(priorityMode: 'relaxed' | 'strict' = 'relaxed') {
  let clock = 1_000
  const deps = { ...testDeps(), now: () => clock }
  const { room, hostToken } = Room.create('room-1', deps)
  room.receive('c0', msg({ t: 'hello', room: 'room-1', token: hostToken }))
  room.receive('c0', msg({ t: 'sit', seat: 0, name: 'Host', deck }))
  const welcome = to(room.receive('c1', msg({ t: 'hello', room: 'room-1' })), 'c1', 'welcome')[0] as { token: string }
  room.receive('c1', msg({ t: 'sit', seat: 1, name: 'Bia', deck }))
  room.receive('c0', msg({ t: 'configure', preset: { ...officialPreset(), id: 'x', name: 'X', ruleset: { priorityMode } } }))
  room.receive('c0', msg({ t: 'start' }))
  return {
    room, deps, hostToken, guestToken: welcome.token,
    wait: (ms: number) => { clock += ms },
    keepAll() {
      while (room.snapshot().game!.status === 'mulligan') {
        room.receive(room.snapshot().game!.pending!.player === 'p1' ? 'c0' : 'c1', msg({ t: 'act', seq: 1, action: { type: 'keepHand' } }))
      }
    },
  }
}

const skip = (room: Room, conn: string, player: PlayerId) => room.receive(conn, msg({ t: 'skip', player }))
const errorOf = (out: ReturnType<Room['receive']>, conn: string) => to(out, conn, 'error')[0] as Extract<ServerMessage, { t: 'error' }> | undefined

// The guest leaves and the room is loaded again with a game changed by hand (as after a server restart).
function reloadWith(g: ReturnType<typeof game>, change: (s: GameState) => void) {
  const snap = structuredClone(g.room.snapshot())
  change(snap.game!)
  const room = new Room(snap, g.deps)
  room.receive('c0', msg({ t: 'hello', room: 'room-1', token: g.hostToken }))
  return room
}

describe('host skips a player who left', () => {
  it('starts with p2 (fixed seed)', () => {
    expect(game().room.snapshot().game!.startingPlayer).toBe('p2')
  })

  it('unlocks the mulligan of a player who left, after the wait, with the default answer marked in the log', () => {
    const g = game()
    expect(g.room.snapshot().game!.pending).toMatchObject({ kind: 'mulligan', player: 'p2' })

    expect(errorOf(skip(g.room, 'c0', 'p2'), 'c0')).toMatchObject({ code: 'cannotSkip', message: 'Esse jogador está conectado.' })
    const presence = to(g.room.disconnect('c1'), 'c0', 'presence')[0]
    expect(presence).toEqual({ v: 1, t: 'presence', connected: ['p1'], away: [{ player: 'p2', ms: 0 }] })

    g.wait(SKIP_AFTER_MS - 1_000)
    expect(errorOf(skip(g.room, 'c0', 'p2'), 'c0')).toMatchObject({ code: 'cannotSkip', message: expect.stringContaining('1 s') })
    g.wait(1_000)
    const out = skip(g.room, 'c0', 'p2')
    expect(to(out, 'c0', 'skipped')[0]).toEqual({ v: 1, t: 'skipped', player: 'p2', decision: 'mulligan' })
    expect(to(out, 'c0', 'state')).toHaveLength(1)
    expect(g.room.snapshot().actions).toEqual([{ type: 'keepHand', player: 'p2' }])
    expect(g.room.snapshot().game!.pending).toMatchObject({ kind: 'mulligan', player: 'p1' })
  })

  it('never skips someone who is connected, or who came back', () => {
    const g = game()
    g.room.disconnect('c1')
    g.wait(SKIP_AFTER_MS)
    g.room.receive('c1b', msg({ t: 'hello', room: 'room-1', token: g.guestToken }))
    expect(errorOf(skip(g.room, 'c0', 'p2'), 'c0')).toMatchObject({ code: 'cannotSkip', message: 'Esse jogador está conectado.' })
    expect(g.room.snapshot().actions).toEqual([])
  })

  it('only the host skips', () => {
    const g = game()
    g.room.receive('c1', msg({ t: 'act', seq: 1, action: { type: 'keepHand' } }))
    g.room.disconnect('c0') // the host is the one waited on now
    g.wait(SKIP_AFTER_MS)
    expect(errorOf(skip(g.room, 'c1', 'p1'), 'c1')).toMatchObject({ code: 'notHost' })
    expect(g.room.snapshot().game!.pending).toMatchObject({ kind: 'mulligan', player: 'p1' })
  })

  it('passes priority for a player who left in strict mode, and only for the one the game waits on', () => {
    const g = game('strict')
    g.keepAll()
    expect(g.room.snapshot().game!.priority!.player).toBe('p2')
    const step = g.room.snapshot().game!.turn.step
    g.room.disconnect('c1')
    g.wait(SKIP_AFTER_MS)
    const out = skip(g.room, 'c0', 'p2')
    expect(to(out, 'c0', 'skipped')[0]).toMatchObject({ player: 'p2', decision: 'priority' })
    expect(g.room.snapshot().actions.at(-1)).toEqual({ type: 'passPriority', player: 'p2' })
    expect(g.room.snapshot().game!.turn.step).not.toBe(step) // p1's stops passed too: the step moved on
    expect(errorOf(skip(g.room, 'c0', 'p1'), 'c0')).toMatchObject({ message: 'A partida não está esperando esse jogador.' })
  })

  it('declares no blockers, then confirms the proposed damage', () => {
    const g = game()
    g.keepAll()
    g.room.disconnect('c1')
    const room = reloadWith(g, (s) => {
      const attacker = s.zones.p1!.library.pop()!
      s.objects[attacker]!.zone = 'battlefield'
      s.battlefield.push(attacker)
      s.turn = {
        ...s.turn, active: 'p1', step: 'declareBlockers',
        combat: { attacks: [{ attacker, target: 'p2' }], blocks: [], damageOrder: {}, firstStrikeDealt: false, regularDealt: false },
      }
      s.priority = null
      s.pending = { kind: 'declareBlockers', player: 'p2', players: ['p2'] }
    })
    expect(errorOf(skip(room, 'c0', 'p2'), 'c0')).toMatchObject({ code: 'cannotSkip' }) // the wait counts from the reload
    g.wait(SKIP_AFTER_MS)
    expect(to(skip(room, 'c0', 'p2'), 'c0', 'skipped')[0]).toMatchObject({ decision: 'declareBlockers' })
    expect(room.snapshot().actions.at(-1)).toEqual({ type: 'declareBlockers', player: 'p2', blocks: [] })
    expect(room.snapshot().game!.pending).toBeNull()

    // The host is the one who confirms damage here: someone connected is never skipped.
    const withDamage = reloadWith(g, (s) => {
      const attacker = s.zones.p2!.library.pop()!
      s.objects[attacker]!.zone = 'battlefield'
      s.battlefield.push(attacker)
      s.turn = {
        ...s.turn, active: 'p2', step: 'combatDamage',
        combat: { attacks: [{ attacker, target: 'p1' }], blocks: [], damageOrder: {}, firstStrikeDealt: false, regularDealt: false },
      }
      s.priority = null
      s.pending = { kind: 'confirmDamage', player: 'p2', proposal: { phase: 'regular', assignments: [{ source: attacker, to: 'p1', amount: 2 }] } }
    })
    g.wait(SKIP_AFTER_MS)
    expect(to(skip(withDamage, 'c0', 'p2'), 'c0', 'skipped')[0]).toMatchObject({ decision: 'confirmDamage' })
    expect(withDamage.snapshot().game!.players.p1!.life).toBe(38)
  })

  it('discards the most recently drawn cards in cleanup', () => {
    const g = game()
    g.keepAll()
    g.room.disconnect('c1')
    let hand: string[] = []
    const room = reloadWith(g, (s) => {
      s.turn = { ...s.turn, active: 'p2', step: 'cleanup', combat: null }
      s.priority = null
      s.pending = { kind: 'discard', player: 'p2', count: 2 }
      hand = [...s.zones.p2!.hand]
    })
    g.wait(SKIP_AFTER_MS)
    expect(to(skip(room, 'c0', 'p2'), 'c0', 'skipped')[0]).toMatchObject({ decision: 'discard' })
    const game2 = room.snapshot().game!
    expect(game2.zones.p2!.graveyard).toEqual(hand.slice(-2))
    expect(game2.turn.active).toBe('p1')
  })

  it('refuses an exception request for a voter who left', () => {
    const g = game()
    g.keepAll()
    g.room.disconnect('c1')
    const room = reloadWith(g, (s) => {
      s.pending = { kind: 'exception', player: 'p1', action: { type: 'draw', player: 'p1', count: 1 }, reason: 'teste', findings: [], approvals: [] }
    })
    g.wait(SKIP_AFTER_MS)
    expect(errorOf(skip(room, 'c0', 'p1'), 'c0')).toMatchObject({ code: 'cannotSkip' }) // the requester is not waited on
    expect(to(skip(room, 'c0', 'p2'), 'c0', 'skipped')[0]).toMatchObject({ decision: 'exception' })
    expect(room.snapshot().game!.pending).toBeNull()
  })
})
