// Suggested Commander bracket. Thresholds are data: update BRACKET_RULES when Wizards revises the brackets.
// Bracket 1 vs 2 and bracket 5 depend on intent (theme, competitive mindset), which cards alone can't show.

import type { CardFacts, DeckForValidation } from './types'

export const BRACKET_RULES = {
  source: 'Commander Brackets (Wizards), lista de Game Changers de fev/2026; conferido em out/2026 por fontes secundárias',
  maxGameChangers: { 2: 0, 3: 3 } as Record<number, number>,
  massLandDenialFrom: 4,
  extraTurnChainsFrom: 4,
}

// Heuristics over Oracle text; the reasons list the cards so players can judge themselves.
const MASS_LAND_DENIAL = [
  /\b(destroy|exile) all (other )?(nonbasic )?lands\b/i,
  /\bdestroy all artifacts, creatures, and lands\b/i,
  /\breturn all lands to their owners'? hands\b/i,
  /\beach player sacrifices (all|half|\w+) (of )?(the )?lands\b/i,
  /\blands don't untap during their controllers' untap steps\b/i,
]
const EXTRA_TURN = /\btakes? an extra turn\b/i

export interface BracketSuggestion {
  bracket: 2 | 3 | 4
  reasons: string[]
  gameChangers: string[]
  massLandDenial: string[]
  extraTurns: string[]
}

export function suggestBracket(deck: DeckForValidation, facts: ReadonlyMap<string, CardFacts>): BracketSuggestion {
  const cards = [...deck.commanders, ...deck.cards].flatMap((e) => facts.get(e.oracleId) ?? [])
  const gameChangers = unique(cards.filter((c) => c.gameChanger).map((c) => c.name))
  const massLandDenial = unique(cards.filter((c) => MASS_LAND_DENIAL.some((re) => re.test(c.oracleText))).map((c) => c.name))
  const extraTurns = unique(cards.filter((c) => EXTRA_TURN.test(c.oracleText)).map((c) => c.name))

  let bracket: 2 | 3 | 4 = 2
  const reasons: string[] = []
  if (gameChangers.length > BRACKET_RULES.maxGameChangers[3]!) {
    bracket = 4
    reasons.push(`${gameChangers.length} Game Changers (o bracket 3 permite até ${BRACKET_RULES.maxGameChangers[3]}).`)
  } else if (gameChangers.length > 0) {
    bracket = 3
    reasons.push(`${gameChangers.length} Game Changer(s): ${gameChangers.join(', ')}.`)
  }
  if (massLandDenial.length) {
    bracket = 4
    reasons.push(`Destruição em massa de terrenos: ${massLandDenial.join(', ')}.`)
  }
  if (extraTurns.length >= 2) {
    bracket = 4
    reasons.push(`Várias cartas de turno extra (possível encadeamento): ${extraTurns.join(', ')}.`)
  } else if (extraTurns.length === 1) {
    reasons.push(`Uma carta de turno extra (${extraTurns[0]}): tudo bem, desde que não encadeie turnos.`)
  }
  if (bracket === 2) reasons.push('Sem Game Changers, sem destruição em massa de terrenos e sem turnos extras em cadeia.')
  reasons.push('Bracket 1 (temático) e 5 (cEDH) dependem da proposta do deck; combos de duas cartas ainda não são detectados.')
  return { bracket, reasons, gameChangers, massLandDenial, extraTurns }
}

function unique(names: string[]): string[] {
  return [...new Set(names)]
}
