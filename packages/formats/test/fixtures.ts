import type { CardFacts, Color, DeckForValidation } from '../src'

let n = 0
export function card(name: string, opts: Partial<CardFacts> = {}): CardFacts {
  return {
    oracleId: opts.oracleId ?? `or-${++n}-${name}`,
    name,
    typeLine: 'Creature — Elf',
    oracleText: '',
    colorIdentity: [],
    keywords: [],
    legalCommander: 'legal',
    gameChanger: false,
    ...opts,
  }
}

export const legend = (name: string, colors: Color[], extra: Partial<CardFacts> = {}) =>
  card(name, { typeLine: 'Legendary Creature — Human', colorIdentity: colors, ...extra })

// Colorless basic used to fill decks up to size without touching color identity.
export const filler = card('Wastes', { typeLine: 'Basic Land' })

// Builds a deck of exactly `size` cards: commanders + given cards + fillers of a basic land.
export function deckOf(commanders: CardFacts[], cards: CardFacts[], size = 100) {
  const all = [...commanders, ...cards, filler]
  const facts = new Map(all.map((c) => [c.oracleId, c]))
  const fill = size - commanders.length - cards.length
  const deck: DeckForValidation = {
    commanders: commanders.map((c) => ({ oracleId: c.oracleId, count: 1 })),
    cards: [...cards.map((c) => ({ oracleId: c.oracleId, count: 1 })), ...(fill > 0 ? [{ oracleId: filler.oracleId, count: fill }] : [])],
  }
  return { deck, facts }
}
