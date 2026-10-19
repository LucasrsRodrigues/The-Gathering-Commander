import { bannedRule } from './rules/banned'
import { colorIdentityRule, singletonRule, sizeRule } from './rules/basic'
import { commanderEligibilityRule, pairingRule } from './rules/commander'
import type { Rule, RuleContext } from './rules/rule'
import type { CardFacts, DeckForValidation, DeckRules, Enforcement, RuleId, Violation } from './types'

const RULES: { id: RuleId; rule: Rule; level: (r: DeckRules) => Enforcement }[] = [
  { id: 'size', rule: sizeRule, level: (r) => r.sizeLevel },
  { id: 'commanderEligibility', rule: commanderEligibilityRule, level: (r) => r.commanderEligibility },
  { id: 'pairing', rule: pairingRule, level: (r) => r.pairing },
  { id: 'singleton', rule: singletonRule, level: (r) => r.singleton },
  { id: 'colorIdentity', rule: colorIdentityRule, level: (r) => r.colorIdentity },
  { id: 'banned', rule: bannedRule, level: (r) => r.banlist.level },
]

// Validates a deck against resolved deck rules. Cards without facts are reported (warn) and skipped by the rules.
export function validateDeck(deck: DeckForValidation, facts: ReadonlyMap<string, CardFacts>, rules: DeckRules): Violation[] {
  const ctx: RuleContext = { deck, facts, rules }
  const violations: Violation[] = []

  const unknown = [...deck.commanders, ...deck.cards].filter((e) => !facts.has(e.oracleId))
  if (unknown.length) {
    violations.push({
      rule: 'unknownCard',
      level: 'warn',
      message: `${unknown.length} carta(s) sem dados do catálogo; não foram checadas.`,
      cards: [],
    })
  }

  for (const { rule, level } of RULES) {
    const enforcement = level(rules)
    if (enforcement === 'off') continue
    for (const finding of rule(ctx)) violations.push({ ...finding, level: enforcement })
  }
  return violations
}

export function blocks(violations: Violation[]): boolean {
  return violations.some((v) => v.level === 'block')
}
