// The single entry point that changes a game: reduce(state, action) → new state + events, or an error.
// Pipeline: validate → apply → state-based actions (CR 704.3). The input state is never mutated.

import { RuleViolation, fail } from './errors'
import { bottomCards, keepHand, takeMulligan } from './mulligan'
import { checkStateBasedActions, eliminate } from './stateBased'
import { advanceStep, givePriority, passPriority } from './turn'
import { Tx } from './tx'
import type { Action, CardRef, GameObject, GameState, PlayerId, ReduceResult, ZoneKind } from './types'
import { drawCards, moveObject, shuffleLibrary } from './zones'

const ZONES: readonly ZoneKind[] = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'stack', 'command']
const MULLIGAN_ACTIONS = new Set<Action['type']>(['keepHand', 'mulligan', 'bottomCards'])
// Actions that do not take priority: bookkeeping or leaving the game.
const NO_PRIORITY_ACTIONS = new Set<Action['type']>(['setArrangement', 'concede', 'passPriority', 'advanceStep'])
const MAX_BATCH = 100
const MAX_TEXT = 200
const MAX_COUNTER_NAME = 40
// Life, poison, damage and counter changes per action. Generous for any real game, but keeps
// numbers far from Number.MAX_SAFE_INTEGER no matter what a client sends.
const MAX_DELTA = 10_000
// Free arrangement on the table, in table units (the table is a few units wide).
const MAX_COORD = 1_000
const ACTION_TYPES = new Set<Action['type']>([
  'keepHand', 'mulligan', 'bottomCards', 'passPriority', 'advanceStep', 'moveObject', 'draw', 'mill',
  'shuffleLibrary', 'tap', 'untap', 'setFaceDown', 'addCounter', 'createToken', 'setArrangement',
  'adjustLife', 'adjustPoison', 'commanderDamage', 'putAbilityOnStack', 'concede',
])

export function reduce(state: GameState, action: Action): ReduceResult {
  try {
    // Actions may come from a UI, a bot or (later) the network: their shape is checked at runtime,
    // not just trusted from the TypeScript types.
    checkShape(action)
    const tx = new Tx(state)
    apply(tx, action)
    checkStateBasedActions(tx)
    return { ok: true, state: tx.s, events: tx.events }
  } catch (err) {
    if (err instanceof RuleViolation) return { ok: false, error: err.toGameError() }
    throw err
  }
}

function apply(tx: Tx, action: Action) {
  const s = tx.s
  const actor = action.player
  if (s.status === 'ended') fail('gameOver', 'A partida já terminou.')
  const player = own(s.players, actor)
  if (!player) fail('unknownPlayer', 'Jogador desconhecido.')
  if (player.lost) fail('playerLost', 'Esse jogador já saiu da partida.')

  if (action.type === 'concede') {
    eliminate(tx, actor, 'conceded')
    return
  }

  if (s.status === 'mulligan') {
    if (!MULLIGAN_ACTIONS.has(action.type)) fail('wrongPhase', 'Termine os mulligans antes de jogar.')
    applyMulligan(tx, action)
    return
  }
  if (MULLIGAN_ACTIONS.has(action.type)) fail('wrongPhase', 'A fase de mulligan já terminou.')

  if (s.ruleset.priorityMode === 'strict' && !NO_PRIORITY_ACTIONS.has(action.type) && s.priority?.player !== actor) {
    fail('strictPriority', 'Você precisa ter prioridade para agir.')
  }

  applyGameAction(tx, action)

  if (!NO_PRIORITY_ACTIONS.has(action.type) && tx.s.status === 'playing' && !tx.s.players[actor]!.lost) {
    // CR 117.3c: after acting, the player receives priority again.
    givePriority(tx, actor)
  }
}

function applyMulligan(tx: Tx, action: Action) {
  const pending = tx.s.pending
  if (!pending || pending.player !== action.player) fail('notYourDecision', 'Não é a sua vez de decidir.')
  switch (action.type) {
    case 'keepHand':
      if (pending.kind !== 'mulligan') fail('notYourDecision', 'Escolha as cartas para o fundo do grimório.')
      keepHand(tx, action.player)
      return
    case 'mulligan':
      if (pending.kind !== 'mulligan') fail('notYourDecision', 'Escolha as cartas para o fundo do grimório.')
      takeMulligan(tx, action.player)
      return
    case 'bottomCards': {
      if (pending.kind !== 'bottomCards') fail('notYourDecision', 'Não há cartas para colocar no fundo agora.')
      const ids = action.objectIds
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) fail('invalidAction', 'Ação malformada.')
      const hand = tx.s.zones[action.player]!.hand
      if (ids.length !== pending.count || new Set(ids).size !== ids.length || !ids.every((id) => hand.includes(id))) {
        fail('invalidSelection', `Escolha exatamente ${pending.count} carta(s) da sua mão.`)
      }
      bottomCards(tx, action.player, ids)
      return
    }
    default:
      return
  }
}

function applyGameAction(tx: Tx, action: Action) {
  const s = tx.s
  const actor = action.player
  switch (action.type) {
    case 'passPriority':
      if (s.priority?.player !== actor) fail('notYourPriority', 'Você não tem prioridade agora.')
      passPriority(tx, actor)
      return

    case 'advanceStep':
      if (s.ruleset.priorityMode !== 'relaxed') fail('strictPriority', 'No modo estrito, todos precisam passar a prioridade.')
      if (s.turn.active !== actor) fail('notActivePlayer', 'Só o jogador ativo pode avançar a etapa.')
      if (s.stack.length) fail('stackNotEmpty', 'Resolva a pilha antes de avançar.')
      advanceStep(tx)
      return

    case 'moveObject': {
      if (!ZONES.includes(action.to)) fail('invalidZone', 'Zona inválida.')
      if (action.position !== undefined && action.position !== 'top' && action.position !== 'bottom') {
        fail('invalidAction', 'Posição inválida.')
      }
      optionalBoolean(action.faceDown)
      const obj = touchable(tx, actor, action.objectId)
      moveObject(tx, obj.id, action.to, { position: action.position, faceDown: action.faceDown, controller: actor })
      return
    }

    case 'draw':
      drawCards(tx, actor, count(action.count))
      return

    case 'mill': {
      const n = count(action.count)
      for (let i = 0; i < n; i++) {
        const top = s.zones[actor]!.library.at(-1)
        if (top === undefined) break
        moveObject(tx, top, 'graveyard')
      }
      return
    }

    case 'shuffleLibrary':
      shuffleLibrary(tx, actor)
      return

    case 'tap':
    case 'untap': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield'])
      const tapped = action.type === 'tap'
      if (obj.tapped === tapped) return
      tx.object(obj.id).tapped = tapped
      tx.emit({ type: tapped ? 'tapped' : 'untapped', objectId: obj.id })
      return
    }

    case 'setFaceDown': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield', 'exile'])
      if (typeof action.faceDown !== 'boolean') fail('invalidAction', 'Ação malformada.')
      tx.object(obj.id).faceDown = action.faceDown
      tx.emit({ type: 'faceChanged', objectId: obj.id, faceDown: action.faceDown })
      return
    }

    case 'addCounter': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield', 'exile'])
      const counter = text(action.counter, MAX_COUNTER_NAME)
      // The name becomes an object key: refuse names that would reach Object.prototype.
      if (RESERVED_KEYS.has(counter)) fail('invalidAmount', 'Nome de marcador inválido.')
      const delta = amount(action.delta)
      const value = Math.min(MAX_DELTA, Math.max(0, (own(obj.counters, counter) ?? 0) + delta))
      const writable = tx.object(obj.id)
      if (value === 0) delete writable.counters[counter]
      else writable.counters[counter] = value
      tx.emit({ type: 'counterChanged', objectId: obj.id, counter, value })
      return
    }

    case 'createToken': {
      const card = tokenCard(action.card)
      optionalBoolean(action.tapped)
      const id = tx.newId('t')
      tx.addObject({
        id, owner: actor, controller: actor, card, zone: 'battlefield',
        tapped: !!action.tapped, faceDown: false, counters: {}, isToken: true, isCommander: false,
        commanderCasts: 0, timestamp: tx.tick(), damage: 0, deathtouchDamage: false, controlledSince: tx.s.turn.number, ptMods: [],
      })
      tx.battlefield().push(id)
      tx.emit({ type: 'tokenCreated', objectId: id })
      tx.emit({ type: 'zoneChanged', objectId: id, owner: actor, from: null, to: 'battlefield' })
      return
    }

    case 'setArrangement': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield'])
      const a = action.arrangement
      if (a != null && (typeof a !== 'object' || !coord(a.x) || !coord(a.z))) fail('invalidAmount', 'Posição inválida.')
      const writable = tx.object(obj.id)
      if (a) writable.arrangement = { x: a.x, z: a.z }
      else delete writable.arrangement
      tx.emit({ type: 'arranged', objectId: obj.id })
      return
    }

    case 'adjustLife': {
      const target = livingPlayer(tx, action.target)
      const delta = amount(action.delta)
      const p = tx.player(target)
      const from = p.life
      p.life += delta
      tx.emit({ type: 'lifeChanged', player: target, from, to: p.life })
      return
    }

    case 'adjustPoison': {
      const target = livingPlayer(tx, action.target)
      const delta = amount(action.delta)
      const p = tx.player(target)
      const from = p.poison
      p.poison = Math.max(0, p.poison + delta)
      tx.emit({ type: 'poisonChanged', player: target, from, to: p.poison })
      return
    }

    case 'commanderDamage': {
      const target = livingPlayer(tx, action.target)
      const commander = own(s.objects, action.commanderId)
      if (!commander?.isCommander) fail('unknownObject', 'Esse objeto não é um comandante.')
      const damage = amount(action.amount)
      optionalBoolean(action.alsoLife)
      const p = tx.player(target)
      const total = Math.max(0, (own(p.commanderDamage, commander.id) ?? 0) + damage)
      p.commanderDamage[commander.id] = total
      tx.emit({ type: 'commanderDamageDealt', player: target, commanderId: commander.id, amount: damage, total })
      if (action.alsoLife) {
        const from = p.life
        p.life -= damage
        tx.emit({ type: 'lifeChanged', player: target, from, to: p.life })
      }
      return
    }

    case 'putAbilityOnStack': {
      const description = text(action.description, MAX_TEXT)
      if (action.sourceId !== undefined && !own(s.objects, action.sourceId)) fail('unknownObject', 'Origem desconhecida.')
      const item = {
        id: tx.newId('a'), kind: 'ability' as const, controller: actor, description,
        ...(action.sourceId !== undefined ? { sourceId: action.sourceId } : {}),
      }
      tx.stack().push(item)
      tx.emit({ type: 'stackItemAdded', item })
      return
    }

    default:
      fail('invalidAction', 'Ação desconhecida.')
  }
}

// Who may touch an object. Hidden zones (hand, library) always belong to the owner only;
// battlefield and stack objects belong to their controller when the ruleset restricts it.
function touchable(tx: Tx, actor: PlayerId, objectId: string, zones?: ZoneKind[]): GameObject {
  const obj = own(tx.s.objects, objectId)
  if (!obj) fail('unknownObject', 'Carta desconhecida.')
  if (zones && !zones.includes(obj.zone)) fail('invalidZone', 'Essa ação não vale nessa zona.')
  const hidden = obj.zone === 'hand' || obj.zone === 'library'
  if (hidden && obj.owner !== actor) fail('notAllowed', 'Essa carta está numa zona oculta de outro jogador.')
  const controlled = obj.zone === 'battlefield' || obj.zone === 'stack'
  if (controlled && tx.s.ruleset.restrictToController && obj.controller !== actor) {
    fail('notAllowed', 'Você não controla essa carta.')
  }
  return obj
}

function livingPlayer(tx: Tx, id: PlayerId): PlayerId {
  const p = own(tx.s.players, id)
  if (!p) fail('unknownPlayer', 'Jogador desconhecido.')
  if (p.lost) fail('playerLost', 'Esse jogador já saiu da partida.')
  return id
}

function count(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > MAX_BATCH) fail('invalidAmount', `Use um número entre 1 e ${MAX_BATCH}.`)
  return n
}

function text(value: string, max: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || trimmed.length > max) fail('invalidAmount', `Use um texto de 1 a ${max} caracteres.`)
  return trimmed
}

function amount(n: number): number {
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > MAX_DELTA) {
    fail('invalidAmount', `Use um número inteiro diferente de zero, até ${MAX_DELTA}.`)
  }
  return n
}

function coord(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_COORD
}

function optionalBoolean(value: unknown) {
  if (value !== undefined && typeof value !== 'boolean') fail('invalidAction', 'Ação malformada.')
}

// A token's card comes from the client: keep only known string fields, each bounded.
function tokenCard(card: CardRef): CardRef {
  if (typeof card !== 'object' || card === null) fail('invalidAction', 'Ação malformada.')
  const out: CardRef = { name: text(card.name, MAX_TEXT) }
  for (const key of ['scryfallId', 'oracleId', 'typeLine', 'imageKey'] as const) {
    const value = card[key]
    if (value !== undefined) out[key] = text(value, MAX_TEXT)
  }
  return out
}

// Own-property lookup: ids and names from actions must never resolve to inherited members
// such as "constructor" or "__proto__".
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return typeof key === 'string' && Object.hasOwn(record, key) ? record[key] : undefined
}

function checkShape(action: Action) {
  if (typeof action !== 'object' || action === null || !ACTION_TYPES.has(action.type)) {
    fail('invalidAction', 'Ação desconhecida.')
  }
  if (typeof action.player !== 'string') fail('invalidAction', 'Ação malformada.')
  for (const key of ['objectId', 'target', 'commanderId', 'sourceId'] as const) {
    const value = (action as Partial<Record<typeof key, unknown>>)[key]
    if (value !== undefined && typeof value !== 'string') fail('invalidAction', 'Ação malformada.')
  }
}
