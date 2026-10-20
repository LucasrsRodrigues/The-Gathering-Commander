// State-based actions (CR 704): permanents that die from damage or stats (épico 09), losing the game
// (CR 704.5a-c, 903.10a) and leaving the game (CR 800.4).

import { leaveCombatDecision } from './combat'
import { continueMulligans } from './mulligan'
import { beginTurn, givePriority, nextPlayerAfter, playersInOrder } from './turn'
import type { Tx } from './tx'
import type { GameEvent, LossReason, PlayerId, PlayerState } from './types'
import { hasKeywordNow } from './layers'
import { hasKnownStats, isCreature, isPlaneswalker, LOYALTY, MINUS_ONE, PLUS_ONE, toughnessOf } from './stats'
import { leaveTriggers } from './triggers'
import { moveObject } from './zones'

function lossReason(p: PlayerState, poisonLimit: number, commanderDamageLimit: number): LossReason | null {
  if (p.life <= 0) return 'life'
  if (p.drewFromEmptyLibrary) return 'emptyLibrary'
  if (p.poison >= poisonLimit) return 'poison'
  if (Object.values(p.commanderDamage).some((d) => d >= commanderDamageLimit)) return 'commanderDamage'
  return null
}

export function checkStateBasedActions(tx: Tx) {
  if (tx.s.status !== 'playing') return
  if (tx.s.ruleset.combatRules !== 'off') checkPermanents(tx)
  if (!tx.s.ruleset.autoLoss) return
  const { poisonLimit, commanderDamageLimit } = tx.s.ruleset
  for (const id of tx.s.seats) {
    const p = tx.s.players[id]!
    if (p.lost) continue
    const reason = lossReason(p, poisonLimit, commanderDamageLimit)
    if (reason) eliminate(tx, id, reason)
  }
}

// CR 704.5f–i, 704.5q, repeated until nothing changes (CR 704.3). Only for permanents with known stats: cards
// without data or with '*' P/T are left to the players.
function checkPermanents(tx: Tx) {
  for (let changed = true; changed;) {
    changed = false
    for (const id of tx.s.battlefield.slice()) {
      const obj = tx.s.objects[id]!
      const plus = obj.counters[PLUS_ONE] ?? 0
      const minus = obj.counters[MINUS_ONE] ?? 0
      if (plus && minus) {
        // CR 704.5q: +1/+1 and -1/-1 counters cancel out in pairs.
        const n = Math.min(plus, minus)
        const counters: Record<string, number> = { ...obj.counters, [PLUS_ONE]: plus - n, [MINUS_ONE]: minus - n }
        for (const k of [PLUS_ONE, MINUS_ONE]) if (!counters[k]) delete counters[k]
        tx.object(id).counters = counters
        changed = true
        continue
      }
      if (!hasKnownStats(obj)) continue
      let reason: Extract<GameEvent, { type: 'destroyed' }>['reason'] | null = null
      if (isCreature(tx.s, obj)) {
        const toughness = toughnessOf(tx.s, obj)
        if (toughness <= 0) reason = 'toughness' // CR 704.5f: not destruction, Indestructible does not help
        else if ((obj.damage >= toughness || (obj.deathtouchDamage && obj.damage > 0)) && !hasKeywordNow(tx.s, obj, 'indestructible')) reason = 'damage' // 704.5g–h
      } else if (isPlaneswalker(tx.s, obj) && obj.card.rules!.loyalty !== null && (obj.counters[LOYALTY] ?? 0) <= 0) {
        reason = 'loyalty' // CR 704.5i
      }
      if (!reason) continue
      tx.emit({ type: 'destroyed', objectId: id, reason })
      moveObject(tx, id, 'graveyard')
      changed = true
    }
  }
}

// CR 800.4a: the player leaves the game and the objects they own leave with them.
export function eliminate(tx: Tx, player: PlayerId, reason: LossReason) {
  const p = tx.player(player)
  if (p.lost) return
  p.lost = true
  p.lossReason = reason
  tx.emit({ type: 'playerLost', player, reason })

  for (const id of tx.s.battlefield.slice()) {
    if (tx.s.objects[id]?.owner === player) removeFromGame(tx, id, 'battlefield')
  }
  for (const item of tx.s.stack.slice()) {
    const owner = item.objectId ? tx.s.objects[item.objectId]?.owner : item.controller
    if (owner === player) {
      const stack = tx.stack()
      stack.splice(stack.indexOf(item), 1)
      if (item.objectId) removeFromGame(tx, item.objectId, null)
    }
  }

  if (finishIfOver(tx)) return
  leaveCombatDecision(tx, player)
  leaveTriggers(tx, player)
  const s = tx.s
  if (s.status === 'mulligan') {
    if (s.pending?.player === player) continueMulligans(tx)
    return
  }
  if (s.turn.active === player) {
    const next = nextPlayerAfter(s, player)
    if (next) beginTurn(tx, next, s.turn.number + 1)
  } else if (s.priority) {
    const passed = s.priority.passed.filter((id) => id !== player)
    if (s.priority.player === player) {
      const next = playersInOrder(s, player).find((id) => !passed.includes(id))
      if (next) s.priority = { player: next, passed }
      else givePriority(tx, s.turn.active)
    } else {
      s.priority = { ...s.priority, passed }
    }
  }
}

function removeFromGame(tx: Tx, id: string, list: 'battlefield' | null) {
  const obj = tx.s.objects[id]
  if (!obj) return
  if (list === 'battlefield') {
    const bf = tx.battlefield()
    bf.splice(bf.indexOf(id), 1)
  }
  tx.deleteObject(id)
  tx.emit({ type: 'zoneChanged', objectId: id, owner: obj.owner, from: obj.zone, to: null })
}

// A multiplayer game ends with one player left; a solo (goldfish) game ends when that player loses.
function finishIfOver(tx: Tx): boolean {
  const s = tx.s
  const alive = s.seats.filter((id) => !s.players[id]!.lost)
  const over = s.seats.length > 1 ? alive.length <= 1 : alive.length === 0
  if (!over) return false
  s.status = 'ended'
  s.priority = null
  s.pending = null
  s.winners = alive
  tx.emit({ type: 'gameEnded', winners: alive })
  return true
}
