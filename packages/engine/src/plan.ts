// Automatic payment (épico 09, req. 13): which sources to tap to cast a spell, like Arena's auto-pay.
//
// Greedy, then verified: colored needs are covered first by the least flexible sources that make that color
// (a Forest before a Command Tower before Birds), painless options before painful ones; the rest of the cost is
// filled with whatever is left, Signets last so the pool can pay their {1}. The plan is checked by simulating
// it, so it is never wrong — at worst it says there is no plan when a cleverer one existed.
//
// It works from the full state (engine, bots) or from what a player sees (the table, online).

import { commanderTax } from './commander'
import { findPayment, MAX_FLEXIBLE } from './cost'
import { choicesFor, commanderIdentity, isSummoningSick, MANA_TYPES, payGeneric, poolTotal, productionFor } from './mana'
import { evalValue, evalValueInView } from './effects/value'
import type { CardRef, GameState, ManaAbility, ManaActivation, ManaAmount, ManaColor, ManaCost, ManaPool, ManaType, ObjectId, PlayerId, Value } from './types'
import type { PlayerView } from './view'

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

interface PlanInput {
  pool: ManaPool
  cost: ManaCost
  tax: number
  x: number
  sources: { id: ObjectId; abilities: ManaAbility[]; dynamic: number[] }[] // untapped, controlled, not summoning sick; dynamic: per ability (épico 11)
  identity: ManaColor[]
}

// Null = the spell cannot be paid with what is untapped now. [] = nothing to tap (already paid, or no data).
export function planPayment(state: GameState, player: PlayerId, objectId: ObjectId, x = 0): ManaActivation[] | null {
  const obj = state.objects[objectId]
  if (!obj) return null
  const sources = state.battlefield.flatMap((id) => {
    const o = state.objects[id]!
    return o.controller === player && !o.tapped && o.card.rules?.manaAbilities.length && !isSummoningSick(state, o)
      ? [{ id, abilities: o.card.rules.manaAbilities, dynamic: dynamicAmounts(o.card.rules.manaAbilities, (v) => evalValue(state, { controller: player, sourceId: id }, v)) }] : []
  })
  const tax = obj.zone === 'command' ? commanderTax(obj, state.ruleset) : 0
  return planFor(obj.card, tax, x, state.players[player]!.manaPool, sources, commanderIdentity(state, player))
}

// The same plan from a player's view of the game (the table has no full state online).
export function planPaymentFromView(view: PlayerView, player: PlayerId, objectId: ObjectId, x = 0): ManaActivation[] | null {
  const obj = view.objects[objectId]
  const pool = view.players[player]?.manaPool
  if (!obj?.card || !pool) return null
  const tax = obj.zone === 'command' ? obj.commanderTax : 0
  return planFor(obj.card, tax, x, pool, viewSources(view, player), viewIdentity(view, player))
}

// Épico 11, onda 2: the plan for an activated ability's mana cost. The source itself is never tapped for it when
// the cost already taps it ({2}, {T}: …).
export function planAbilityPaymentFromView(view: PlayerView, player: PlayerId, objectId: ObjectId, index: number): ManaActivation[] | null {
  const ability = view.objects[objectId]?.card?.rules?.activated?.[index]
  const pool = view.players[player]?.manaPool
  if (!ability || !pool) return null
  const cost = ability.cost.mana
  if (!cost) return []
  if (cost.unknown || cost.hybrid.length + cost.twoBrid.length + cost.phyrexian.length > MAX_FLEXIBLE) return []
  const sources = viewSources(view, player).filter((s) => !(ability.cost.tap && s.id === objectId))
  return plan({ pool, cost, tax: 0, x: 0, sources, identity: viewIdentity(view, player) })
}

function viewSources(view: PlayerView, player: PlayerId): PlanInput['sources'] {
  return view.battlefield.flatMap((id) => {
    const o = view.objects[id]
    return o && o.controller === player && !o.tapped && !o.summoningSick && o.card?.rules?.manaAbilities.length
      ? [{ id, abilities: o.card.rules.manaAbilities, dynamic: dynamicAmounts(o.card.rules.manaAbilities, (v) => evalValueInView(view, { controller: player, sourceId: id }, v)) }] : []
  })
}

function viewIdentity(view: PlayerView, player: PlayerId): ManaColor[] {
  const identity = new Set<ManaColor>()
  for (const o of Object.values(view.objects)) if (o.isCommander && o.owner === player) o.card?.rules?.colorIdentity.forEach((c) => identity.add(c))
  return (['W', 'U', 'B', 'R', 'G'] as const).filter((c) => identity.has(c))
}

// How much each 'dynamic' ability adds right now ("equal to ~'s power", "for each Elf"); 0 for the others.
function dynamicAmounts(abilities: ManaAbility[], value: (v: Value) => number): number[] {
  return abilities.map((a) => (a.produces.kind === 'dynamic' ? value(a.produces.amount) : 0))
}

function planFor(card: CardRef, tax: number, x: number, pool: ManaPool, sources: PlanInput['sources'], identity: ManaColor[]) {
  const cost = card.rules?.cost
  if (card.rules && !cost) return null // no mana cost: cannot be cast by paying one
  if (!cost || cost.unknown || cost.hybrid.length + cost.twoBrid.length + cost.phyrexian.length > MAX_FLEXIBLE) return [] // paid by hand
  return plan({ pool, cost, tax, x, sources, identity })
}

function plan(input: PlanInput): ManaActivation[] | null {
  const { pool, cost, tax, x } = input
  const sources = input.sources.map((s) => toSource(s, input.identity)).filter((s) => s.options.length)
  const fits = (options: Option[]) => {
    let left = { ...pool }
    for (const o of options) {
      const paid = payGeneric(left, o.extra)
      if (!paid) return false
      left = paid
      for (const t of MANA_TYPES) left[t] += o.mana[t] ?? 0
    }
    return !!findPayment(left, cost, x, tax)
  }
  const chosen: Option[] = []
  const used = new Set<ObjectId>()
  const ordered = () => [...chosen.filter((o) => !o.extra), ...chosen.filter((o) => o.extra)]
  if (fits([])) return []

  // 1. Colored (and {C}) symbols, least flexible sources first.
  for (const t of MANA_TYPES) {
    let missing = (cost.colored[t] ?? 0) - pool[t] - chosen.reduce((n, o) => n + (o.mana[t] ?? 0), 0)
    while (missing > 0) {
      const pick = sources
        .filter((s) => !used.has(s.id))
        .flatMap((s) => s.options.filter((o) => (o.mana[t] ?? 0) > 0).map((o) => ({ s, o })))
        .sort((a, b) => a.s.flex - b.s.flex || a.o.pain - b.o.pain || a.o.extra - b.o.extra)[0]
      if (!pick) return null
      chosen.push(pick.o)
      used.add(pick.s.id)
      missing -= pick.o.mana[t]!
    }
  }

  // 2. Hybrid / two-brid / Phyrexian colors and the generic part: keep adding until the payment fits.
  const wanted = new Set<ManaType>([...cost.hybrid.flat(), ...cost.twoBrid, ...cost.phyrexian])
  while (!fits(ordered())) {
    const next = sources.filter((s) => !used.has(s.id)).sort((a, b) => a.flex - b.flex || bestOf(a, wanted).pain - bestOf(b, wanted).pain)[0]
    if (!next) return null
    chosen.push(bestOf(next, wanted))
    used.add(next.id)
  }
  return ordered().map((o) => o.activation)
}

// The option to use when filling: a wanted color if it has one, then no pain, then the most mana.
function bestOf(source: Source, wanted: Set<ManaType>): Option {
  const net = (o: Option) => poolTotal(o.mana) - o.extra
  const wantedScore = (o: Option) => (MANA_TYPES.some((t) => wanted.has(t) && (o.mana[t] ?? 0) > 0) ? 1 : 0)
  return [...source.options].sort((a, b) => wantedScore(b) - wantedScore(a) || a.pain - b.pain || net(b) - net(a))[0]!
}

function toSource(source: PlanInput['sources'][number], identity: ManaColor[]): Source {
  const options = source.abilities.flatMap((ability, abilityIndex): Option[] => {
    if (ability.sacrificeSelf) return [] // a Treasure is spent only when the player chooses to (like Arena)
    const pain = (ability.lifeCost ?? 0) + (ability.selfDamage ?? 0)
    const extra = ability.extraCost?.generic ?? 0
    const colors: (ManaType | undefined)[] = choicesFor(ability, identity) ?? [undefined]
    return colors.flatMap((color) => {
      const mana = productionFor(ability, color, identity, source.dynamic[abilityIndex] ?? 0)
      return poolTotal(mana) ? [{ activation: { objectId: source.id, abilityIndex, ...(color ? { color } : {}) }, mana, pain, extra }] : []
    })
  })
  const types = new Set(options.flatMap((o) => MANA_TYPES.filter((t) => (o.mana[t] ?? 0) > 0)))
  return { id: source.id, options, flex: types.size }
}
