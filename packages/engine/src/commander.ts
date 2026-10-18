import type { GameObject, Ruleset } from './types'

// CR 903.8: casting a commander from the command zone costs {2} more for each previous cast from there.
export function commanderTax(obj: GameObject, ruleset: Ruleset): number {
  return obj.isCommander ? obj.commanderCasts * ruleset.commanderTaxIncrement : 0
}
