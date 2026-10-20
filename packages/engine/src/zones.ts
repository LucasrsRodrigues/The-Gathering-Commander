// Zone mechanics shared by every handler: moving objects, drawing, shuffling.

import { shuffle } from './rng'
import { LOYALTY } from './stats'
import { queueEnterTriggers } from './triggers'
import type { Tx } from './tx'
import type { GameObject, ObjectId, PlayerId, PlayerZoneKind, ZoneKind } from './types'

const PERMANENT_TYPES = ['artifact', 'creature', 'enchantment', 'planeswalker', 'land', 'battle']

// CR 110.4: a permanent card resolves onto the battlefield. Unknown type lines default to
// permanent so the sandbox never "loses" a card; the player can move it afterwards.
export function isPermanentCard(obj: GameObject): boolean {
  const typeLine = obj.card.typeLine?.toLowerCase()
  if (!typeLine) return true
  const front = typeLine.split('//')[0] ?? typeLine
  return PERMANENT_TYPES.some((t) => front.includes(t))
}

export function isPlayerZone(zone: ZoneKind): zone is PlayerZoneKind {
  return zone !== 'battlefield' && zone !== 'stack'
}

function removeFromZone(tx: Tx, obj: GameObject) {
  if (obj.zone === 'battlefield') {
    const list = tx.battlefield()
    list.splice(list.indexOf(obj.id), 1)
  } else if (obj.zone === 'stack') {
    const stack = tx.stack()
    stack.splice(stack.findIndex((item) => item.objectId === obj.id), 1)
  } else {
    const list = tx.zone(obj.owner, obj.zone)
    list.splice(list.indexOf(obj.id), 1)
  }
}

export interface MoveOptions {
  position?: 'top' | 'bottom'
  faceDown?: boolean
  controller?: PlayerId // who controls it on the battlefield / stack (defaults to owner)
}

// Moves an object between zones applying the generic zone-change rules:
// CR 400.7 (new object: untapped, no counters), 111.7 (tokens cease to exist off the battlefield),
// 903.8 (commander cast count) and 903.9 (commander may return to the command zone).
export function moveObject(tx: Tx, id: ObjectId, to: ZoneKind, opts: MoveOptions = {}) {
  const before = tx.peekObject(id)
  if (!before) throw new Error(`unknown object ${id}`)
  const from = before.zone
  removeFromZone(tx, before)

  if (before.isToken && to !== 'battlefield') {
    tx.deleteObject(id)
    tx.emit({ type: 'zoneChanged', objectId: id, owner: before.owner, from, to: null })
    return
  }

  const obj = tx.object(id)
  obj.zone = to
  obj.tapped = false
  obj.counters = {}
  delete obj.arrangement
  obj.faceDown = opts.faceDown ?? false
  obj.controller = to === 'battlefield' || to === 'stack' ? (opts.controller ?? obj.owner) : obj.owner
  obj.timestamp = tx.tick()
  obj.damage = 0
  obj.deathtouchDamage = false
  obj.ptMods = []
  obj.controlledSince = tx.s.turn.number

  if (to === 'battlefield') {
    tx.battlefield().push(id)
    // CR 306.5b: a planeswalker enters with its printed loyalty.
    const loyalty = obj.card.rules?.types.includes('planeswalker') ? obj.card.rules.loyalty : null
    if (loyalty) obj.counters = { [LOYALTY]: loyalty }
    if (!obj.faceDown) queueEnterTriggers(tx, id) // épico 11: "when this enters"
  } else if (to === 'stack') {
    if (obj.isCommander && from === 'command') obj.commanderCasts += 1
    const item = { id, kind: 'card' as const, controller: obj.controller, objectId: id }
    tx.stack().push(item)
    tx.emit({ type: 'stackItemAdded', item })
  } else {
    const list = tx.zone(obj.owner, to)
    if (opts.position === 'bottom') list.unshift(id)
    else list.push(id)
  }

  tx.emit({ type: 'zoneChanged', objectId: id, owner: obj.owner, from, to })
  if (obj.isCommander && to !== 'command' && to !== 'battlefield' && to !== 'stack') {
    tx.emit({ type: 'commanderMayReturn', objectId: id, owner: obj.owner })
  }
}

// CR 121.4 / 704.5b: drawing from an empty library is remembered and checked as a state-based action.
export function drawCards(tx: Tx, player: PlayerId, count: number) {
  const drawn: ObjectId[] = []
  for (let i = 0; i < count; i++) {
    const library = tx.s.zones[player]?.library ?? []
    const top = library[library.length - 1]
    if (top === undefined) {
      tx.player(player).drewFromEmptyLibrary = true
      break
    }
    tx.zone(player, 'library').pop()
    tx.zone(player, 'hand').push(top)
    const obj = tx.object(top)
    obj.zone = 'hand'
    obj.timestamp = tx.tick()
    drawn.push(top)
  }
  if (drawn.length) tx.emit({ type: 'cardsDrawn', player, objectIds: drawn })
}

export function shuffleLibrary(tx: Tx, player: PlayerId) {
  const [shuffled, rng] = shuffle(tx.s.zones[player]?.library ?? [], tx.s.rng)
  const library = tx.zone(player, 'library')
  library.splice(0, library.length, ...shuffled)
  tx.s.rng = rng
  tx.emit({ type: 'libraryShuffled', player })
}
