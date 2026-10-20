// "When this enters" (épico 11, CR 603.2, 603.3): an object entering the battlefield with `etb` abilities queues one
// trigger per ability. The next time a player would receive priority, the queue goes on the stack:
// - CR 603.3b: the active player's triggers first (so they resolve last), then the others in turn order;
// - each player's in text order of resolution (wave 1; choosing the order freely is wave 3);
// - CR 603.3d: a trigger with targets asks its controller first (ChooseTargets), and one without any legal target is
//   removed without effect.

import { legalTargets } from './effects/targets'
import type { Tx } from './tx'
import type { ObjectId, PendingTrigger, PlayerId, StackItem, TargetSpec } from './types'

export function queueEnterTriggers(tx: Tx, id: ObjectId) {
  const obj = tx.s.objects[id]
  const etb = obj?.card.rules?.etb
  if (!obj || !etb?.length) return
  tx.s.triggers = [...(tx.s.triggers ?? []), ...etb.map((_, index) => ({ sourceId: id, controller: obj.controller, index }))]
}

// Puts the queued triggers on the stack. `priorityTo` is who receives priority afterwards (kept while a choice is pending).
export function putTriggersOnStack(tx: Tx, priorityTo: PlayerId) {
  const s = tx.s
  if (!s.triggers?.length || s.pending || s.status !== 'playing') return
  const seats = s.seats.indexOf(s.turn.active)
  const order = [...s.seats.slice(seats), ...s.seats.slice(0, seats)]
  // Last on the stack resolves first: each player's are stacked in reverse text order.
  const sequence = order.flatMap((p) => s.triggers!.filter((t) => t.controller === p).reverse())
  delete s.triggers
  stackTriggers(tx, priorityTo, sequence)
}

export function stackTriggers(tx: Tx, priorityTo: PlayerId, sequence: readonly PendingTrigger[]) {
  for (let i = 0; i < sequence.length; i++) {
    const trigger = sequence[i]!
    const source = tx.s.objects[trigger.sourceId]
    const ability = source?.card.rules?.etb?.[trigger.index]
    if (!ability || tx.s.players[trigger.controller]?.lost) continue // a token that already left, or a player who left
    const specs = ability.targets ?? []
    if (specs.length) {
      const ctx = { controller: trigger.controller, sourceId: trigger.sourceId }
      if (!specs.every((spec) => legalTargets(tx.s, spec, ctx).length >= minTargets(spec))) {
        tx.emit({ type: 'triggerSkipped', sourceId: trigger.sourceId, text: ability.text })
        continue
      }
      tx.s.pending = { kind: 'chooseTargets', player: trigger.controller, trigger, specs, text: ability.text, priorityTo, rest: sequence.slice(i + 1) }
      return
    }
    pushTrigger(tx, trigger, ability.text)
  }
}

export function pushTrigger(tx: Tx, trigger: PendingTrigger, text: string, extra: Pick<StackItem, 'targets' | 'manual'> = {}) {
  const item: StackItem = {
    id: tx.newId('a'), kind: 'ability', controller: trigger.controller, sourceId: trigger.sourceId, description: text,
    ability: { from: 'etb', index: trigger.index }, ...extra,
  }
  tx.stack().push(item)
  tx.emit({ type: 'stackItemAdded', item })
}

// A player leaving the game: their triggers go with them (CR 800.4a), and a choice they owed is dropped.
export function leaveTriggers(tx: Tx, player: PlayerId) {
  const s = tx.s
  if (s.triggers?.some((t) => t.controller === player)) s.triggers = s.triggers.filter((t) => t.controller !== player)
  if (s.pending?.kind === 'chooseTargets' && s.pending.player === player) {
    const { priorityTo, rest } = s.pending
    s.pending = null
    stackTriggers(tx, priorityTo, rest)
  }
}

const minTargets = (spec: TargetSpec) => (spec.kind === 'object' ? (spec.upTo ? 0 : spec.count) : 1)
