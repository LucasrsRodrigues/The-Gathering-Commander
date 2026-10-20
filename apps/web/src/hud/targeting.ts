// Choosing targets on the table (épico 11, T11.9), Arena-style. Two ways in:
// - casting a spell with targets: the table asks first and sends the targets inside `castSpell` (cancel = send nothing);
// - a trigger waiting on `chooseTargets` (engine decision): the same band answers it.
// Legal targets come from the engine's own `legalTargetsInView`, so the highlights match what the engine accepts.

import { legalTargetsInView, type ActionIntent, type PlayerId, type PlayerView, type Target, type TargetSpec } from '@gathering-hall/engine'
import { createStore } from '../ui/store'

type Cast = Extract<ActionIntent, { type: 'castSpell' }>

export interface Targeting {
  id: string // which choice this is: a new one starts with nothing chosen
  kind: 'cast' | 'trigger'
  sourceId: string
  specs: TargetSpec[]
  title: string // the card's name
  text: string // the sentence that asks for targets
  chosen: Target[]
  action?: Cast // kind 'cast': sent with the targets on confirm
}

export const targetingStore = createStore<Targeting | null>(null)

export const targetKey = (t: Target) => ('player' in t ? `p:${t.player}` : `o:${t.object}`)

export function limits(specs: readonly TargetSpec[]): { min: number; max: number } {
  return {
    min: specs.reduce((n, s) => n + (s.kind === 'object' ? (s.upTo ? 0 : s.count) : 1), 0),
    max: specs.reduce((n, s) => n + (s.kind === 'object' ? s.count : 1), 0),
  }
}

// Every target some spec accepts, without repeats, in the engine's order.
export function legalOptions(view: PlayerView, seat: PlayerId, t: Pick<Targeting, 'specs' | 'sourceId'>): Target[] {
  const seen = new Set<string>()
  return t.specs.flatMap((spec) => legalTargetsInView(view, spec, { controller: seat, sourceId: t.sourceId }))
    .filter((target) => !seen.has(targetKey(target)) && !!seen.add(targetKey(target)))
}

// A cast whose spell asks for targets starts the target mode instead of going to the engine.
export function castTargeting(view: PlayerView, action: ActionIntent): Targeting | null {
  if (action.type !== 'castSpell' || action.targets || action.payWith) return null
  const obj = view.objects[action.objectId]
  const spell = obj?.card?.rules?.spell
  if (!obj?.card || !spell?.targets?.length) return null
  return { id: `cast:${obj.id}`, kind: 'cast', sourceId: obj.id, specs: spell.targets, title: obj.card.name, text: spell.text, chosen: [], action }
}

// The trigger decision waiting on this seat, as a target mode.
export function triggerTargeting(view: PlayerView, seat: PlayerId): Targeting | null {
  const p = view.pending
  if (p?.kind !== 'chooseTargets' || p.player !== seat) return null
  const id = `trigger:${p.trigger.sourceId}:${p.trigger.index}:${p.rest.length}`
  return { id, kind: 'trigger', sourceId: p.trigger.sourceId, specs: p.specs, title: view.objects[p.trigger.sourceId]?.card?.name ?? 'Habilidade', text: p.text, chosen: [] }
}

// Clicking a target (on the table, a player panel or the band): toggles it, never past the maximum. With a single
// target, a new click replaces the old one.
export function toggleTarget(target: Target) {
  const t = targetingStore.get()
  if (!t) return
  const key = targetKey(target)
  const { max } = limits(t.specs)
  const has = t.chosen.some((c) => targetKey(c) === key)
  const chosen = has ? t.chosen.filter((c) => targetKey(c) !== key) : max === 1 ? [target] : t.chosen.length < max ? [...t.chosen, target] : t.chosen
  targetingStore.set({ ...t, chosen })
}

// What confirming sends: the cast with its targets, or the answer to the trigger.
export function confirmAction(t: Targeting): ActionIntent {
  return t.kind === 'cast' && t.action ? { ...t.action, targets: t.chosen } : { type: 'chooseTargets', targets: t.chosen }
}

// "À mão": the spell is cast without targets (resolved by hand, as before épico 11), or the trigger goes on the
// stack to be done by hand.
export function manualAction(t: Targeting): ActionIntent {
  return t.kind === 'cast' && t.action ? t.action : { type: 'chooseTargets', targets: [], manual: true }
}
