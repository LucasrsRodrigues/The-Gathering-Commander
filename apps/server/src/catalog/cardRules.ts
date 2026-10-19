// The engine's card rules (épico 09, T9.3) come from the server catalog, never from the client: a modified client
// cannot make Sol Ring add ten mana. Cards the catalog does not know play without rules (manual costs).

import { deriveCardRules, type CardRef, type DeckInput, type OracleFacts } from '@gathering-hall/engine'
import { normalizeName, type ClientCard } from './normalize'
import { stripRules } from '../room/room'
import type { CatalogLookup } from './lookup'

// Rules are read from the front face (the one cast normally); the keyword list is the card's.
export function oracleFactsOf(card: ClientCard): OracleFacts {
  const front = card.card_faces?.[0]
  const pick = <K extends 'mana_cost' | 'type_line' | 'oracle_text' | 'power' | 'toughness' | 'loyalty'>(k: K) => front?.[k] ?? card[k]
  const facts: OracleFacts = {
    name: card.name, typeLine: pick('type_line') ?? '', manaCost: pick('mana_cost') ?? '', oracleText: pick('oracle_text') ?? '',
    keywords: card.keywords, colorIdentity: card.color_identity,
  }
  for (const [key, field] of [['power', 'power'], ['toughness', 'toughness'], ['loyalty', 'loyalty']] as const) {
    const value = pick(field)
    if (value !== undefined) facts[key] = value
  }
  return facts
}

export type DeckRulesFiller = (deck: DeckInput) => DeckInput

export function makeRulesFiller(catalog: CatalogLookup): DeckRulesFiller {
  return (deck) => {
    const plain = stripRules(deck)
    const found = catalog.resolveNames([...new Set([...plain.commanders, ...plain.cards].map((c) => c.name))])
    const cache = new Map<string, CardRef['rules']>()
    const fill = (ref: CardRef): CardRef => {
      const key = normalizeName(ref.name)
      if (!cache.has(key)) {
        const card = found.get(key)
        cache.set(key, card ? deriveCardRules(oracleFactsOf(card)) : undefined)
      }
      const rules = cache.get(key)
      return rules ? { ...ref, rules } : ref
    }
    return { commanders: plain.commanders.map(fill), cards: plain.cards.map(fill) }
  }
}
