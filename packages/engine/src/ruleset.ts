import type { Ruleset } from './types'

// Official multiplayer Commander defaults (CR 903, 103.5c). House rules only override values.
export const COMMANDER_RULESET: Ruleset = {
  id: 'commander',
  version: '2026-10',
  startingLife: 40,
  startingHandSize: 7,
  maxHandSize: 7,
  commanderDamageLimit: 21,
  poisonLimit: 10,
  commanderTaxIncrement: 2,
  mulligan: 'london',
  freeMulligans: 1,
  autoUntap: true,
  autoDraw: true,
  autoLoss: true,
  priorityMode: 'relaxed',
  restrictToController: false, // sandbox: anyone may move public cards; hidden zones stay owner-only
}

export function makeRuleset(overrides: Partial<Ruleset> = {}): Ruleset {
  return { ...COMMANDER_RULESET, ...overrides, id: 'commander' }
}
