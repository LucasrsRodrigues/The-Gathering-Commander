// Abuse limits: a token bucket per connection (message flood) and a sliding window per IP (room creation).

export class TokenBucket {
  private tokens: number
  private last: number
  private readonly capacity: number
  private readonly perSecond: number

  constructor(capacity: number, perSecond: number, now: number) {
    this.capacity = capacity
    this.perSecond = perSecond
    this.tokens = capacity
    this.last = now
  }

  take(now: number): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

export class WindowLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly max: number
  private readonly windowMs: number

  constructor(max: number, windowMs: number) {
    this.max = max
    this.windowMs = windowMs
  }

  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }

  sweep(now: number) {
    for (const [key, times] of this.hits) if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key)
  }
}
