// Server-side deck validation for online rooms (épico 01, T1.7): the server no longer has to trust the
// client's own check. Uses the versioned catalog; without catalog data it returns null (not checked).

import type { DeckInput } from '@gathering-hall/engine'
import {
  factsAsOf, resolvePreset, validateDeck, type CardFacts, type Color, type DeckForValidation, type Preset, type Violation,
} from '@gathering-hall/formats'
import { normalizeName, type ClientCard } from './normalize'
import type { SqliteCatalogStore } from './store'

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G']

export function factsFromCard(card: ClientCard): CardFacts {
  const front = card.card_faces?.[0]
  const text = [card.oracle_text, ...(card.card_faces ?? []).map((f) => f.oracle_text)].filter(Boolean).join('\n')
  return {
    oracleId: card.oracle_id, name: card.name, typeLine: card.type_line ?? front?.type_line ?? '', oracleText: text,
    colorIdentity: COLORS.filter((c) => card.color_identity.includes(c)), keywords: card.keywords,
    legalCommander: card.legalities.commander, gameChanger: card.game_changer,
  }
}

export type DeckChecker = (deck: DeckInput, preset: Preset) => Violation[] | null

export function makeDeckChecker(catalog: SqliteCatalogStore): DeckChecker {
  return (deck, preset) => {
    if (catalog.cardCount() === 0) return null
    const { deckRules } = resolvePreset(preset)
    const found = catalog.resolveNames([...deck.commanders, ...deck.cards].map((c) => c.name))
    let facts = new Map<string, CardFacts>()
    const idOf = (name: string) => found.get(normalizeName(name))?.oracle_id ?? `desconhecida:${normalizeName(name)}`
    for (const card of found.values()) facts.set(card.oracle_id, factsFromCard(card))
    if (deckRules.banlist.asOf) {
      const snap = catalog.commanderAt(deckRules.banlist.asOf)
      facts = factsAsOf(facts, { banned: new Set(snap.banned.map((c) => c.oracleId)), gameChangers: new Set(snap.gameChangers.map((c) => c.oracleId)) })
    }
    const count = (list: DeckInput['cards']) => {
      const counts = new Map<string, number>()
      for (const c of list) counts.set(idOf(c.name), (counts.get(idOf(c.name)) ?? 0) + 1)
      return [...counts].map(([oracleId, n]) => ({ oracleId, count: n }))
    }
    const forValidation: DeckForValidation = { commanders: count(deck.commanders), cards: count(deck.cards) }
    return validateDeck(forValidation, facts, deckRules)
  }
}
