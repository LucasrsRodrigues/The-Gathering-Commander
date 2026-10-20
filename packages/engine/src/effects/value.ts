// Values and filters of the effect model (épico 11): "equal to ~'s power", "for each Elf you control"… Pure reads of
// the state. Counters use the names the table already uses (+1/+1, lealdade…), case-insensitive.

import { charsOf, printed } from '../layers'
import { powerOf, toughnessOf } from '../stats'
import type { CardRef, Filter, GameObject, GameState, ObjectId, PlayerId, Target, Value } from '../types'
import type { PlayerView } from '../view'

export interface ValueContext {
  controller: PlayerId
  sourceId?: ObjectId
  targets?: readonly Target[]
  x?: number
  affectedId?: ObjectId // épico 12: the object a continuous effect is changing right now (layers.ts)
}

// CR 202.3: the total of the mana cost, X as 0.
export function manaValueOf(card: CardRef | null | undefined): number {
  const c = card?.rules?.cost
  if (!c) return 0
  return c.generic + Object.values(c.colored).reduce((n, v) => n + (v ?? 0), 0) + c.hybrid.length + c.twoBrid.length * 2 + c.phyrexian.length
}

const lower = (list: readonly string[]) => list.map((s) => s.toLowerCase())

// What a filter looks at: the full object (engine) or what a player sees of it (view, online table).
export interface FilterSubject {
  id: ObjectId
  card: CardRef | null // null: face down or hidden, never matches
  controller: PlayerId
  tapped: boolean
  isToken: boolean
}

// Épico 12: the object's characteristics now (layers.ts); a view's object (online table) is judged by its card.
export function matchesFilter(state: GameState | null, obj: FilterSubject, filter: Filter, ctx: Pick<ValueContext, 'controller' | 'sourceId'>): boolean {
  if (!obj.card) return false
  const live = state && Object.hasOwn(state.objects, obj.id) ? state.objects[obj.id] : undefined
  const c = state && live && live.card === obj.card ? charsOf(state, live) : printed(obj.card, obj.controller)
  if (filter.types?.length && !filter.types.some((t) => c.types.includes(t))) return false
  if (filter.notTypes?.some((t) => c.types.includes(t))) return false
  if (filter.subtypes?.length) {
    const subs = lower(c.subtypes)
    if (!lower(filter.subtypes).some((s) => subs.includes(s))) return false
  }
  if (filter.supertypes?.length && !filter.supertypes.some((t) => c.supertypes.includes(t))) return false
  if (filter.notSupertypes?.some((t) => c.supertypes.includes(t))) return false
  if (filter.controller === 'you' && c.controller !== ctx.controller) return false
  if (filter.controller === 'opponent' && c.controller === ctx.controller) return false
  if (filter.colors?.length && !filter.colors.some((col) => c.colors.includes(col))) return false
  if (filter.tapped !== undefined && obj.tapped !== filter.tapped) return false
  if (filter.other && obj.id === ctx.sourceId) return false
  if (filter.token !== undefined && obj.isToken !== filter.token) return false
  return true
}

function firstObjectTarget(state: GameState, targets: readonly Target[] | undefined): GameObject | undefined {
  for (const t of targets ?? []) if ('object' in t && state.objects[t.object]) return state.objects[t.object]
  return undefined
}

// The same values from a player's view (the payment plan on the online table). Counts only see visible objects,
// which is all a battlefield count needs.
export function evalValueInView(view: PlayerView, ctx: ValueContext, value: Value): number {
  const self = ctx.sourceId ? view.objects[ctx.sourceId] : undefined
  switch (value.kind) {
    case 'fixed': return value.n
    case 'x': return ctx.x ?? 0
    case 'power': return Math.max(0, value.of === 'self' ? (self?.power ?? 0) : 0)
    case 'toughness': return Math.max(0, value.of === 'self' ? (self?.toughness ?? 0) : 0)
    case 'counters': {
      const key = self && Object.keys(self.counters).find((k) => k.toLowerCase() === value.counter.toLowerCase())
      return key ? Math.max(0, self.counters[key] ?? 0) : 0
    }
    case 'manaValue': return manaValueOf(view.objects[value.of === 'affected' ? (ctx.affectedId ?? '') : (ctx.sourceId ?? '')]?.card)
    case 'count': {
      if (value.zone !== 'battlefield') return 0
      return view.battlefield.filter((id) => {
        const o = view.objects[id]
        return !!o && matchesFilter(null, o, value.what, ctx)
      }).length
    }
  }
}

export function evalValue(state: GameState, ctx: ValueContext, value: Value): number {
  switch (value.kind) {
    case 'fixed': return value.n
    case 'x': return ctx.x ?? 0
    case 'power':
    case 'toughness': {
      const obj = value.of === 'self' ? (ctx.sourceId ? state.objects[ctx.sourceId] : undefined) : firstObjectTarget(state, ctx.targets)
      if (!obj) return 0
      return Math.max(0, value.kind === 'power' ? powerOf(state, obj) : toughnessOf(state, obj))
    }
    case 'manaValue': return manaValueOf(state.objects[value.of === 'affected' ? (ctx.affectedId ?? '') : (ctx.sourceId ?? '')]?.card)
    case 'counters': {
      const obj = ctx.sourceId ? state.objects[ctx.sourceId] : undefined
      if (!obj) return 0
      const key = Object.keys(obj.counters).find((k) => k.toLowerCase() === value.counter.toLowerCase())
      return key ? Math.max(0, obj.counters[key] ?? 0) : 0
    }
    case 'count': {
      const pool = value.zone === 'battlefield'
        ? state.battlefield
        : state.zones[ctx.controller]?.[value.zone] ?? []
      return pool.filter((id) => {
        const obj = state.objects[id]
        return !!obj && matchesFilter(state, obj, value.what, ctx)
      }).length
    }
  }
}
