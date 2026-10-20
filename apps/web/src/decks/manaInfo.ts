// What a card says about colors, for the stats panel (épico 10, req. 11): the colored symbols in its cost and the
// colors it can produce. Read from the engine's card rules when the catalog has them, else from the Oracle text.

import type { CardRules, ManaCost } from '@gathering-hall/engine'
import type { Color } from '@gathering-hall/formats'

export type Pips = Partial<Record<Color, number>>
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G']
const BASIC_TYPES: Record<string, Color> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' }

export interface ManaInfo {
  pips: Pips // colored symbols in the mana cost ({W/U} counts for both, {2/W} and {G/P} for their color)
  sources: (Color | 'C')[] // colors it can add
  anyColor: boolean // "any color" / "your commander's color identity": a source of every color of the deck
}

function pipsOf(cost: ManaCost | null | undefined): Pips {
  const pips: Pips = {}
  if (!cost) return pips
  const add = (c: Color, n = 1) => { pips[c] = (pips[c] ?? 0) + n }
  for (const c of COLORS) if (cost.colored[c]) add(c, cost.colored[c])
  for (const [a, b] of cost.hybrid) { add(a); add(b) }
  for (const c of cost.twoBrid) add(c)
  for (const c of cost.phyrexian) add(c)
  return pips
}

function fromRules(rules: CardRules): ManaInfo {
  const sources = new Set<Color | 'C'>()
  let anyColor = false
  for (const a of rules.manaAbilities) {
    const p = a.produces
    if (p.kind === 'fixed') for (const t of Object.keys(p.mana) as (Color | 'C')[]) sources.add(t)
    else if (p.kind === 'oneOf') for (const t of p.colors) sources.add(t)
    else anyColor = true
  }
  if (rules.spellMana) for (const t of Object.keys(rules.spellMana) as (Color | 'C')[]) sources.add(t)
  return { pips: pipsOf(rules.cost), sources: [...sources], anyColor }
}

// Text fallback: "Add {R}", "Add {W} or {U}", "one mana of any color", and basic land types in the type line.
function fromText(oracleText: string, typeLine: string): ManaInfo {
  const text = oracleText.toLowerCase()
  const sources = new Set<Color | 'C'>()
  for (const m of text.matchAll(/\badd ([^.]*)/g)) {
    for (const s of m[1]!.matchAll(/\{([wubrgc])\}/g)) sources.add(s[1]!.toUpperCase() as Color | 'C')
  }
  for (const [type, color] of Object.entries(BASIC_TYPES)) if (new RegExp(`\\b${type}\\b`).test(typeLine.toLowerCase())) sources.add(color)
  return { pips: {}, sources: [...sources], anyColor: /mana of any (?:one )?color|commander's color identity/.test(text) }
}

export function manaInfoOf(rules: CardRules | undefined, oracleText: string, typeLine: string): ManaInfo {
  return rules ? fromRules(rules) : fromText(oracleText, typeLine)
}
