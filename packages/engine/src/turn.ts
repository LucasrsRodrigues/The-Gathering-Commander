// Turn structure (CR 500), priority (CR 117) and stack resolution (CR 608).

import type { Tx } from './tx'
import { STEPS, type GameState, type PlayerId, type Step } from './types'
import { emptyPools } from './mana'
import { drawCards, isPermanentCard, moveObject } from './zones'

// Players still in the game, in turn order starting from `from` (APNAP when `from` is the active player).
export function playersInOrder(state: GameState, from: PlayerId): PlayerId[] {
  const start = Math.max(0, state.seats.indexOf(from))
  const ordered = [...state.seats.slice(start), ...state.seats.slice(0, start)]
  return ordered.filter((id) => !state.players[id]?.lost)
}

export function nextPlayerAfter(state: GameState, current: PlayerId): PlayerId | undefined {
  const i = state.seats.indexOf(current)
  for (let k = 1; k <= state.seats.length; k++) {
    const id = state.seats[(i + k) % state.seats.length]!
    if (!state.players[id]?.lost) return id
  }
  return undefined
}

export function givePriority(tx: Tx, player: PlayerId) {
  tx.s.priority = { player, passed: [] }
}

export function beginTurn(tx: Tx, player: PlayerId, number: number) {
  tx.s.turn = { number, active: player, step: 'untap', combat: null }
  const p = tx.player(player)
  p.landsPlayed = 0
  p.lastTurnStarted = number
  tx.emit({ type: 'turnStarted', player, turn: number })
  enterStep(tx, 'untap')
}

// Enters `step`, performs its turn-based actions and skips steps where nobody gets priority.
function enterStep(tx: Tx, step: Step) {
  const s = tx.s
  emptyPools(tx) // CR 500.4
  s.turn = { ...s.turn, step }
  tx.emit({ type: 'stepChanged', step, turn: s.turn.number })
  const active = s.turn.active

  if (step === 'untap') {
    // CR 502.3 untap; CR 502.4 no player receives priority.
    if (s.ruleset.autoUntap) {
      for (const id of s.battlefield) {
        const obj = s.objects[id]
        if (obj && obj.controller === active && obj.tapped) {
          tx.object(id).tapped = false
          tx.emit({ type: 'untapped', objectId: id })
        }
      }
    }
    enterStep(tx, 'upkeep')
    return
  }

  if (step === 'draw' && s.ruleset.autoDraw && !skipsFirstDraw(s)) drawCards(tx, active, 1)

  if (step === 'cleanup') {
    // CR 514.3: normally no priority in cleanup. Discarding to hand size stays manual in the sandbox.
    const next = nextPlayerAfter(s, active)
    if (next) beginTurn(tx, next, s.turn.number + 1)
    return
  }

  givePriority(tx, active)
}

// CR 103.8a: in a two-player game the starting player skips the draw of their first turn.
function skipsFirstDraw(s: GameState): boolean {
  return s.seats.length === 2 && s.turn.number === 1 && s.turn.active === s.startingPlayer
}

export function advanceStep(tx: Tx) {
  const index = STEPS.indexOf(tx.s.turn.step)
  const next = STEPS[index + 1] ?? 'cleanup'
  enterStep(tx, next)
}

// CR 608.2 / 608.3 (manual): permanents go to the battlefield, other cards to the owner's graveyard,
// abilities simply leave the stack.
export function resolveTop(tx: Tx) {
  const item = tx.s.stack[tx.s.stack.length - 1]
  if (!item) return
  if (item.kind === 'card' && item.objectId) {
    const obj = tx.s.objects[item.objectId]!
    if (isPermanentCard(obj)) moveObject(tx, obj.id, 'battlefield', { controller: item.controller })
    else moveObject(tx, obj.id, 'graveyard')
  } else {
    tx.stack().pop()
  }
  tx.emit({ type: 'stackItemResolved', item })
  givePriority(tx, tx.s.turn.active)
}

// CR 117.4: when all players pass in succession, resolve the top of the stack or end the step.
export function passPriority(tx: Tx, player: PlayerId) {
  const priority = tx.s.priority!
  const passed = [...priority.passed, player]
  tx.emit({ type: 'priorityPassed', player })
  const remaining = playersInOrder(tx.s, tx.s.turn.active).filter((id) => !passed.includes(id))
  if (remaining.length === 0) {
    if (tx.s.stack.length) resolveTop(tx)
    else advanceStep(tx)
    return
  }
  const next = playersInOrder(tx.s, player).find((id) => !passed.includes(id))!
  tx.s.priority = { player: next, passed }
}
