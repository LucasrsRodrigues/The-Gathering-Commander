import type { Board, Placement } from './board'
import type { PoolCard } from './cardPool'

export interface BenchOptions {
  stress: boolean // taps/untaps random cards continuously
  effects: boolean // playable glow + shadows
  hd: boolean // "normal" (488px) textures instead of "small" (146px)
}

export interface TableProps {
  pool: PoolCard[]
  board: Board
  layout: Map<string, Placement>
  glowIds: Set<string>
  opts: BenchOptions
  onTap: (id: string) => void
  onMove: (id: string, x: number, z: number) => void
}

export const LONG_PRESS_MS = 450
export const DRAG_THRESHOLD_PX = 6
