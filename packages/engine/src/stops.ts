// Automatic passing, Arena-style (épico 09, req. 28–31). After every action the engine passes priority for players
// who did not ask to stop where the game is, so a turn with nothing to do goes by in a click or two. Deterministic:
// it depends only on the state, so replays and online games agree.
//
// Only with turn rules on: the sandbox ('off') keeps handing priority step by step, as before.

import { passPriority } from './turn'
import type { Tx } from './tx'
import { STEPS, type GameState, type PlayerId } from './types'

// Enough for every player to pass through every step of a few turns; a safety net, never reached in practice.
const MAX_AUTO_PASSES = 4 * STEPS.length * 4

export function shouldAutoPass(state: GameState, player: PlayerId): boolean {
  if (state.status !== 'playing' || state.pending || state.priority?.player !== player) return false
  const p = state.players[player]!
  const top = state.stack[state.stack.length - 1]
  if (top) {
    // Something on the stack: always a chance to respond to others; your own spell passes if you asked for that.
    return top.controller === player && p.stops.passAfterOwnSpell
  }
  if (p.passUntil) return true
  const own = state.turn.active === player
  return !(own ? p.stops.own : p.stops.others).includes(state.turn.step)
}

export function autoPass(tx: Tx) {
  if (tx.s.ruleset.timingRules === 'off') return
  for (let i = 0; i < MAX_AUTO_PASSES; i++) {
    const s = tx.s
    const player = s.priority?.player
    if (!player) return
    // "Pass until…" ends when another player puts something on the stack.
    const top = s.stack[s.stack.length - 1]
    if (s.players[player]!.passUntil && top && top.controller !== player) tx.player(player).passUntil = null
    if (!shouldAutoPass(s, player)) return
    passPriority(tx, player, true)
  }
}

// Turn start: "until end of turn" ends for everyone, "until my turn" for the player whose turn it is.
export function clearPassUntil(tx: Tx, active: PlayerId) {
  for (const id of tx.s.seats) {
    const until = tx.s.players[id]!.passUntil
    if (until === 'endOfTurn' || (until === 'myTurn' && id === active)) tx.player(id).passUntil = null
  }
}
