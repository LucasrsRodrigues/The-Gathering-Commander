// Paying a spell's mana cost from the pool (épico 09, CR 107.4, 202.1, 601.2f–h).
//
// The cost is the printed cost with X chosen, plus the commander tax. Hybrid, two-brid and Phyrexian symbols each
// have two ways to pay; a small depth-first search tries them (mana before life) so a payment is found whenever
// one exists. Costs are short, so the search stays tiny.

import { commanderTax } from './commander'
import { payGeneric } from './mana'
import type { GameObject, ManaAmount, ManaColor, ManaCost, ManaPool, ManaType, Ruleset } from './types'

export const MAX_FLEXIBLE = 10 // symbols with a choice; beyond this the cost is treated as manual
const PHYREXIAN_LIFE = 2 // CR 107.4f
const TWO_BRID_GENERIC = 2 // CR 107.4e

export interface Payment {
  pool: ManaPool // what is left
  spent: ManaAmount
  life: number // paid for Phyrexian symbols
}

type Choice =
  | { kind: 'hybrid'; options: [ManaColor, ManaColor] }
  | { kind: 'twoBrid'; color: ManaColor }
  | { kind: 'phyrexian'; color: ManaColor }

// Null when the pool cannot pay. `x` is the value chosen for each {X}; `extraGeneric` is the commander tax.
export function findPayment(pool: ManaPool, cost: ManaCost, x: number, extraGeneric: number): Payment | null {
  const start = { ...pool }
  for (const [t, n] of Object.entries(cost.colored) as [ManaType, number][]) {
    if (start[t] < n) return null
    start[t] -= n
  }
  const choices: Choice[] = [
    ...cost.hybrid.map((options): Choice => ({ kind: 'hybrid', options })),
    ...cost.twoBrid.map((color): Choice => ({ kind: 'twoBrid', color })),
    ...cost.phyrexian.map((color): Choice => ({ kind: 'phyrexian', color })),
  ]
  if (choices.length > MAX_FLEXIBLE) return null
  const baseGeneric = cost.generic + cost.x * x + extraGeneric

  const search = (i: number, left: ManaPool, generic: number, life: number): { pool: ManaPool; life: number } | null => {
    if (i === choices.length) {
      const paid = payGeneric(left, generic)
      return paid ? { pool: paid, life } : null
    }
    const c = choices[i]!
    const withColor = (color: ManaColor) => (left[color] > 0 ? search(i + 1, { ...left, [color]: left[color] - 1 }, generic, life) : null)
    switch (c.kind) {
      case 'hybrid': return withColor(c.options[0]) ?? withColor(c.options[1])
      case 'twoBrid': return withColor(c.color) ?? search(i + 1, left, generic + TWO_BRID_GENERIC, life)
      case 'phyrexian': return withColor(c.color) ?? search(i + 1, left, generic, life + PHYREXIAN_LIFE)
    }
  }

  const found = search(0, start, baseGeneric, 0)
  if (!found) return null
  const spent: ManaAmount = {}
  for (const t of Object.keys(pool) as ManaType[]) if (pool[t] > found.pool[t]) spent[t] = pool[t] - found.pool[t]
  return { pool: found.pool, spent, life: found.life }
}

// What casting this object costs right now: its printed cost and the commander tax when cast from the command zone.
// `manual` = no data to charge (card without rules, unknown symbols, too many choices): the player pays by hand.
export type SpellCost = { kind: 'mana'; cost: ManaCost; tax: number } | { kind: 'none' } | { kind: 'manual' }

export function spellCost(obj: GameObject, ruleset: Ruleset): SpellCost {
  const rules = obj.card.rules
  if (!rules) return { kind: 'manual' }
  if (!rules.cost) return { kind: 'none' } // CR 202.1b: no mana cost, cannot be cast by paying one
  if (rules.cost.unknown || rules.cost.hybrid.length + rules.cost.twoBrid.length + rules.cost.phyrexian.length > MAX_FLEXIBLE) return { kind: 'manual' }
  return { kind: 'mana', cost: rules.cost, tax: obj.zone === 'command' ? commanderTax(obj, ruleset) : 0 }
}

// "{3}{G}{G}" style text for messages and the log (X already replaced by its value, tax included).
export function formatCost(cost: ManaCost, x: number, extraGeneric: number): string {
  const generic = cost.generic + cost.x * x + extraGeneric
  const parts: string[] = generic ? [`{${generic}}`] : []
  for (const t of ['W', 'U', 'B', 'R', 'G', 'C'] as const) parts.push(...Array<string>(cost.colored[t] ?? 0).fill(`{${t}}`))
  parts.push(...cost.hybrid.map(([a, b]) => `{${a}/${b}}`), ...cost.twoBrid.map((c) => `{2/${c}}`), ...cost.phyrexian.map((c) => `{${c}/P}`))
  return parts.join('') || '{0}'
}
