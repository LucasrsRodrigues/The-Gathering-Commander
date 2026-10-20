// The rules of a card for a game: the Oracle reader's result, with the card's exception on top when it has one.
// The app (Scryfall) and the server (catalog) both call this, so local and online games automate the same way.

import { deriveCardRules, type CardRules, type OracleFacts } from '@gathering-hall/engine'
import { OVERRIDES, type Override } from './overrides'

export { OVERRIDES, type Override } from './overrides'
export { validateRules } from './validate'

export function rulesFor(facts: OracleFacts, oracleId: string | undefined, overrides: Record<string, Override> = OVERRIDES): CardRules {
  const read = deriveCardRules(facts)
  const extra = oracleId ? overrides[oracleId] : undefined
  if (!extra) return read
  const merged: CardRules = { ...read, ...extra.rules }
  if (extra.rules.coverage === 'automated') delete merged.manualText
  return merged
}
