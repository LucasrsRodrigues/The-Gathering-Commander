import type { CardFacts } from './types'

export interface LegalitySnapshot {
  banned: ReadonlySet<string> // oracle ids banned in Commander on that date
  gameChangers: ReadonlySet<string>
}

// Rewrites the dated facts (legality, Game Changer) so validation and bracket follow a past date.
// Everything else about the cards stays current.
export function factsAsOf(facts: ReadonlyMap<string, CardFacts>, snapshot: LegalitySnapshot): Map<string, CardFacts> {
  const out = new Map<string, CardFacts>()
  for (const [id, f] of facts) {
    const legal = snapshot.banned.has(id) ? 'banned' : f.legalCommander === 'banned' ? 'legal' : f.legalCommander
    out.set(id, { ...f, legalCommander: legal, gameChanger: snapshot.gameChangers.has(id) })
  }
  return out
}
