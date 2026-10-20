// The deck as text, for editing in bulk (épico 10, req. 13–15). One line per card:
//   1 Sol Ring (C21) 263 #Ramp #"Mana extra"
// with the sections Commander, Deck and Talvez. Also reads the exports of Moxfield (`*F*`, `*CMDR*`, `#tag`) and
// Archidekt (`[Categoria, Outra]`, `^tags^`). The text is untrusted: bounded in size, treated strictly as text.

import { DECK_LIMITS } from '@gathering-hall/formats'
import type { Deck, DeckCard, DeckZone } from './model'

export const BULK_LIMITS = { chars: 30_000, lines: 450, lineLength: 200, copies: 99 } as const
// oxlint-disable-next-line no-control-regex -- detecting control characters is the point
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/

export interface BulkEntry {
  count: number
  name: string
  set?: string // printing, when the line gives (SET) number
  number?: string
  tags: string[]
}

export interface ParsedBulk {
  commanders: BulkEntry[]
  cards: BulkEntry[]
  maybe: BulkEntry[]
  errors: string[]
}

const HEADERS: { re: RegExp; zone: DeckZone | null }[] = [
  { re: /^(?:\/\/\s*)?(?:commanders?|comandantes?)\s*(?:\(\d+\))?\s*:?$/i, zone: 'commanders' },
  { re: /^(?:\/\/\s*)?(?:talvez|maybeboard|maybe|considering|sideboard)\s*(?:\(\d+\))?\s*:?$/i, zone: 'maybe' },
  { re: /^(?:\/\/\s*)?(?:tokens?|fichas?)\s*(?:\(\d+\))?\s*:?$/i, zone: null }, // ignored
  { re: /^(?:\/\/\s*)?(?:deck|mainboard|main|companion|creatures?|lands?|instants?|sorceries|artifacts?|enchantments?|planeswalkers?|battles?)\s*(?:\(\d+\))?\s*:?$/i, zone: 'cards' },
]

const cleanTag = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, DECK_LIMITS.tagLength).trim()

// One card line, or null when it is not one.
export function parseBulkLine(raw: string): (BulkEntry & { commander: boolean }) | null {
  const m = /^(?:(\d+)\s*x?\s+)?(.+)$/i.exec(raw.trim())
  if (!m) return null
  const count = m[1] ? Number(m[1]) : 1
  let rest = m[2]!
  const tags: string[] = []
  const addTag = (t: string) => {
    const tag = cleanTag(t)
    if (tag && !tags.some((x) => x.toLowerCase() === tag.toLowerCase())) tags.push(tag)
  }
  // #"Multi word" and #Tag (Moxfield); [A, B] categories (Archidekt); ^tags^ (Archidekt colors) are dropped.
  rest = rest.replace(/\s\^[^^]*\^/g, '') // first: their colors look like #tags
  rest = rest.replace(/\s#(?:"([^"]{1,40})"|([^\s#"]{1,40}))/g, (_, quoted?: string, plain?: string) => (addTag(quoted ?? plain ?? ''), ''))
  rest = rest.replace(/\s\[([^\]]{0,200})\]/g, (_, list: string) => {
    for (const t of list.split(',')) addTag(t.replace(/\{[^}]*\}/g, ''))
    return ''
  })
  const commander = /\*CMDR\*/i.test(rest)
  rest = rest.replace(/\s*\*[A-Z]+\*/gi, '') // *F*, *E*, *CMDR*
  let set: string | undefined
  let number: string | undefined
  rest = rest.replace(/\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([\w★-]{1,10}))?\s*$/, (_, s: string, n?: string) => {
    set = s.toLowerCase()
    if (n) number = n
    return ''
  })
  const name = rest.trim()
  if (!name || name.length > 150 || count < 1 || count > BULK_LIMITS.copies) return null
  return { count, name, tags: tags.slice(0, DECK_LIMITS.tagsPerCard), commander, ...(set ? { set } : {}), ...(set && number ? { number } : {}) }
}

export function parseBulk(text: string): ParsedBulk {
  const out: ParsedBulk = { commanders: [], cards: [], maybe: [], errors: [] }
  if (typeof text !== 'string') return { ...out, errors: ['O texto não é texto.'] }
  if (text.length > BULK_LIMITS.chars) return { ...out, errors: [`O texto tem mais de ${BULK_LIMITS.chars} caracteres.`] }
  const lines = text.split(/\r?\n/)
  if (lines.length > BULK_LIMITS.lines) return { ...out, errors: [`O texto tem mais de ${BULK_LIMITS.lines} linhas.`] }
  let zone: DeckZone | null = 'cards'
  const max: Record<DeckZone, number> = { commanders: 2, cards: DECK_LIMITS.entries, maybe: DECK_LIMITS.maybe }
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    if (line.length > BULK_LIMITS.lineLength) return void out.errors.push(`Linha ${i + 1} é longa demais.`)
    if (UNSAFE.test(line)) return void out.errors.push(`Linha ${i + 1} tem caracteres de controle e foi ignorada.`)
    const header = HEADERS.find((h) => h.re.test(line))
    if (header) return void (zone = header.zone)
    if (line.startsWith('//')) return
    if (zone === null) return
    const entry = parseBulkLine(line)
    if (!entry) return void out.errors.push(`Linha ${i + 1} não foi entendida: "${line.slice(0, 60)}"`)
    const { commander, ...card } = entry
    const target: DeckZone = commander && zone !== 'maybe' ? 'commanders' : zone
    if (out[target].length >= max[target]) return void out.errors.push(`Linha ${i + 1}: a lista passou do limite e foi ignorada.`)
    out[target].push(card)
  })
  return out
}

const quoteTag = (t: string) => (/\s|"/.test(t) ? `#"${t.replace(/"/g, '')}"` : `#${t}`)

// print: the (SET) number of a chosen printing, when the catalog knows it.
export function serializeBulk(deck: Deck, print: (scryfallId: string) => { set: string; number: string } | null = () => null): string {
  const line = (c: DeckCard) => {
    const p = c.scryfallId ? print(c.scryfallId) : null
    return [`${c.count} ${c.name}`, ...(p ? [`(${p.set.toUpperCase()}) ${p.number}`] : []), ...(c.tags ?? []).map(quoteTag)].join(' ')
  }
  const byName = (list: DeckCard[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))
  const parts = [
    ...(deck.commanders.length ? ['Commander', ...deck.commanders.map(line), ''] : []),
    'Deck', ...byName(deck.cards).map(line),
    ...(deck.maybe.length ? ['', 'Talvez', ...byName(deck.maybe).map(line)] : []),
  ]
  return parts.join('\n')
}
