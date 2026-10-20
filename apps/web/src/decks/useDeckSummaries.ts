// What the library shows about each deck beyond its document: color identity, commander art and validity against its
// own rules. Computed in the background, one deck at a time (the catalog cache makes repeat visits cheap), and kept
// per deck version so an edit refreshes only that deck.

import { useEffect, useState } from 'react'
import { blocks, commanderIdentity, resolvePreset, validateDeck, type Color } from '@gathering-hall/formats'
import type { Services } from '../app/services'
import { factsForDate } from '../catalog/legality'
import { imagesOf, loadDeckCards } from './cardData'
import { toValidation, type Deck } from './model'

export interface DeckSummary {
  identity: Color[] | null
  art: string | null
  status: 'ok' | 'warn' | 'blocked' | 'unknown'
  problems: number
  presetName: string
}

const cache = new Map<string, DeckSummary>() // `${id}:${updatedAt}`
const keyOf = (d: Deck) => `${d.id}:${d.updatedAt}`

async function summarize(deck: Deck, services: Services): Promise<DeckSummary> {
  const preset = services.presets.get(deck.presetId)
  const { deckRules } = resolvePreset(preset)
  try {
    const data = await loadDeckCards(deck, services.catalog)
    const dated = await factsForDate(data.facts, deckRules.banlist.asOf, services.legality)
    const violations = validateDeck(toValidation(deck), dated.facts, deckRules)
    const commanders = deck.commanders.flatMap((c) => dated.facts.get(c.oracleId) ?? [])
    const lead = deck.commanders[0]
    return {
      identity: commanders.length ? [...commanderIdentity(commanders)] : null,
      art: lead ? (imagesOf(lead, data)?.artCrop ?? null) : null,
      status: blocks(violations) ? 'blocked' : violations.length ? 'warn' : 'ok',
      problems: violations.filter((v) => v.level === 'block').length,
      presetName: preset.name,
    }
  } catch {
    return { identity: null, art: null, status: 'unknown', problems: 0, presetName: preset.name }
  }
}

export function useDeckSummaries(decks: readonly Deck[] | null, services: Services): ReadonlyMap<string, DeckSummary> {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!decks) return
    let live = true
    void (async () => {
      for (const deck of decks) {
        if (!live) return
        if (cache.has(keyOf(deck))) continue
        cache.set(keyOf(deck), await summarize(deck, services))
        if (live) setVersion((v) => v + 1)
      }
    })()
    return () => { live = false }
  }, [decks, services])
  void version
  return new Map((decks ?? []).flatMap((d) => (cache.has(keyOf(d)) ? [[d.id, cache.get(keyOf(d))!] as const] : [])))
}
