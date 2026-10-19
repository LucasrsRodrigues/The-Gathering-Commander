// Banned cards: the official list comes from catalog data (Scryfall legality), house rules add or lift bans by name.

import { normalizeName } from '../text'
import type { CardFacts, DeckRules } from '../types'
import { factsOf, type Rule } from './rule'

export function isBanned(card: CardFacts, banlist: DeckRules['banlist']): boolean {
  if (banlist.source === 'none') return false
  const name = normalizeName(card.name)
  if (banlist.extraBans.some((b) => normalizeName(b) === name)) return true
  if (banlist.source === 'custom') return false
  const lifted = banlist.unbans.some((b) => normalizeName(b) === name)
  return card.legalCommander === 'banned' && !lifted
}

export const bannedRule: Rule = (ctx) => {
  const banned = factsOf(ctx, [...ctx.deck.commanders, ...ctx.deck.cards])
    .map((e) => e.facts)
    .filter((card) => isBanned(card, ctx.rules.banlist))
  if (!banned.length) return []
  return [{ rule: 'banned', message: `Cartas banidas: ${banned.map((c) => c.name).join(', ')}.`, cards: banned.map((c) => c.name) }]
}
