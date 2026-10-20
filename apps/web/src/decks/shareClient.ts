// Public deck links on the server (épico 10, req. 25–28). Changing links needs the account (session cookie);
// reading a public deck does not.

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export const SLUG = /^[0-9A-Za-z]{10}$/
export const publicDeckUrl = (slug: string, base = `${location.origin}${location.pathname}`) => `${base}#/d/${slug}`

export class ShareClient {
  private readonly base: string
  private readonly fetchFn: Fetch
  constructor(base: string, fetchFn: Fetch = (u, i) => fetch(u, i)) {
    this.base = base.replace(/\/+$/, '')
    this.fetchFn = fetchFn
  }

  private async call(path: string, init: RequestInit = {}, withAccount = true): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const res = await this.fetchFn(`${this.base}${path}`, {
      ...init, credentials: withAccount ? 'include' : 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json', ...init.headers },
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, body }
  }

  async linkOf(deckId: string): Promise<string | null> {
    const r = await this.call('/api/shares')
    const list = Array.isArray(r.body.shares) ? (r.body.shares as { deckId?: unknown; slug?: unknown }[]) : []
    const hit = list.find((s) => s.deckId === deckId && typeof s.slug === 'string' && SLUG.test(s.slug))
    return (hit?.slug as string | undefined) ?? null
  }

  async share(deckId: string): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
    const r = await this.call(`/api/decks/${encodeURIComponent(deckId)}/share`, { method: 'PUT' })
    const slug = r.body.slug
    if (r.ok && typeof slug === 'string' && SLUG.test(slug)) return { ok: true, slug }
    return { ok: false, message: typeof r.body.error === 'string' ? r.body.error.slice(0, 200) : `O servidor respondeu ${r.status}.` }
  }

  async unshare(deckId: string): Promise<boolean> {
    return (await this.call(`/api/decks/${encodeURIComponent(deckId)}/share`, { method: 'DELETE' })).ok
  }

  // The public deck, or null when the link does not exist (any more).
  async read(slug: string): Promise<Record<string, unknown> | null> {
    if (!SLUG.test(slug)) return null
    const r = await this.call(`/api/public/decks/${slug}`, {}, false)
    if (r.status === 404) return null
    if (!r.ok || !r.body.deck || typeof r.body.deck !== 'object') throw new Error(`O servidor respondeu ${r.status}.`)
    return r.body.deck as Record<string, unknown>
  }
}
