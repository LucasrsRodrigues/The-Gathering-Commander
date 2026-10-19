// Size (CR 903.5a), singleton (CR 903.5b) and color identity (CR 903.4, 903.5c).

import { frontType, numberWord } from '../text'
import type { CardFacts, Color } from '../types'
import { factsOf, type Rule } from './rule'

export const sizeRule: Rule = ({ deck, rules }) => {
  const total = [...deck.commanders, ...deck.cards].reduce((n, e) => n + e.count, 0)
  if (total === rules.deckSize) return []
  return [{
    rule: 'size',
    message: `O deck tem ${total} cartas; o formato pede ${rules.deckSize}, com o comandante incluído.`,
    cards: [],
  }]
}

// How many copies a card allows: basics and "any number of cards named" are unlimited,
// "up to seven cards named" allows that many (CR 903.5b exceptions come from Oracle text).
export function copiesAllowed(card: CardFacts): number {
  if (frontType(card.typeLine).includes('basic')) return Infinity
  if (/a deck can have any number of cards named/i.test(card.oracleText)) return Infinity
  const upTo = /a deck can have up to (\w+) cards named/i.exec(card.oracleText)
  const n = upTo ? numberWord(upTo[1]!) : undefined
  return n ?? 1
}

export const singletonRule: Rule = (ctx) => {
  const totals = new Map<string, { facts: CardFacts; count: number }>()
  for (const { facts, count } of factsOf(ctx, [...ctx.deck.commanders, ...ctx.deck.cards])) {
    const prev = totals.get(facts.oracleId)
    totals.set(facts.oracleId, { facts, count: (prev?.count ?? 0) + count })
  }
  const over = [...totals.values()].filter(({ facts, count }) => count > copiesAllowed(facts))
  if (!over.length) return []
  return [{
    rule: 'singleton',
    message: `Cartas repetidas além do permitido: ${over.map(({ facts, count }) => `${facts.name} (${count})`).join(', ')}.`,
    cards: over.map(({ facts }) => facts.name),
  }]
}

export function commanderIdentity(commanders: CardFacts[]): Set<Color> {
  return new Set(commanders.flatMap((c) => c.colorIdentity))
}

export const colorIdentityRule: Rule = (ctx) => {
  const commanders = factsOf(ctx, ctx.deck.commanders).map((e) => e.facts)
  if (!commanders.length) return []
  const identity = commanderIdentity(commanders)
  const outside = factsOf(ctx, ctx.deck.cards)
    .map((e) => e.facts)
    .filter((card) => card.colorIdentity.some((c) => !identity.has(c)))
  if (!outside.length) return []
  const colors = [...identity].join('') || 'incolor'
  return [{
    rule: 'colorIdentity',
    message: `Fora da identidade de cor do comandante (${colors}): ${outside.map((c) => c.name).join(', ')}.`,
    cards: outside.map((c) => c.name),
  }]
}
