// Category suggestions from the Oracle text (épico 10, req. 8). Patterns on the rules text and the type line, never
// card names. Only suggestions: nothing changes until the player accepts them.

import type { CardFacts } from '@gathering-hall/formats'

export const SUGGESTED_CATEGORIES = ['Terreno', 'Ramp', 'Compra', 'Remoção', 'Limpa-mesa', 'Contramágica', 'Tutor'] as const
export type SuggestedCategory = (typeof SUGGESTED_CATEGORIES)[number]

const NUMBER = '(?:a|an|one|two|three|four|five|six|seven|x|that many|\\d+)'
const RULES: { tag: SuggestedCategory; test: (text: string, type: string) => boolean }[] = [
  { tag: 'Terreno', test: (_t, type) => /\bland\b/.test(type) },
  {
    tag: 'Ramp',
    test: (t, type) => !/\bland\b/.test(type) && (
      /(?:^|\n)[^\n]*\{t\}[^\n:]*: add \{/.test(t) || // a mana ability
      /\badd (?:\{[wubrgc]\}|one mana|two mana|three mana|mana of any)/.test(t) ||
      new RegExp(`search your library for (?:up to )?${NUMBER} (?:basic )?(?:[\\w-]+ )?land cards?`).test(t) ||
      /put (?:a|up to \w+) land cards? from your hand onto the battlefield/.test(t)
    ),
  },
  { tag: 'Compra', test: (t) => new RegExp(`\\bdraws? ${NUMBER} (?:additional )?cards?\\b`).test(t) },
  {
    tag: 'Remoção',
    test: (t) => /\b(?:destroy|exile) (?:up to \w+ )?target\b/.test(t) ||
      /deals? (?:\d+|x|that much) damage to (?:any target|target (?:creature|planeswalker|player or planeswalker))/.test(t),
  },
  {
    tag: 'Limpa-mesa',
    test: (t) => /\b(?:destroy|exile) all (?:other )?(?:creatures|nonland permanents|permanents|artifacts|enchantments|planeswalkers)/.test(t) ||
      /deals? (?:\d+|x) damage to each creature/.test(t) || /all creatures get -\d+\/-\d+/.test(t),
  },
  { tag: 'Contramágica', test: (t) => /\bcounter target (?:[\w-]+ )*spell\b/.test(t) },
  {
    tag: 'Tutor',
    test: (t) => {
      const m = /search your library for ([^.]*?)card/.exec(t)
      return !!m && !/\bland\b/.test(m[1]!) && !/basic/.test(m[1]!)
    },
  },
]

// Categories this card's text suggests (in the order above). Double-faced text counts both faces.
export function suggestCategories(facts: Pick<CardFacts, 'oracleText' | 'typeLine'>): SuggestedCategory[] {
  const text = facts.oracleText.toLowerCase()
  const type = (facts.typeLine.split('//')[0] ?? '').toLowerCase()
  return RULES.filter((r) => r.test(text, type)).map((r) => r.tag)
}

export interface Suggestion {
  zone: 'commanders' | 'cards' | 'maybe'
  oracleId: string
  name: string
  tags: SuggestedCategory[] // only the ones the card does not have yet
}

// For the editor's panel: every card with a suggestion it does not have yet.
export function suggestionsFor(
  cards: { zone: Suggestion['zone']; card: { oracleId: string; name: string; tags?: string[] } }[],
  facts: ReadonlyMap<string, Pick<CardFacts, 'oracleText' | 'typeLine'>>,
): Suggestion[] {
  return cards.flatMap(({ zone, card }) => {
    const f = facts.get(card.oracleId)
    if (!f) return []
    const has = new Set((card.tags ?? []).map((t) => t.toLowerCase()))
    const tags = suggestCategories(f).filter((t) => !has.has(t.toLowerCase()))
    return tags.length ? [{ zone, oracleId: card.oracleId, name: card.name, tags }] : []
  })
}
