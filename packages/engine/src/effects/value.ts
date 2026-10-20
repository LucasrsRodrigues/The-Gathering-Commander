// Values and filters of the effect model (épico 11): "equal to ~'s power", "for each Elf you control"… Pure reads of
// the state. Counters use the names the table already uses (+1/+1, lealdade…), case-insensitive.

import { typesOf } from '../cards'
import { powerOf, toughnessOf } from '../stats'
import type { Filter, GameObject, GameState, ObjectId, PlayerId, Target, Value } from '../types'

export interface ValueContext {
  controller: PlayerId
  sourceId?: ObjectId
  targets?: readonly Target[]
  x?: number
}

const lower = (list: readonly string[]) => list.map((s) => s.toLowerCase())

export function matchesFilter(_state: GameState, obj: GameObject, filter: Filter, ctx: Pick<ValueContext, 'controller' | 'sourceId'>): boolean {
  const rules = obj.card.rules
  const types = typesOf(obj.card)
  if (filter.types?.length && !filter.types.some((t) => types.includes(t))) return false
  if (filter.notTypes?.some((t) => types.includes(t))) return false
  if (filter.subtypes?.length) {
    const subs = lower(rules?.subtypes ?? [])
    if (!lower(filter.subtypes).some((s) => subs.includes(s))) return false
  }
  if (filter.supertypes?.length && !filter.supertypes.some((t) => rules?.supertypes.includes(t))) return false
  if (filter.controller === 'you' && obj.controller !== ctx.controller) return false
  if (filter.controller === 'opponent' && obj.controller === ctx.controller) return false
  if (filter.colors?.length && !filter.colors.some((c) => rules?.colorIdentity.includes(c))) return false
  if (filter.tapped !== undefined && obj.tapped !== filter.tapped) return false
  if (filter.other && obj.id === ctx.sourceId) return false
  if (filter.token !== undefined && obj.isToken !== filter.token) return false
  return true
}

function firstObjectTarget(state: GameState, targets: readonly Target[] | undefined): GameObject | undefined {
  for (const t of targets ?? []) if ('object' in t && state.objects[t.object]) return state.objects[t.object]
  return undefined
}

export function evalValue(state: GameState, ctx: ValueContext, value: Value): number {
  switch (value.kind) {
    case 'fixed': return value.n
    case 'x': return ctx.x ?? 0
    case 'power':
    case 'toughness': {
      const obj = value.of === 'self' ? (ctx.sourceId ? state.objects[ctx.sourceId] : undefined) : firstObjectTarget(state, ctx.targets)
      if (!obj) return 0
      return Math.max(0, value.kind === 'power' ? powerOf(obj) : toughnessOf(obj))
    }
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
