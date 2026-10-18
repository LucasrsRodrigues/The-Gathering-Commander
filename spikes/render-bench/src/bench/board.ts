// Renderer-agnostic board: generation + layout in "table units".
// Both renderers consume the same layout, which is the point of the spike:
// the renderer is a replaceable detail on top of a shared model.

import type { CardKind, PoolCard } from './cardPool'

export const TABLE = { W: 26, D: 16, CW: 1, CH: 1.4 } as const

export const PLAYERS = 4
const OPPONENT_SCALE = 0.8

export interface Permanent {
  id: string
  owner: number
  poolIdx: number
  kind: CardKind
  tapped: boolean
  commander: boolean
  pos?: { x: number; z: number } // set when the player drops the card somewhere by hand
  enteredAt?: number
}

export interface Board {
  perms: Permanent[]
  hand: number[] // pool indexes in the local player's hand
}

export interface Placement {
  x: number
  z: number
  scale: number
  layer: number // draw order inside overlapping rows
}

export interface Plate {
  owner: number
  x: number
  z: number
  w: number
  d: number
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateBoard(pool: PoolCard[], perPlayer: number, seed: number): Board {
  const rand = mulberry32(seed)
  const pick = (idxs: number[]) => idxs[Math.floor(rand() * idxs.length)]
  const indexesOf = (pred: (c: PoolCard) => boolean) => pool.flatMap((c, i) => (pred(c) ? [i] : []))
  const commanders = indexesOf((c) => c.commander)
  const lands = indexesOf((c) => c.kind === 'land')
  const creatures = indexesOf((c) => c.kind === 'creature' && !c.commander)
  const others = indexesOf((c) => c.kind === 'other')

  const perms: Permanent[] = []
  let n = 0
  const add = (owner: number, poolIdx: number, commander = false) => {
    const kind = pool[poolIdx].kind
    perms.push({ id: `p${n++}`, owner, poolIdx, kind, commander, tapped: rand() < (kind === 'land' ? 0.45 : 0.2) })
  }

  for (let owner = 0; owner < PLAYERS; owner++) {
    add(owner, commanders[(seed + owner) % commanders.length], true)
    const landCount = Math.round(perPlayer * 0.42)
    const creatureCount = Math.round(perPlayer * 0.36)
    const otherCount = Math.max(0, perPlayer - 1 - landCount - creatureCount)
    for (let i = 0; i < landCount; i++) add(owner, pick(lands))
    for (let i = 0; i < creatureCount; i++) add(owner, pick(creatures))
    for (let i = 0; i < otherCount; i++) add(owner, pick(others))
  }

  const nonLands = [...creatures, ...others]
  const hand = Array.from({ length: 7 }, () => pick(nonLands))
  return { perms, hand }
}

// Table regions: the local player gets the front half, opponents share the back half.
const LOCAL = { x0: -10.2, x1: 12, rows: { creature: 1.9, other: 3.8, land: 5.7 }, commander: { x: -11.5, z: 5.7 } }
const OPP_COL = 8.4
const OPP_CENTERS = [-8.6, 0, 8.6]
const OPP_ROWS = { creature: -1.6, other: -3.2, land: -4.8 }

export const PLATES: Plate[] = [
  { owner: 0, x: 0, z: 3.8, w: TABLE.W - 0.6, d: 7.2 },
  ...OPP_CENTERS.map((x, i) => ({ owner: i + 1, x, z: -3.9, w: OPP_COL, d: 7.4 })),
]

function placeRow(items: Permanent[], x0: number, x1: number, z: number, scale: number, out: Map<string, Placement>) {
  const n = items.length
  if (!n) return
  const cw = TABLE.CW * scale * 1.06
  const step = n > 1 ? Math.min(cw, (x1 - x0 - cw) / (n - 1)) : 0
  const start = (x0 + x1) / 2 - (step * (n - 1)) / 2
  items.forEach((p, i) => out.set(p.id, { x: start + i * step, z, scale, layer: i }))
}

export function layoutBoard(perms: Permanent[]): Map<string, Placement> {
  const out = new Map<string, Placement>()
  for (let owner = 0; owner < PLAYERS; owner++) {
    const mine = perms.filter((p) => p.owner === owner && !p.pos)
    const local = owner === 0
    const scale = local ? 1 : OPPONENT_SCALE
    const cx = local ? 0 : OPP_CENTERS[owner - 1]
    const x0 = local ? LOCAL.x0 : cx - OPP_COL / 2 + 0.3
    const x1 = local ? LOCAL.x1 : cx + OPP_COL / 2 - 0.3
    const rows = local ? LOCAL.rows : OPP_ROWS

    const commander = mine.find((p) => p.commander)
    if (commander) {
      const at = local ? LOCAL.commander : { x: cx - OPP_COL / 2 + 0.6, z: -6.5 }
      out.set(commander.id, { ...at, scale, layer: 0 })
    }
    const rest = mine.filter((p) => !p.commander)
    for (const kind of ['creature', 'other', 'land'] as const) {
      placeRow(rest.filter((p) => p.kind === kind), x0, x1, rows[kind], scale, out)
    }
  }
  for (const p of perms) {
    if (p.pos) out.set(p.id, { x: p.pos.x, z: p.pos.z, scale: p.owner === 0 ? 1 : OPPONENT_SCALE, layer: 60 })
  }
  return out
}
