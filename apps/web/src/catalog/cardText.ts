// The text shown next to the enlarged card: the Oracle text (kept in memory as the catalog resolves cards, like the
// images) and, when Scryfall has a Portuguese printing, its printed text. Translations are fetched on demand, one
// card at a time, and kept in this browser (misses too, so a card without a translation is asked only once).

import { useEffect, useState } from 'react'
import type { CardRef } from '@gathering-hall/engine'
import { normalizeName, onRememberCard, type CatalogCard } from './catalog'

export interface CardText {
  name: string
  typeLine: string
  oracleText: string
  keywords: string[]
}

export interface Translation {
  name: string
  typeLine: string
  text: string
}

export interface TextSource {
  resolve(name: string): Promise<void> // fills the memory below through rememberCardText
  translation(oracleId: string): Promise<Translation | null>
}

const byOracle = new Map<string, CardText>()
const byName = new Map<string, CardText>()
let source: TextSource | null = null

export function rememberCardText(card: CatalogCard) {
  if (!card.facts) return
  const text: CardText = { name: card.ref.name, typeLine: card.facts.typeLine, oracleText: card.facts.oracleText, keywords: card.facts.keywords }
  byOracle.set(card.facts.oracleId, text)
  byName.set(normalizeName(card.ref.name), text)
}

onRememberCard(rememberCardText)

export function cardTextFor(ref: CardRef | null): CardText | null {
  if (!ref) return null
  return (ref.oracleId && byOracle.get(ref.oracleId)) || byName.get(normalizeName(ref.name)) || null
}

export function setCardTextSource(s: TextSource | null) {
  source = s
}

// ---- translations, cached in localStorage ------------------------------------

const KEY = 'gh-pt-text-v2' // v2: printings without printed text (basic lands) count as translated
const MAX_ENTRIES = 3000
let cache: Record<string, Translation | null> | null = null

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function load(): Record<string, Translation | null> {
  if (cache) return cache
  try {
    const raw = JSON.parse(storage()?.getItem(KEY) ?? '{}') as unknown
    cache = raw && typeof raw === 'object' ? (raw as Record<string, Translation | null>) : {}
  } catch {
    cache = {}
  }
  return cache
}

function save() {
  try {
    const entries = Object.entries(load())
    if (entries.length > MAX_ENTRIES) cache = Object.fromEntries(entries.slice(-MAX_ENTRIES))
    storage()?.setItem(KEY, JSON.stringify(cache))
  } catch {
    // full or blocked: the translation is fetched again next time
  }
}

const pending = new Map<string, Promise<Translation | null>>()

export function cachedTranslation(oracleId: string): Translation | null | undefined {
  const c = load()
  return oracleId in c ? c[oracleId]! : undefined
}

export function translationFor(oracleId: string): Promise<Translation | null> {
  const hit = cachedTranslation(oracleId)
  if (hit !== undefined) return Promise.resolve(hit)
  if (!source) return Promise.resolve(null)
  const inFlight = pending.get(oracleId)
  if (inFlight) return inFlight
  const p = source.translation(oracleId)
    .then((t) => {
      load()[oracleId] = t
      save()
      return t
    })
    .catch(() => null) // offline: not cached, asked again later
    .finally(() => pending.delete(oracleId))
  pending.set(oracleId, p)
  return p
}

// For the preview: the card's text, and its Portuguese printing when it exists. Waits a moment before fetching, so
// sweeping the mouse over the table does not fire a request per card.
export function useCardText(ref: CardRef | null): { text: CardText | null; pt: Translation | null; loadingPt: boolean } {
  const [, bump] = useState(0)
  const text = cardTextFor(ref)
  const oracleId = ref?.oracleId ?? null
  const cachedPt = oracleId ? cachedTranslation(oracleId) : null
  useEffect(() => {
    if (!ref) return
    let live = true
    const t = setTimeout(() => {
      if (!cardTextFor(ref) && source) void source.resolve(ref.name).then(() => live && bump((n) => n + 1)).catch(() => {})
      if (oracleId && cachedTranslation(oracleId) === undefined) void translationFor(oracleId).then(() => live && bump((n) => n + 1))
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [ref, oracleId])
  return { text, pt: cachedPt ?? null, loadingPt: !!oracleId && cachedPt === undefined }
}
