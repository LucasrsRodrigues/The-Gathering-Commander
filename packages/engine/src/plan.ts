// Automatic payment (épico 09, req. 13): which sources to tap to cast a spell, like Arena's auto-pay.
//
// Greedy, then verified: colored needs are covered first by the least flexible sources that make that color
// (a Forest before a Command Tower before Birds), painless options before painful ones; the rest of the cost is
// filled with whatever is left, Signets last so the pool can pay their {1}. The plan is checked by simulating
// it, so it is never wrong — at worst it says there is no plan when a cleverer one existed.

import { findPayment, spellCost } from './cost'
import { colorChoices, isSummoningSick, MANA_TYPES, production, simulatePool } from './mana'
import type { GameObject, GameState, ManaAbility, ManaActivation, ManaAmount, ManaType, ObjectId, PlayerId } from './types'

interface Option {
  activation: ManaActivation
  mana: ManaAmount
  pain: number // life it costs
  extra: number // generic it takes from the pool first (Signets)
}

interface Source {
  id: ObjectId
  options: Option[]
  flex: number // how many mana types it can make: fewer = spend first
}

// Null = the spell cannot be paid with what is untapped now. [] = nothing to tap (already paid, or no data).
export function planPayment(state: GameState, player: PlayerId, objectId: ObjectId, x = 0): ManaActivation[] | null {
  const obj = state.objects[objectId]
  if (!obj) return null
  const cost = spellCost(obj, state.ruleset)
  if (cost.kind === 'none') return null
  if (cost.kind === 'manual') return []
  const fits = (plan: ManaActivation[]) => {
    const sim = simulatePool(state, player, plan)
    return !!sim && !sim.short && !!findPayment(sim.pool, cost.cost, x, cost.tax)
  }
  if (fits([])) return []

  const sources = availableSources(state, player)
  const chosen: Option[] = []
  const used = new Set<ObjectId>()
  const take = (source: Source, option: Option) => {
    chosen.push(option)
    used.add(source.id)
  }
  const ordered = () => [...chosen.filter((o) => !o.extra), ...chosen.filter((o) => o.extra)].map((o) => o.activation)
  const produced = (t: ManaType) => chosen.reduce((n, o) => n + (o.mana[t] ?? 0), 0)

  // 1. Colored (and {C}) symbols, least flexible sources first.
  const pool = state.players[player]!.manaPool
  for (const t of MANA_TYPES) {
    let missing = (cost.cost.colored[t] ?? 0) - pool[t] - produced(t)
    while (missing > 0) {
      const pick = sources
        .filter((s) => !used.has(s.id))
        .flatMap((s) => s.options.filter((o) => (o.mana[t] ?? 0) > 0).map((o) => ({ s, o })))
        .sort((a, b) => a.s.flex - b.s.flex || a.o.pain - b.o.pain || a.o.extra - b.o.extra)[0]
      if (!pick) return null
      take(pick.s, pick.o)
      missing -= pick.o.mana[t]!
    }
  }

  // 2. Hybrid / two-brid / Phyrexian colors and the generic part: keep adding until the payment fits.
  const wanted = new Set<ManaType>([...cost.cost.hybrid.flat(), ...cost.cost.twoBrid, ...cost.cost.phyrexian])
  while (!fits(ordered())) {
    const next = sources.filter((s) => !used.has(s.id)).sort((a, b) => a.flex - b.flex || bestOf(a, wanted).pain - bestOf(b, wanted).pain)[0]
    if (!next) return null
    take(next, bestOf(next, wanted))
  }
  return ordered()
}

// The option to use when filling: a wanted color if it has one, then no pain, then the most mana.
function bestOf(source: Source, wanted: Set<ManaType>): Option {
  const amount = (o: Option) => MANA_TYPES.reduce((n, t) => n + (o.mana[t] ?? 0), 0) - o.extra
  const wantedScore = (o: Option) => (MANA_TYPES.some((t) => wanted.has(t) && (o.mana[t] ?? 0) > 0) ? 1 : 0)
  return [...source.options].sort((a, b) => wantedScore(b) - wantedScore(a) || a.pain - b.pain || amount(b) - amount(a))[0]!
}

function availableSources(state: GameState, player: PlayerId): Source[] {
  const sources: Source[] = []
  for (const id of state.battlefield) {
    const obj = state.objects[id]!
    if (obj.controller !== player || obj.tapped || !obj.card.rules?.manaAbilities.length || isSummoningSick(state, obj)) continue
    const options = obj.card.rules.manaAbilities.flatMap((ability, i) => optionsOf(state, player, obj, ability, i))
    if (!options.length) continue
    const types = new Set(options.flatMap((o) => MANA_TYPES.filter((t) => (o.mana[t] ?? 0) > 0)))
    sources.push({ id, options, flex: types.size })
  }
  return sources
}

function optionsOf(state: GameState, player: PlayerId, obj: GameObject, ability: ManaAbility, abilityIndex: number): Option[] {
  const pain = (ability.lifeCost ?? 0) + (ability.selfDamage ?? 0)
  const extra = ability.extraCost?.generic ?? 0
  const choices = colorChoices(state, player, ability)
  const colors: (ManaType | undefined)[] = choices ? choices : [undefined]
  return colors.flatMap((color) => {
    const mana = production(state, player, ability, color)
    if (!MANA_TYPES.some((t) => (mana[t] ?? 0) > 0)) return []
    return [{ activation: { objectId: obj.id, abilityIndex, ...(color ? { color } : {}) }, mana, pain, extra }]
  })
}
