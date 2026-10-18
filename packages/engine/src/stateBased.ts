// State-based actions about losing the game (CR 704.5a-c, 903.10a) and leaving the game (CR 800.4).

import { continueMulligans } from './mulligan'
import { beginTurn, givePriority, nextPlayerAfter, playersInOrder } from './turn'
import type { Tx } from './tx'
import type { LossReason, PlayerId, PlayerState } from './types'

function lossReason(p: PlayerState, poisonLimit: number, commanderDamageLimit: number): LossReason | null {
  if (p.life <= 0) return 'life'
  if (p.drewFromEmptyLibrary) return 'emptyLibrary'
  if (p.poison >= poisonLimit) return 'poison'
  if (Object.values(p.commanderDamage).some((d) => d >= commanderDamageLimit)) return 'commanderDamage'
  return null
}

export function checkStateBasedActions(tx: Tx) {
  if (tx.s.status !== 'playing' || !tx.s.ruleset.autoLoss) return
  const { poisonLimit, commanderDamageLimit } = tx.s.ruleset
  for (const id of tx.s.seats) {
    const p = tx.s.players[id]!
    if (p.lost) continue
    const reason = lossReason(p, poisonLimit, commanderDamageLimit)
    if (reason) eliminate(tx, id, reason)
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
