import type { CardFacts, DeckForValidation, DeckRules, RuleId } from '../types'

export interface RuleContext {
  deck: DeckForValidation
  facts: ReadonlyMap<string, CardFacts>
  rules: DeckRules
}

// A rule reports findings; the preset decides whether each one blocks, warns or is ignored.
export interface Finding {
  rule: RuleId
  message: string
  cards: string[]
}

export type Rule = (ctx: RuleContext) => Finding[]

export function factsOf(ctx: RuleContext, entries: DeckForValidation['cards']): { facts: CardFacts; count: number }[] {
  return entries.flatMap((e) => {
    const facts = ctx.facts.get(e.oracleId)
    return facts ? [{ facts, count: e.count }] : []
  })
}
