import { describe, expect, it } from 'vitest'
import { SqliteRoomStore } from '../src/store'
import { msg, seatedRoom } from './helpers'

// What the store held for a game started before épico 09 (engine schema 1).
function asV1(game: object): object {
  const s = structuredClone(game) as Record<string, unknown> & { ruleset: Record<string, unknown>; players: Record<string, Record<string, unknown>>; objects: Record<string, Record<string, unknown>>; turn: Record<string, unknown> }
  s.schemaVersion = 1
  delete s.options
  for (const k of ['landsPerTurn', 'timingRules', 'manaRules', 'combatRules']) delete s.ruleset[k]
  for (const p of Object.values(s.players)) for (const k of ['manaPool', 'landsPlayed', 'lastTurnStarted', 'stops', 'passUntil']) delete p[k]
  for (const o of Object.values(s.objects)) for (const k of ['damage', 'deathtouchDamage', 'controlledSince', 'ptMods']) delete o[k]
  delete s.turn.combat
  return s
}

describe('SqliteRoomStore', () => {
  it('opens rooms saved by an older engine, with the new turn rules switched off', () => {
    const { room } = seatedRoom(2)
    room.receive('c0', msg({ t: 'start' }))
    const snap = room.snapshot()
    const store = new SqliteRoomStore(':memory:')
    store.save({ ...snap, game: asV1(snap.game!) as never, initial: asV1(snap.initial!) as never })

    const loaded = store.load(snap.id)!
    expect(loaded.game?.schemaVersion).toBe(2)
    expect(loaded.initial?.schemaVersion).toBe(2)
    expect(loaded.game?.ruleset).toMatchObject({ timingRules: 'off', manaRules: 'off', combatRules: 'off' })
    expect(loaded.game?.options).toEqual({ exceptionApproval: 'vote' })
    store.close()
  })

  it('new online games vote on rule exceptions', () => {
    const { room } = seatedRoom(2)
    room.receive('c0', msg({ t: 'start' }))
    expect(room.snapshot().game?.options).toEqual({ exceptionApproval: 'vote' })
  })
})
