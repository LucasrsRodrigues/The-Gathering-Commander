// Tiny external stores so hover previews and render stats don't re-render the whole board.

import { useSyncExternalStore } from 'react'

export interface Store<T> {
  get: () => T
  set: (next: T) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      listeners.forEach((l) => l())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get)
}

export const previewStore = createStore<string | null>(null)
export const renderStatsStore = createStore<{ calls: number; triangles: number } | null>(null)

// Frame sampler driven by its own rAF loop, independent of the renderer being measured.
const SIZE = 4096
class FpsSampler {
  private times = new Float64Array(SIZE)
  private deltas = new Float32Array(SIZE)
  private head = 0
  private count = 0
  private last = 0
  private running = false

  start() {
    if (this.running) return
    this.running = true
    const loop = (t: number) => {
      if (this.last) {
        this.times[this.head] = t
        this.deltas[this.head] = t - this.last
        this.head = (this.head + 1) % SIZE
        this.count = Math.min(this.count + 1, SIZE)
      }
      this.last = t
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  // Average fps and "1% low" fps over the last `windowMs`.
  stats(windowMs: number) {
    const now = performance.now()
    const ds: number[] = []
    for (let k = 0; k < this.count; k++) {
      const idx = (this.head - 1 - k + SIZE) % SIZE
      if (now - this.times[idx] > windowMs) break
      ds.push(this.deltas[idx])
    }
    if (!ds.length) return { fps: 0, low: 0, frames: 0 }
    const avg = ds.reduce((a, b) => a + b, 0) / ds.length
    ds.sort((a, b) => b - a)
    const worst = ds[Math.floor(ds.length * 0.01)]
    return { fps: 1000 / avg, low: 1000 / worst, frames: ds.length }
  }
}

export const fpsSampler = new FpsSampler()
