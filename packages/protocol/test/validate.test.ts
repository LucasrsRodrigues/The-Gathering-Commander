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
      { v: 1, t: 'stand' }, { v: 1, t: 'start' }, { v: 1, t: 'rematch' }, { v: 1, t: 'ping' }, { v: 1, t: 'skip', player: 'p4' },
      { v: 1, t: 'configure', preset: { ...officialPreset(), id: 'g', name: 'Grupo', ruleset: { startingLife: 30 } } },
      { v: 1, t: 'act', seq: 7, action: { type: 'moveObject', objectId: 'o12', to: 'battlefield', faceDown: false } },
      { v: 1, t: 'act', seq: 8, action: { type: 'playLand', objectId: 'o3' } },
      { v: 1, t: 'act', seq: 9, action: { type: 'castSpell', objectId: 'o4', x: 3 } },
      { v: 1, t: 'act', seq: 10, action: { type: 'requestException', action: { type: 'playLand', objectId: 'o5' }, reason: 'Exploration' } },
      { v: 1, t: 'act', seq: 11, action: { type: 'answerException', approve: true } },
      { v: 1, t: 'act', seq: 12, action: { type: 'cancelException' } },
      { v: 1, t: 'act', seq: 15, action: { type: 'castSpell', objectId: 'o4', payWith: [{ objectId: 'o6', abilityIndex: 0 }, { objectId: 'o8', abilityIndex: 1, color: 'B' }] } },
      { v: 1, t: 'act', seq: 16, action: { type: 'adjustPT', objectId: 'o4', power: 3, toughness: 3 } },
      { v: 1, t: 'act', seq: 17, action: { type: 'dealDamage', objectId: 'o4', amount: 3, deathtouch: true } },
      { v: 1, t: 'act', seq: 18, action: { type: 'declareAttackers', attacks: [{ attacker: 'o4', target: 'p2' }] } },
      { v: 1, t: 'act', seq: 19, action: { type: 'declareBlockers', blocks: [{ blocker: 'o9', attacker: 'o4' }] } },
      { v: 1, t: 'act', seq: 20, action: { type: 'assignDamage', assignments: [{ source: 'o4', to: 'p2', amount: 3 }] } },
      { v: 1, t: 'act', seq: 21, action: { type: 'discard', objectIds: ['o3', 'o5'] } },
      { v: 1, t: 'act', seq: 22, action: { type: 'castSpell', objectId: 'o4', targets: [{ object: 'o9' }, { player: 'p2' }] } },
      { v: 1, t: 'act', seq: 22, action: { type: 'setStops', stops: { own: ['main1', 'main2'], others: ['end'], passAfterOwnSpell: true } } },
      { v: 1, t: 'act', seq: 23, action: { type: 'passUntil', until: 'myTurn' } },
      { v: 1, t: 'act', seq: 24, action: { type: 'passUntil', until: null } },
      { v: 1, t: 'act', seq: 13, action: { type: 'activateMana', objectId: 'o6', abilityIndex: 1, color: 'G' } },
      { v: 1, t: 'act', seq: 14, action: { type: 'declareMana', objectId: 'o7', mana: { B: 2, C: 1 } } },
    ]) {
      expect(decode(m), JSON.stringify(m)).toEqual({ ok: true, msg: m })
    }
  })

  it('skips only a seat that can exist', () => {
    for (const player of ['p0', 'p5', 'P1', 1, undefined]) expect(decode({ v: 1, t: 'skip', player }).ok).toBe(false)
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
    ['huge payment', enc({ v: 1, t: 'act', seq: 1, action: { type: 'castSpell', objectId: 'o1', payWith: Array(61).fill({ objectId: 'o2', abilityIndex: 0 }) } })],
    ['attack without target', enc({ v: 1, t: 'act', seq: 1, action: { type: 'declareAttackers', attacks: [{ attacker: 'o1' }] } })],
    ['negative combat damage', enc({ v: 1, t: 'act', seq: 1, action: { type: 'assignDamage', assignments: [{ source: 'o1', to: 'p2', amount: -1 }] } })],
    ['unknown stop step', enc({ v: 1, t: 'act', seq: 1, action: { type: 'setStops', stops: { own: ['lunch'], others: [], passAfterOwnSpell: true } } })],
    ['target with both kinds', enc({ v: 1, t: 'act', seq: 1, action: { type: 'castSpell', objectId: 'o1', targets: [{ object: 'o2', player: 'p2' }] } })],
    ['too many targets', enc({ v: 1, t: 'act', seq: 1, action: { type: 'castSpell', objectId: 'o1', targets: Array(21).fill({ player: 'p2' }) } })],
    ['zero damage', enc({ v: 1, t: 'act', seq: 1, action: { type: 'dealDamage', objectId: 'o1', amount: 0 } })],
    ['absurd pump', enc({ v: 1, t: 'act', seq: 1, action: { type: 'adjustPT', objectId: 'o1', power: 1000, toughness: 0 } })],
    ['unknown mana color', enc({ v: 1, t: 'act', seq: 1, action: { type: 'activateMana', objectId: 'o1', abilityIndex: 0, color: 'P' } })],
    ['absurd declared mana', enc({ v: 1, t: 'act', seq: 1, action: { type: 'declareMana', objectId: 'o1', mana: { G: 999 } } })],
    ['negative X', enc({ v: 1, t: 'act', seq: 1, action: { type: 'castSpell', objectId: 'o1', x: -1 } })],
  ])('rejects %s', (_label, raw) => {
    expect(decodeClientMessage(raw).ok).toBe(false)
  })
})
