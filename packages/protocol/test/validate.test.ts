import { officialPreset } from '@gathering-hall/formats'
import { describe, expect, it } from 'vitest'
import { decodeClientMessage, MAX_MESSAGE_BYTES } from '../src'

const ROOM = 'abcdefghijklmnopqrstuv'
const enc = (m: unknown) => JSON.stringify(m)
const decode = (m: unknown) => decodeClientMessage(enc(m))
const deck = { commanders: [{ name: 'Krenko, Mob Boss', typeLine: 'Legendary Creature' }], cards: [{ name: 'Sol Ring' }] }

describe('decodeClientMessage', () => {
  it('accepts every well-formed message type', () => {
    for (const m of [
      { v: 1, t: 'hello', room: ROOM },
      { v: 1, t: 'hello', room: ROOM, token: 'ABCDEFGHIJKLMNOPQRSTUV', spectator: true },
      { v: 1, t: 'sit', seat: 3, name: 'Ana', deck },
      { v: 1, t: 'stand' }, { v: 1, t: 'start' }, { v: 1, t: 'rematch' }, { v: 1, t: 'ping' },
      { v: 1, t: 'configure', preset: { ...officialPreset(), id: 'g', name: 'Grupo', ruleset: { startingLife: 30 } } },
      { v: 1, t: 'act', seq: 7, action: { type: 'moveObject', objectId: 'o12', to: 'battlefield', faceDown: false } },
      { v: 1, t: 'act', seq: 8, action: { type: 'playLand', objectId: 'o3' } },
      { v: 1, t: 'act', seq: 9, action: { type: 'castSpell', objectId: 'o4', x: 3 } },
      { v: 1, t: 'act', seq: 10, action: { type: 'requestException', action: { type: 'playLand', objectId: 'o5' }, reason: 'Exploration' } },
      { v: 1, t: 'act', seq: 11, action: { type: 'answerException', approve: true } },
      { v: 1, t: 'act', seq: 12, action: { type: 'cancelException' } },
    ]) {
      expect(decode(m), JSON.stringify(m)).toEqual({ ok: true, msg: m })
    }
  })

  it('drops unknown keys everywhere, including inside actions and cards', () => {
    const result = decode({
      v: 1, t: 'act', seq: 1, evil: 1,
      action: { type: 'createToken', card: { name: 'Goblin', __proto__: { x: 1 }, payload: 'x'.repeat(100) }, extra: true },
    })
    expect(result).toEqual({ ok: true, msg: { v: 1, t: 'act', seq: 1, action: { type: 'createToken', card: { name: 'Goblin' } } } })
  })

  it.each([
    ['not JSON', '{'],
    ['wrong version', enc({ v: 2, t: 'ping' })],
    ['unknown type', enc({ v: 1, t: 'hack' })],
    ['bad room id', enc({ v: 1, t: 'hello', room: '../etc' })],
    ['seat out of range', enc({ v: 1, t: 'sit', seat: 4, name: 'A', deck })],
    ['control chars in name', enc({ v: 1, t: 'sit', seat: 0, name: 'A‮b', deck })],
    ['huge deck', enc({ v: 1, t: 'sit', seat: 0, name: 'A', deck: { commanders: [], cards: Array(251).fill({ name: 'X' }) } })],
    ['unknown action', enc({ v: 1, t: 'act', seq: 1, action: { type: 'winGame' } })],
    ['non-boolean faceDown', enc({ v: 1, t: 'act', seq: 1, action: { type: 'moveObject', objectId: 'o1', to: 'hand', faceDown: 'yes' } })],
    ['bad zone', enc({ v: 1, t: 'act', seq: 1, action: { type: 'moveObject', objectId: 'o1', to: 'moon' } })],
    ['infinite arrangement', '{"v":1,"t":"act","seq":1,"action":{"type":"setArrangement","objectId":"o1","arrangement":{"x":1e999,"z":0}}}'],
    ['absurd preset', enc({ v: 1, t: 'configure', preset: { ...officialPreset(), ruleset: { startingLife: 1e9 } } })],
    ['too big', 'x'.repeat(MAX_MESSAGE_BYTES + 1)],
    ['absurd X', enc({ v: 1, t: 'act', seq: 1, action: { type: 'castSpell', objectId: 'o1', x: 101 } })],
    ['nested exception', enc({ v: 1, t: 'act', seq: 1, action: { type: 'requestException', action: { type: 'requestException', action: { type: 'concede' }, reason: '' }, reason: '' } })],
    ['huge reason', enc({ v: 1, t: 'act', seq: 1, action: { type: 'requestException', action: { type: 'concede' }, reason: 'x'.repeat(201) } })],
    ['non-boolean answer', enc({ v: 1, t: 'act', seq: 1, action: { type: 'answerException', approve: 'sim' } })],
    ['negative X', enc({ v: 1, t: 'act', seq: 1, action: { type: 'castSpell', objectId: 'o1', x: -1 } })],
  ])('rejects %s', (_label, raw) => {
    expect(decodeClientMessage(raw).ok).toBe(false)
  })
})
