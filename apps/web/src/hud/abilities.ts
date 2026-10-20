// Activated abilities on the table (épico 11, onda 2): the card menu lists them with their cost, and activating one
// asks, in order, for the targets (target band), the cards a cost needs (CostChoiceDialog) and the mana (payment
// dialog) — then sends one `activateAbility` with everything, so cancelling at any point sends nothing.

import { matchesFilter, type ActionIntent, type ObjectView, type PlayerId, type PlayerView } from '@gathering-hall/engine'
import type { MenuItem } from './actions'

export type Activate = Extract<ActionIntent, { type: 'activateAbility' }>

export function abilityItems(viewer: PlayerId | null, obj: ObjectView): MenuItem[] {
  if (!viewer || obj.zone !== 'battlefield' || obj.controller !== viewer || obj.faceDown) return []
  return (obj.card?.rules?.activated ?? []).map((ability, index) => ({
    label: `Ativar: ${ability.text.replace(/\bthis card\b/g, obj.card?.name ?? 'esta carta')}`,
    action: { type: 'activateAbility', objectId: obj.id, index },
  }))
}

export interface CostChoice {
  action: Activate
  kind: 'sacrifice' | 'discard'
  count: number
  options: ObjectView[]
}

// The next cost that needs cards chosen and has none yet; null when nothing is left to choose.
export function costChoiceFor(view: PlayerView, seat: PlayerId, action: ActionIntent): CostChoice | null {
  if (action.type !== 'activateAbility') return null
  const obj = view.objects[action.objectId]
  const cost = obj?.card?.rules?.activated?.[action.index]?.cost
  if (!obj || !cost) return null
  if (cost.sacrifice && cost.sacrifice !== 'self' && !action.sacrifice) {
    const filter = cost.sacrifice
    const options = view.battlefield.flatMap((id) => {
      const o = view.objects[id]
      return o?.card && o.controller === seat && matchesFilter(null, o, filter, { controller: seat, sourceId: obj.id }) ? [o] : []
    })
    return { action, kind: 'sacrifice', count: 1, options }
  }
  if (cost.discard && !action.discard) {
    const options = (view.players[seat]?.hand ?? []).flatMap((id) => (view.objects[id] ? [view.objects[id]!] : []))
    return { action, kind: 'discard', count: cost.discard, options }
  }
  return null
}
