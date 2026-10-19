// House-rule policies (épico 09): which rules of turn structure an action breaks, per area. Pure: it only reads the
// state. reduce() decides what to do with the findings from the area's level (block / warn / off).

import type { Action, GameState, RuleArea, RuleFinding, RuleLevel, Ruleset } from './types'

type Policy = (state: GameState, action: Action) => RuleFinding | null

export function levelOf(ruleset: Ruleset, area: RuleArea): RuleLevel {
  return area === 'timing' ? ruleset.timingRules : area === 'mana' ? ruleset.manaRules : ruleset.combatRules
}

// CR 601.2a / 305.1: cards are played from hand or the command zone by casting them or playing a land, not by
// moving them by hand. Other manual moves stay free (they are how unscripted effects are applied).
const playedByHand: Policy = (state, action) => {
  if (action.type !== 'moveObject' || (action.to !== 'battlefield' && action.to !== 'stack')) return null
  const obj = state.objects[action.objectId]
  if (!obj || (obj.zone !== 'hand' && obj.zone !== 'command')) return null
  return {
    area: 'timing', code: 'useCastOrPlay',
    message: 'Use "Jogar terreno" ou "Lançar" para pôr uma carta da mão ou da zona de comando em jogo.',
  }
}

const POLICIES: { area: RuleArea; check: Policy }[] = [
  { area: 'timing', check: playedByHand },
]

// Findings for every area that is not 'off'.
export function checkPolicies(state: GameState, action: Action): RuleFinding[] {
  const findings: RuleFinding[] = []
  for (const { area, check } of POLICIES) {
    if (levelOf(state.ruleset, area) === 'off') continue
    const finding = check(state, action)
    if (finding) findings.push(finding)
  }
  return findings
}
