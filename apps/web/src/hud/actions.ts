// Menu actions per zone, expressed as engine actions. Shared by the card menu, the hand and the zone viewer.

import type { ActionIntent as Intent, ObjectView, ZoneKind } from '@gathering-hall/engine'

export interface MenuItem {
  label: string
  action: Intent
}

export interface MenuGroup {
  title?: string
  items: MenuItem[]
}

const move = (objectId: string, to: ZoneKind, extra: { position?: 'top' | 'bottom'; faceDown?: boolean } = {}): Intent =>
  ({ type: 'moveObject', objectId, to, ...extra })

export function isLandCard(obj: ObjectView): boolean {
  if (obj.card?.rules) return obj.card.rules.types.includes('land')
  const front = (obj.card?.typeLine ?? '').split('//')[0]!.split(/\s+[—-]\s+/)[0]!
  return /\bland\b/i.test(front)
}

// Lands are played, everything else is cast (CR 305.1, 601.2): the engine checks when that is allowed.
export function playFromHand(obj: ObjectView): Intent {
  return isLandCard(obj) ? { type: 'playLand', objectId: obj.id } : { type: 'castSpell', objectId: obj.id }
}

// Spells with {X} in their cost ask for X first (see HandArea / CardMenu).
export const needsX = (obj: ObjectView) => (obj.card?.rules?.cost?.x ?? 0) > 0

function moveGroup(obj: ObjectView): MenuGroup {
  const items: MenuItem[] = []
  const add = (label: string, action: Intent, when = true) => when && items.push({ label, action })
  add('Mão', move(obj.id, 'hand'), obj.zone !== 'hand')
  add('Campo de batalha', move(obj.id, 'battlefield'), obj.zone !== 'battlefield')
  add('Cemitério', move(obj.id, 'graveyard'), obj.zone !== 'graveyard')
  add('Exílio', move(obj.id, 'exile'), obj.zone !== 'exile')
  add('Topo do grimório', move(obj.id, 'library', { position: 'top' }))
  add('Fundo do grimório', move(obj.id, 'library', { position: 'bottom' }))
  add('Zona de comando', move(obj.id, 'command'), obj.isCommander && obj.zone !== 'command')
  return { title: 'Mover para', items }
}

export function menuFor(obj: ObjectView): MenuGroup[] {
  const groups: MenuGroup[] = []
  switch (obj.zone) {
    case 'battlefield':
      groups.push({
        items: [
          { label: obj.tapped ? 'Desvirar' : 'Virar', action: { type: obj.tapped ? 'untap' : 'tap', objectId: obj.id } },
          { label: obj.faceDown ? 'Desvirar face para cima' : 'Virar face para baixo', action: { type: 'setFaceDown', objectId: obj.id, faceDown: !obj.faceDown } },
          ...(obj.arrangement ? [{ label: 'Voltar à fileira', action: { type: 'setArrangement', objectId: obj.id, arrangement: null } } satisfies MenuItem] : []),
        ],
      })
      groups.push({
        title: 'Contadores',
        items: [
          { label: '+1/+1', action: { type: 'addCounter', objectId: obj.id, counter: '+1/+1', delta: 1 } },
          { label: '−1/−1', action: { type: 'addCounter', objectId: obj.id, counter: '-1/-1', delta: 1 } },
          { label: 'Lealdade +1', action: { type: 'addCounter', objectId: obj.id, counter: 'lealdade', delta: 1 } },
          ...Object.keys(obj.counters).map((c): MenuItem => ({ label: `Remover ${c}`, action: { type: 'addCounter', objectId: obj.id, counter: c, delta: -1 } })),
        ],
      })
      break
    case 'hand':
      groups.push({
        items: [
          { label: isLandCard(obj) ? 'Jogar terreno' : 'Lançar', action: playFromHand(obj) },
          { label: 'Pôr no campo virada para baixo', action: move(obj.id, 'battlefield', { faceDown: true }) },
        ],
      })
      break
    case 'command':
      groups.push({
        items: [
          { label: `Lançar${obj.commanderTax ? ` (taxa +${obj.commanderTax})` : ''}`, action: { type: 'castSpell', objectId: obj.id } },
          { label: 'Pôr no campo', action: move(obj.id, 'battlefield') },
        ],
      })
      break
    case 'stack':
      groups.push({ items: [{ label: 'Anular (cemitério)', action: move(obj.id, 'graveyard') }] })
      break
    default:
      break
  }
  groups.push(moveGroup(obj))
  return groups
}

export function libraryMenu(): MenuGroup[] {
  return [{
    items: [
      { label: 'Comprar 1', action: { type: 'draw', count: 1 } },
      { label: 'Embaralhar', action: { type: 'shuffleLibrary' } },
      { label: 'Moer 1', action: { type: 'mill', count: 1 } },
    ],
  }]
}
