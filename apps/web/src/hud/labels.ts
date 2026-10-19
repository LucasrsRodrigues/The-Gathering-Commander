// Text alternatives for what the 3D table shows visually.

import type { ActionIntent, CardRef, ObjectView, PlayerView } from '@gathering-hall/engine'
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

const INTO_ZONE: Record<string, string> = {
  hand: 'na mão', battlefield: 'no campo de batalha', graveyard: 'no cemitério', exile: 'no exílio',
  library: 'no grimório', stack: 'na pilha', command: 'na zona de comando',
}

// What the action does, in words, for the dialog and the approval prompt.
export function describeIntent(action: ActionIntent, card: CardRef | null | undefined): string {
  const name = card?.name ?? 'uma carta'
  switch (action.type) {
    case 'playLand': return `jogar o terreno ${name}`
    case 'castSpell': return `lançar ${name}${action.x !== undefined ? ` com X = ${action.x}` : ''}`
    case 'moveObject': return `pôr ${name} ${INTO_ZONE[action.to] ?? 'em outra zona'}`
    default: return 'fazer essa ação'
  }
}
