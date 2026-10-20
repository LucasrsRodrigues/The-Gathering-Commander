// Continuous effects of resolved spells and abilities (épico 12, CR 611.2): kept in the state until their duration
// ends. The layer system (layers.ts) reads them; nothing else does.

import type { Tx } from './tx'
import type { Affected, Change, ContinuousEffect, Duration, ObjectId, PlayerId } from './types'

// A new effect, timestamped now (CR 613.7a). "Until end of turn" ends in the cleanup step.
export function addEffect(tx: Tx, e: { source: ObjectId | null; controller: PlayerId; affects: Affected; change: Change; until: Duration }): ContinuousEffect {
  const effect: ContinuousEffect = { id: tx.newId('c'), timestamp: tx.tick(), ...e }
  tx.s.effects = [...(tx.s.effects ?? []), effect]
  return effect
}

// CR 514.2: "until end of turn" effects end; effects whose source left the battlefield are gone too.
export function endEffects(tx: Tx) {
  const s = tx.s
  if (!s.effects?.length) return
  const kept = s.effects.filter((e) => e.until.kind !== 'endOfTurn' && (!e.source || s.objects[e.source]?.zone === 'battlefield'))
  if (kept.length) s.effects = kept
  else delete s.effects
}
