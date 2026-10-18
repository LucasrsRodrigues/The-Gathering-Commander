// Seeded PRNG (mulberry32). Its whole state is one 32-bit integer stored in GameState.rng,
// so shuffles are reproducible for replays and identical on client and server.

export function nextRandom(state: number): [value: number, nextState: number] {
  const next = (state + 0x6d2b79f5) | 0
  let t = Math.imul(next ^ (next >>> 15), 1 | next)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

// Fisher-Yates shuffle returning a new array and the advanced PRNG state.
export function shuffle<T>(items: readonly T[], rng: number): [shuffled: T[], nextRng: number] {
  const out = items.slice()
  let state = rng
  for (let i = out.length - 1; i > 0; i--) {
    const [r, s] = nextRandom(state)
    state = s
    const j = Math.floor(r * (i + 1))
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return [out, state]
}

export function randomIndex(length: number, rng: number): [index: number, nextRng: number] {
  const [r, s] = nextRandom(rng)
  return [Math.floor(r * length), s]
}
