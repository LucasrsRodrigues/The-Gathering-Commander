// What one player is allowed to see (CR 400.2: hidden vs public zones). This is the only shape
// a UI, a remote client or a bot should ever receive.

import { commanderTax } from './commander'
import { isSummoningSick } from './mana'
import { isCreature, powerOf, toughnessOf } from './stats'
import type {
  Arrangement, CardRef, GameEvent, GameState, ManaPool, ObjectId, PendingDecision, PlayerId, PriorityState, Ruleset,
  StackItem, TurnState, ZoneKind,
} from './types'

export interface ObjectView {
  id: ObjectId
  owner: PlayerId
  controller: PlayerId
  zone: ZoneKind
  card: CardRef | null // null when the viewer may not see the face
  tapped: boolean
  faceDown: boolean
  counters: Record<string, number>
  isToken: boolean
  isCommander: boolean
  commanderTax: number
  arrangement?: Arrangement
  summoningSick: boolean // épico 09: creature that cannot attack or use {T} yet
  power: number | null // current, for creatures with data (null = unknown or not a creature)
  toughness: number | null
  damage: number
}

export interface PlayerPublicView {
  id: PlayerId
  name: string
  life: number
  poison: number
  commanderDamage: Record<ObjectId, number>
  mulligans: number
  hasKept: boolean
  lost: boolean
  manaPool: ManaPool // public (CR 106.4)
  landsPlayed: number
  handCount: number
  libraryCount: number
  hand: ObjectId[] // only filled for the viewer
  graveyard: ObjectId[]
  exile: ObjectId[]
  command: ObjectId[]
}

export interface PlayerView {
  viewer: PlayerId | null // null = spectator, sees public information only
  status: GameState['status']
  ruleset: Ruleset
  seats: PlayerId[]
  turn: TurnState
  priority: PriorityState | null
  pending: PendingDecision | null
  winners: PlayerId[] | null
  players: Record<PlayerId, PlayerPublicView>
  objects: Record<ObjectId, ObjectView>
  battlefield: ObjectId[]
  stack: StackItem[]
}

export function viewFor(state: GameState, viewer: PlayerId | null): PlayerView {
  const objects: Record<ObjectId, ObjectView> = {}
  const show = (id: ObjectId) => {
    const obj = state.objects[id]
    if (!obj) return
    const faceHidden = obj.faceDown && obj.controller !== viewer
    const stats = !faceHidden && isCreature(obj) && !!obj.card.rules && !obj.card.rules.variablePT
    objects[id] = {
      id, owner: obj.owner, controller: obj.controller, zone: obj.zone,
      card: faceHidden ? null : obj.card,
      tapped: obj.tapped, faceDown: obj.faceDown, counters: obj.counters,
      isToken: obj.isToken, isCommander: obj.isCommander,
      commanderTax: commanderTax(obj, state.ruleset),
      summoningSick: obj.zone === 'battlefield' && isSummoningSick(state, obj),
      power: stats ? powerOf(obj) : null,
      toughness: stats ? toughnessOf(obj) : null,
      damage: obj.damage,
      ...(obj.arrangement ? { arrangement: obj.arrangement } : {}),
    }
  }

  const players: Record<PlayerId, PlayerPublicView> = {}
  for (const id of state.seats) {
    const p = state.players[id]!
    const zones = state.zones[id]!
    const ownHand = id === viewer
    if (ownHand) zones.hand.forEach(show)
    zones.graveyard.forEach(show)
    zones.exile.forEach(show)
    zones.command.forEach(show)
    players[id] = {
      id, name: p.name, life: p.life, poison: p.poison, commanderDamage: p.commanderDamage,
      mulligans: p.mulligans, hasKept: p.hasKept, lost: p.lost, manaPool: p.manaPool, landsPlayed: p.landsPlayed,
      handCount: zones.hand.length, libraryCount: zones.library.length,
      hand: ownHand ? zones.hand : [],
      graveyard: zones.graveyard, exile: zones.exile, command: zones.command,
    }
  }
  state.battlefield.forEach(show)
  state.stack.forEach((item) => item.objectId && show(item.objectId))

  return {
    viewer, status: state.status, ruleset: state.ruleset, seats: state.seats, turn: state.turn,
    priority: state.priority, pending: state.pending, winners: state.winners,
    players, objects, battlefield: state.battlefield, stack: state.stack,
  }
}

// A zone is visible to the viewer when it is public, or it is their own hand/library.
function zoneVisible(zone: ZoneKind | null, owner: PlayerId, viewer: PlayerId | null): boolean {
  if (zone === 'hand' || zone === 'library') return owner === viewer
  return true
}

// Events filtered the same way as views: an object id never reaches someone who cannot see where the
// object went (otherwise opponents could track cards into hidden zones). Draws and bottomed cards of
// other players reveal only how many.
export function eventsFor(events: GameEvent[], viewer: PlayerId | null): GameEvent[] {
  return events.flatMap((e): GameEvent[] => {
    if ((e.type === 'cardsDrawn' || e.type === 'cardsBottomed') && e.player !== viewer) {
      return [{ ...e, objectIds: e.objectIds.map(() => 'hidden') }]
    }
    if (e.type === 'zoneChanged' && !zoneVisible(e.to, e.owner, viewer)) return [{ ...e, objectId: 'hidden' }]
    if (e.type === 'commanderMayReturn' && e.owner !== viewer) return []
    return [e]
  })
}
