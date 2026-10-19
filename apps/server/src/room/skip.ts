// The default answer the host sends for a player who left (protocol skip.ts): the same actions the player could
// have sent, so the engine checks them as usual and replays need nothing new.

import type { Action, GameState, PlayerId } from '@gathering-hall/engine'
import type { SkipDecision } from '@gathering-hall/protocol'

export function defaultAnswer(game: GameState, player: PlayerId, decision: SkipDecision): Action | null {
  const pending = game.pending
  const lastInHand = (count: number) => game.zones[player]!.hand.slice(-count) // the most recently drawn
  switch (decision) {
    case 'priority': return { type: 'passPriority', player }
    case 'exception': return { type: 'answerException', player, approve: false }
    case 'mulligan': return { type: 'keepHand', player }
    case 'declareAttackers': return { type: 'declareAttackers', player, attacks: [] }
    case 'declareBlockers': return { type: 'declareBlockers', player, blocks: [] }
    case 'bottomCards':
      return pending?.kind === 'bottomCards' ? { type: 'bottomCards', player, objectIds: lastInHand(pending.count) } : null
    case 'discard':
      return pending?.kind === 'discard' ? { type: 'discard', player, objectIds: lastInHand(pending.count) } : null
    case 'confirmDamage':
      return pending?.kind === 'confirmDamage' ? { type: 'assignDamage', player, assignments: pending.proposal.assignments } : null
    default:
      return null
  }
}
