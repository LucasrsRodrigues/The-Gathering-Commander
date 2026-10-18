// London mulligan (CR 103.5) with the multiplayer free first mulligan (CR 103.5c).
// Players decide one at a time, starting with the starting player and going in turn order.

import { beginTurn, playersInOrder } from './turn'
import type { Tx } from './tx'
import type { ObjectId, PlayerId } from './types'
import { drawCards, moveObject, shuffleLibrary } from './zones'

export function continueMulligans(tx: Tx) {
  const s = tx.s
  const next = playersInOrder(s, s.startingPlayer).find((id) => !s.players[id]!.hasKept)
  if (next) {
    s.pending = { kind: 'mulligan', player: next }
    return
  }
  s.pending = null
  s.status = 'playing'
  const first = playersInOrder(s, s.startingPlayer)[0]
  if (!first) return
  tx.emit({ type: 'gameStarted', startingPlayer: first })
  beginTurn(tx, first, 1)
}

export function keepHand(tx: Tx, player: PlayerId) {
  const p = tx.player(player)
  p.hasKept = true
  tx.emit({ type: 'handKept', player })
  const toBottom = Math.max(0, p.mulligans - tx.s.ruleset.freeMulligans)
  const handSize = tx.s.zones[player]!.hand.length
  if (toBottom > 0 && handSize > 0) {
    tx.s.pending = { kind: 'bottomCards', player, count: Math.min(toBottom, handSize) }
  } else {
    continueMulligans(tx)
  }
}

export function takeMulligan(tx: Tx, player: PlayerId) {
  for (const id of tx.s.zones[player]!.hand.slice()) moveObject(tx, id, 'library')
  shuffleLibrary(tx, player)
  drawCards(tx, player, tx.s.ruleset.startingHandSize)
  const p = tx.player(player)
  p.mulligans += 1
  tx.emit({ type: 'mulliganTaken', player, mulligans: p.mulligans })
}

export function bottomCards(tx: Tx, player: PlayerId, objectIds: ObjectId[]) {
  for (const id of objectIds) moveObject(tx, id, 'library', { position: 'bottom' })
  tx.emit({ type: 'cardsBottomed', player, objectIds })
  continueMulligans(tx)
}
