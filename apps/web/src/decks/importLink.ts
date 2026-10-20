// Import by link (épico 10, req. 22–23): the server fetches the deck from Archidekt or Moxfield and answers with plain
// entries; here they become a new deck the same way the deck text does (bulkApply). The answer is untrusted too.

import { DECK_LIMITS } from '@gathering-hall/formats'
import type { CatalogPort } from '../catalog/catalog'
import { applyBulk, type BulkResult } from './bulkApply'
import type { BulkEntry, ParsedBulk } from './bulkText'
import { newDeck } from './model'

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type LinkImport =
  | { ok: true; result: BulkResult; source: string }
  | { ok: false; message: string; offerText: boolean } // offerText: suggest exporting as text and pasting

function entries(v: unknown, max: number): BulkEntry[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, max).flatMap((raw) => {
    const e = raw as Partial<BulkEntry> | null
    if (!e || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 150) return []
    const count = typeof e.count === 'number' && Number.isInteger(e.count) ? Math.min(99, Math.max(1, e.count)) : 1
    const tags = Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string' && t.length <= DECK_LIMITS.tagLength).slice(0, DECK_LIMITS.tagsPerCard) : []
    const set = typeof e.set === 'string' && /^[a-z0-9]{2,6}$/.test(e.set) ? e.set : undefined
    const number = set && typeof e.number === 'string' && /^[\w★-]{1,10}$/.test(e.number) ? e.number : undefined
    return [{ count, name: e.name.trim(), tags, ...(set ? { set } : {}), ...(number ? { number } : {}) }]
  })
}

export async function importFromLink(url: string, serverHttp: string, catalog: CatalogPort, id: string, now: number, fetchFn: Fetch = (u, i) => fetch(u, i)): Promise<LinkImport> {
  let res: Response
  try {
    res = await fetchFn(`${serverHttp}/api/import/deck`, {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ url: url.trim() }),
    })
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor do jogo. Exporte a lista como texto no site e cole aqui.', offerText: true }
  }
  const body = (await res.json().catch(() => ({}))) as { deck?: Record<string, unknown>; error?: unknown; message?: unknown }
  if (!res.ok || !body.deck) {
    const message = typeof body.message === 'string' ? body.message.slice(0, 300) : `O servidor respondeu ${res.status}.`
    return { ok: false, message, offerText: body.error !== 'link' }
  }
  const d = body.deck
  const parsed: ParsedBulk = {
    commanders: entries(d.commanders, 2), cards: entries(d.cards, DECK_LIMITS.entries), maybe: entries(d.maybe, DECK_LIMITS.maybe), errors: [],
  }
  if (!parsed.commanders.length && !parsed.cards.length) return { ok: false, message: 'O deck veio vazio.', offerText: true }
  const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Deck importado'
  const result = await applyBulk(newDeck(id, name, now), parsed, catalog, now)
  return { ok: true, result, source: d.source === 'moxfield' ? 'Moxfield' : 'Archidekt' }
}
