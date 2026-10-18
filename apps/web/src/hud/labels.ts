// Text alternatives for what the 3D table shows visually.

import type { ObjectView, PlayerView } from '@gathering-hall/engine'
import type { ViewableZone } from '../ui/stores'

// Battlefield: what the seat controls, in play order. Player zones: top card first.
export function zoneIds(view: PlayerView, seat: string, zone: ViewableZone): string[] {
  if (zone === 'battlefield') return view.battlefield.filter((id) => view.objects[id]?.controller === seat)
  const player = view.players[seat]
  return player ? [...player[zone]].reverse() : []
}

// Name plus the state a sighted player reads from the card itself.
export function cardLabel(obj: ObjectView | undefined): string {
  if (!obj) return 'Carta'
  const parts = [obj.card?.name ?? 'Carta virada para baixo']
  if (obj.tapped) parts.push('virada')
  for (const [name, n] of Object.entries(obj.counters)) parts.push(`${n} marcador(es) ${name}`)
  return parts.join(', ')
}
