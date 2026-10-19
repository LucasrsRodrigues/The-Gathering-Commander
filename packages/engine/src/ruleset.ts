import type { Step, StopSettings, Ruleset } from './types'

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
  landsPerTurn: 1,
  // Épico 09 decided 'block' for all three. Each area switches to it when the table UI of its wave ships
  // (timing T9.7 ✓, mana T9.11 ✓, combat T9.16), so every deploy stays playable in between.
  timingRules: 'block',
  manaRules: 'block',
  combatRules: 'off',
}

// Arena-style defaults (épico 09, req. 30): stop in your main phases and to declare attackers; on other
// players' turns only when something goes on the stack or you are attacked.
const OWN_STOPS: Step[] = ['main1', 'declareAttackers', 'main2']
export function defaultStops(): StopSettings {
  return { own: [...OWN_STOPS], others: [], passAfterOwnSpell: true }
}

export function makeRuleset(overrides: Partial<Ruleset> = {}): Ruleset {
  return { ...COMMANDER_RULESET, ...overrides, id: 'commander' }
}
