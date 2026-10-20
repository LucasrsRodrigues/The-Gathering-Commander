// Targets (épico 11, CR 115, 601.2c, 608.2b): which objects and players a spell or ability may target, whether a
// chosen list fits its specs, and which targets are still legal on resolution. Pure reads of the state; the view
// variant lets the table highlight legal targets online.

import { charsOf, printed, type Characteristics } from '../layers'
import type { GameState, ObjectId, PlayerId, Target, TargetSpec } from '../types'
import type { PlayerView } from '../view'
import { matchesFilter, type FilterSubject } from './value'

export interface TargetContext {
  controller: PlayerId
  sourceId?: ObjectId // the spell or the permanent the ability comes from
}

interface Board {
  zone(id: ObjectId): string | undefined
  subject(id: ObjectId): FilterSubject | undefined
  chars(id: ObjectId): Characteristics | undefined
  state: GameState | null // the engine's state (characteristics with effects), or null for a player's view
  ids(zone: 'battlefield' | 'stack' | 'graveyard'): ObjectId[]
  players(): PlayerId[] // still in the game
}

function stateBoard(state: GameState): Board {
  return {
    zone: (id) => state.objects[id]?.zone,
    subject: (id) => state.objects[id],
    chars: (id) => (state.objects[id] ? charsOf(state, state.objects[id]!) : undefined),
    state,
    ids: (zone) => zone === 'battlefield' ? state.battlefield
      : zone === 'stack' ? state.stack.flatMap((i) => (i.objectId ? [i.objectId] : []))
        : state.seats.flatMap((p) => state.zones[p]?.graveyard ?? []),
    players: () => state.seats.filter((p) => !state.players[p]?.lost),
  }
}

function viewBoard(view: PlayerView): Board {
  return {
    zone: (id) => view.objects[id]?.zone,
    subject: (id) => view.objects[id],
    chars: (id) => (view.objects[id]?.card ? printed(view.objects[id]!.card!, view.objects[id]!.controller) : undefined),
    state: null,
    ids: (zone) => zone === 'battlefield' ? view.battlefield
      : zone === 'stack' ? view.stack.flatMap((i) => (i.objectId ? [i.objectId] : []))
        : Object.values(view.objects).filter((o) => o.zone === 'graveyard').map((o) => o.id),
    players: () => view.seats.filter((p) => !view.players[p]?.lost),
  }
}

function legalOn(board: Board, spec: TargetSpec, target: Target, ctx: TargetContext): boolean {
  if ('player' in target) {
    if (!board.players().includes(target.player)) return false
    if (spec.kind === 'any') return true
    if (spec.kind === 'player') return spec.who === 'any' || target.player !== ctx.controller
    return false
  }
  const obj = board.subject(target.object)
  if (!obj?.card) return false
  if (spec.kind === 'any') {
    if (board.zone(target.object) !== 'battlefield') return false
    const types = board.chars(target.object)?.types ?? []
    return types.includes('creature') || types.includes('planeswalker')
  }
  if (spec.kind !== 'object') return false
  if (board.zone(target.object) !== (spec.zone ?? 'battlefield')) return false
  return matchesFilter(board.state, obj, spec.filter, ctx)
}

function all(board: Board, spec: TargetSpec, ctx: TargetContext): Target[] {
  const players: Target[] = board.players().map((player) => ({ player }))
  const objects = (zone: 'battlefield' | 'stack' | 'graveyard'): Target[] => board.ids(zone).map((object) => ({ object }))
  const candidates = spec.kind === 'player' ? players : spec.kind === 'any' ? [...objects('battlefield'), ...players] : objects(spec.zone ?? 'battlefield')
  return candidates.filter((t) => legalOn(board, spec, t, ctx))
}

export const legalTargets = (state: GameState, spec: TargetSpec, ctx: TargetContext) => all(stateBoard(state), spec, ctx)
export const legalTargetsInView = (view: PlayerView, spec: TargetSpec, ctx: TargetContext) => all(viewBoard(view), spec, ctx)
export const isLegalTarget = (state: GameState, spec: TargetSpec, target: Target, ctx: TargetContext) => legalOn(stateBoard(state), spec, target, ctx)

const minOf = (spec: TargetSpec) => (spec.kind === 'object' ? (spec.upTo ? 0 : spec.count) : 1)
const maxOf = (spec: TargetSpec) => (spec.kind === 'object' ? spec.count : 1)
const key = (t: Target) => ('player' in t ? `p:${t.player}` : `o:${t.object}`)

// The chosen targets, in spec order (each spec takes its share), or the reason they do not fit. Targets are distinct.
export function checkTargets(state: GameState, specs: readonly TargetSpec[], targets: readonly Target[], ctx: TargetContext): string | null {
  if (!Array.isArray(targets) || targets.length > 20) return 'Alvos malformados.'
  for (const t of targets) {
    if (!t || typeof t !== 'object' || (typeof (t as { player?: unknown }).player !== 'string' && typeof (t as { object?: unknown }).object !== 'string')) return 'Alvo malformado.'
  }
  if (new Set(targets.map(key)).size !== targets.length) return 'O mesmo alvo foi escolhido duas vezes.'
  const min = specs.reduce((n, s) => n + minOf(s), 0)
  const max = specs.reduce((n, s) => n + maxOf(s), 0)
  if (targets.length < min || targets.length > max) return min === max ? `Escolha ${min} alvo(s).` : `Escolha de ${min} a ${max} alvos.`
  let i = 0
  for (const [spec, take] of assign(specs, targets.length)) {
    for (let k = 0; k < take; k++, i++) if (!isLegalTarget(state, spec, targets[i]!, ctx)) return 'Esse alvo não é válido para essa mágica.'
  }
  return null
}

// How many of n chosen targets each spec takes, in order: each spec as many as it can while the later ones still get
// their minimum. The same split is used when checking and on resolution.
function assign(specs: readonly TargetSpec[], n: number): [TargetSpec, number][] {
  let left = n
  return specs.map((spec, idx) => {
    const reserved = specs.slice(idx + 1).reduce((sum, s) => sum + minOf(s), 0)
    const take = Math.max(0, Math.min(maxOf(spec), left - reserved))
    left -= take
    return [spec, take]
  })
}

// On resolution (CR 608.2b): the targets that are still legal for their spec, in the same spec order.
export function stillLegal(state: GameState, specs: readonly TargetSpec[], targets: readonly Target[], ctx: TargetContext): Target[] {
  let i = 0
  const out: Target[] = []
  for (const [spec, take] of assign(specs, targets.length)) {
    for (let k = 0; k < take; k++, i++) if (isLegalTarget(state, spec, targets[i]!, ctx)) out.push(targets[i]!)
  }
  return out
}
