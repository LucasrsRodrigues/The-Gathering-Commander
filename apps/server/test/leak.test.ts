// Fitness function (spec 07, req 6): over a random 4-seat game played through the room, no message sent
// to a connection may contain another player's hand or any library — the engine invariant, now on the wire.

import type { ActionIntent, GameState, ZoneKind } from '@gathering-hall/engine'
import type { ServerMessage } from '@gathering-hall/protocol'
import { describe, expect, it } from 'vitest'
import type { Outgoing } from '../src/room/room'
import { msg, seatedRoom } from './helpers'

const ZONES: ZoneKind[] = ['hand', 'battlefield', 'graveyard', 'exile', 'library', 'stack', 'command']

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) >>> 0
    return s / 2 ** 32
  }
}

function randomIntent(game: GameState, player: string, r: () => number): ActionIntent {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!
  // Turn-rule decisions (épico 09) are answered so the game keeps moving.
  switch (game.pending?.kind) {
    case 'exception': return { type: 'answerException', approve: r() < 0.5 }
    case 'declareAttackers': return { type: 'declareAttackers', attacks: [] }
    case 'declareBlockers': return { type: 'declareBlockers', blocks: [] }
    case 'confirmDamage': return { type: 'assignDamage', assignments: game.pending.proposal.assignments }
    case 'discard': return { type: 'discard', objectIds: game.zones[player]!.hand.slice(0, game.pending.count) }
    default: break
  }
  const own = Object.values(game.objects).filter((o) => o.owner === player && o.zone !== 'library')
  const hand = game.zones[player]?.hand ?? []
  const lands = game.battlefield.filter((id) => game.objects[id]!.controller === player)
  // Épico 09 actions, with every turn rule on: playing, casting, mana and asking for exceptions.
  if (r() < 0.35) {
    switch (Math.floor(r() * 5)) {
      case 0: if (hand.length) return { type: 'playLand', objectId: pick(hand) }; break
      case 1: if (hand.length) return { type: 'castSpell', objectId: pick(hand) }; break
      case 2: if (lands.length) return { type: 'activateMana', objectId: pick(lands), abilityIndex: 0 }; break
      case 3: if (hand.length) return { type: 'requestException', action: { type: 'castSpell', objectId: pick(hand) }, reason: 'fuzz' }; break
      default: break
    }
  }
  switch (Math.floor(r() * 6)) {
    case 0: return { type: 'passPriority' }
    case 1: return { type: 'advanceStep' }
    case 2: return own.length ? { type: 'moveObject', objectId: pick(own).id, to: pick(ZONES) } : { type: 'draw', count: 1 }
    case 3: return { type: 'draw', count: 1 }
    case 4: return { type: 'keepHand' }
    default: return { type: 'adjustLife', target: pick(game.seats), delta: -1 }
  }
}

function hiddenFrom(game: GameState, viewer: string | null): Set<string> {
  const hidden = new Set<string>()
  // A rule-exception request reveals the card it is about, on purpose (épico 09): approvers see what they approve.
  const revealed = game.pending?.kind === 'exception' && 'objectId' in game.pending.action ? game.pending.action.objectId : null
  for (const seat of game.seats) {
    if (seat === viewer) continue // you know which of your own cards you moved, even into your library
    game.zones[seat]!.library.forEach((id) => hidden.add(id))
    game.zones[seat]!.hand.forEach((id) => id !== revealed && hidden.add(id))
  }
  return hidden
}

function check(out: Outgoing[], game: GameState, viewerOf: Record<string, string | null>) {
  for (const { to, msg: m } of out) {
    if (m.t !== 'state') continue
    const hidden = hiddenFrom(game, viewerOf[to] ?? null)
    const text = JSON.stringify(m satisfies ServerMessage)
    for (const id of hidden) {
      expect(text.includes(`"${id}"`), `${to} recebeu o objeto oculto ${id}`).toBe(false)
    }
  }
}

describe('protocol leak fitness function', () => {
  for (const seed of [1, 2, 3]) {
    it(`never sends hidden objects to the wrong connection (seed ${seed})`, () => {
      const { room } = seatedRoom(4)
      room.receive('spy', msg({ t: 'hello', room: 'room-1', spectator: true }))
      const viewerOf: Record<string, string | null> = { c0: 'p1', c1: 'p2', c2: 'p3', c3: 'p4', spy: null }
      let out = room.receive('c0', msg({ t: 'start' }))
      const r = rng(seed)
      let sent = 0
      for (let i = 0; i < 400 && room.snapshot().status === 'playing'; i++) {
        check(out, room.snapshot().game!, viewerOf)
        const game = room.snapshot().game!
        // An open exception request waits on the other players; any other decision on its decider.
        const voter = game.pending?.kind === 'exception' ? game.seats.find((id) => id !== game.pending!.player && !game.players[id]!.lost) : undefined
        const player = voter ?? game.pending?.player ?? (r() < 0.7 ? game.priority?.player : undefined) ?? `p${1 + Math.floor(r() * 4)}`
        out = room.receive(`c${Number(player.slice(1)) - 1}`, msg({ t: 'act', seq: i, action: randomIntent(game, player, r) }))
        sent += out.filter((o) => o.msg.t === 'state').length
      }
      expect(sent).toBeGreaterThan(200)
    })
  }
})
