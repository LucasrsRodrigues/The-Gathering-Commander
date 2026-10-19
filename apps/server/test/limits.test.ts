// T7.8: abuse limits — a room link must not let anyone lock out friends or grow the game without bound.
import { afterEach, describe, expect, it } from 'vitest'
import { LIMITS, Room } from '../src/room/room'
import { msg, seatedRoom, testDeps, to } from './helpers'

const saved = { ...LIMITS }
afterEach(() => Object.assign(LIMITS, saved))

function playing() {
  const r = seatedRoom(2)
  r.room.receive('c0', msg({ t: 'start' }))
  for (let seq = 1; r.room.snapshot().game!.pending; seq++) {
    const p = r.room.snapshot().game!.pending!.player
    r.room.receive(`c${Number(p.slice(1)) - 1}`, msg({ t: 'act', seq, action: { type: 'keepHand' } }))
  }
  return r.room
}

describe('room abuse limits', () => {
  it('hello spam cannot fill the room: idle unseated members are pruned for newcomers', () => {
    const { room } = Room.create('r', testDeps())
    for (let i = 0; i < 40; i++) {
      room.receive(`spam${i}`, msg({ t: 'hello', room: 'r' }))
      room.disconnect(`spam${i}`)
    }
    const friend = room.receive('friend', msg({ t: 'hello', room: 'r' }))
    expect(to(friend, 'friend', 'error')).toEqual([])
    expect(to(friend, 'friend', 'welcome')).toHaveLength(1)
    expect(room.snapshot().members.length).toBeLessThanOrEqual(24)
  })

  it('caps tokens and stack size per game', () => {
    const room = playing()
    const active = room.snapshot().game!.turn.active
    const conn = `c${Number(active.slice(1)) - 1}`
    LIMITS.objects = Object.keys(room.snapshot().game!.objects).length + 1
    room.receive(conn, msg({ t: 'act', seq: 100, action: { type: 'createToken', card: { name: 'Goblin' } } }))
    const over = room.receive(conn, msg({ t: 'act', seq: 101, action: { type: 'createToken', card: { name: 'Goblin' } } }))
    expect(to(over, conn, 'rejected')[0]).toMatchObject({ seq: 101 })

    LIMITS.stack = 2
    room.receive(conn, msg({ t: 'act', seq: 102, action: { type: 'putAbilityOnStack', description: 'a' } }))
    room.receive(conn, msg({ t: 'act', seq: 103, action: { type: 'putAbilityOnStack', description: 'b' } }))
    const full = room.receive(conn, msg({ t: 'act', seq: 104, action: { type: 'putAbilityOnStack', description: 'c' } }))
    expect(to(full, conn, 'rejected')[0]).toMatchObject({ seq: 104 })
    expect(room.snapshot().game!.stack).toHaveLength(2)
  })

  it('stops growing the replay log past the limit while the game goes on', () => {
    const room = playing()
    LIMITS.loggedActions = room.snapshot().actions.length
    const conn = `c${Number(room.snapshot().game!.turn.active.slice(1)) - 1}`
    room.receive(conn, msg({ t: 'act', seq: 200, action: { type: 'draw', count: 1 } }))
    expect(room.snapshot().actions).toHaveLength(LIMITS.loggedActions)
    expect(room.snapshot().version).toBeGreaterThan(LIMITS.loggedActions)
  })
})
