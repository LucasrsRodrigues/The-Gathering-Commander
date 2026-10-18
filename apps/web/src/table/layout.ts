// Pure table layout: PlayerView + viewer → where every visible object sits, in table units.
// The viewer always sits at the front; opponents share the back half in turn order.

import type { ObjectView, PlayerId, PlayerView } from '@gathering-hall/engine'

export const TABLE = { W: 26, D: 16, CW: 1, CH: 1.4 } as const

export interface Area {
  seat: PlayerId
  local: boolean
  x: number
  z: number
  w: number
  d: number
  scale: number
}

export interface Placement {
  x: number
  z: number
  scale: number
  layer: number
  floating?: boolean // stack items hover above the table
}

export interface Piles {
  scale: number
  library: { x: number; z: number }
  graveyard: { x: number; z: number }
  exile: { x: number; z: number }
}

export interface TableLayout {
  areas: Area[]
  cards: Map<string, Placement>
  piles: Map<PlayerId, Piles>
}

type Row = 'creature' | 'other' | 'land'

export function rowOf(obj: ObjectView): Row {
  const type = obj.card?.typeLine?.toLowerCase() ?? ''
  if (type.includes('creature')) return 'creature'
  if (type.includes('land')) return 'land'
  return 'other'
}

export function seatOrder(view: PlayerView, viewer: PlayerId): PlayerId[] {
  const i = Math.max(0, view.seats.indexOf(viewer))
  return [...view.seats.slice(i), ...view.seats.slice(0, i)]
}

function placeRow(ids: string[], x0: number, x1: number, z: number, scale: number, out: Map<string, Placement>) {
  const n = ids.length
  if (!n) return
  const cw = TABLE.CW * scale * 1.08
  const step = n > 1 ? Math.min(cw, (x1 - x0 - cw) / (n - 1)) : 0
  const start = (x0 + x1) / 2 - (step * (n - 1)) / 2
  ids.forEach((id, i) => out.set(id, { x: start + i * step, z, scale, layer: i }))
}

export function layoutTable(view: PlayerView, viewer: PlayerId): TableLayout {
  const seats = seatOrder(view, viewer)
  const opponents = seats.slice(1)
  const areas: Area[] = []
  const cards = new Map<string, Placement>()
  const piles = new Map<PlayerId, Piles>()
  const half = TABLE.W / 2

  seats.forEach((seat, index) => {
    const local = index === 0
    let x0: number, x1: number, rows: Record<Row, number>, scale: number
    let commander: { x: number; z: number }

    if (local) {
      scale = 1
      areas.push({ seat, local, x: 0, z: 4.1, w: TABLE.W, d: 7.4, scale })
      x0 = -10.6
      x1 = 10.4
      rows = { creature: 2.0, other: 3.9, land: 5.8 }
      commander = { x: -11.9, z: 5.8 }
      piles.set(seat, { scale, library: { x: 12, z: 5.8 }, graveyard: { x: 12, z: 3.9 }, exile: { x: 12, z: 2.0 } })
    } else {
      const k = opponents.length
      const w = TABLE.W / k
      const cx = -half + w * (index - 0.5)
      scale = k === 1 ? 0.9 : 0.8
      areas.push({ seat, local, x: cx, z: -4.1, w, d: 7.4, scale })
      x0 = cx - w / 2 + 0.5
      x1 = cx + w / 2 - 0.5
      rows = { creature: -1.7, other: -3.3, land: -4.9 }
      commander = { x: cx - w / 2 + 0.7, z: -6.6 }
      const right = cx + w / 2
      piles.set(seat, {
        scale,
        library: { x: right - 0.7, z: -6.6 },
        graveyard: { x: right - 1.6, z: -6.6 },
        exile: { x: right - 2.5, z: -6.6 },
      })
    }

    const mine = view.battlefield.map((id) => view.objects[id]).filter((o): o is ObjectView => !!o && o.controller === seat)
    for (const row of ['creature', 'other', 'land'] as const) {
      placeRow(mine.filter((o) => !o.arrangement && rowOf(o) === row).map((o) => o.id), x0, x1, rows[row], scale, cards)
    }
    for (const o of mine) if (o.arrangement) cards.set(o.id, { x: o.arrangement.x, z: o.arrangement.z, scale, layer: 40 })

    view.players[seat]?.command.forEach((id, i) => {
      cards.set(id, { x: commander.x + i * 0.35, z: commander.z, scale, layer: i })
    })
  })

  view.stack.forEach((item, i) => {
    if (item.objectId) cards.set(item.objectId, { x: -1.5 + i * 0.7, z: 0, scale: 1.1, layer: i, floating: true })
  })

  return { areas, cards, piles }
}
