// Characteristics (épico 12, CR 109.3, 613): what an object is right now — types, colors, abilities, power and
// toughness, controller. Every rule of the engine reads them through here, never from the printed card (fitness),
// so the layer system (T12.2) changes them in one place.
//
// T12.1: no continuous effects yet. The characteristics are the printed card, with counters and the manual
// "until end of turn" adjustments on power and toughness, exactly as stats.ts computed them before.

import { typesOf } from './cards'
import type { CardRef, CardType, GameObject, GameState, Keyword, ManaColor, ManaCost, PlayerId, Supertype } from './types'

export interface Characteristics {
  types: CardType[]
  subtypes: string[]
  supertypes: Supertype[]
  colors: ManaColor[] // the card's color (CR 105.2), not its color identity
  keywords: Keyword[]
  power: number // printed (0 when unknown) + counters + adjustments; meaningful only for creatures
  toughness: number
  controller: PlayerId
  known: boolean // the card has structured rules (otherwise only its type line is known)
}

const PLUS_ONE = '+1/+1'
const MINUS_ONE = '-1/-1'
const COLORS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G']

// CR 202.2: an object's color comes from the colored symbols of its mana cost (tokens carry their own colors).
export function colorsOfCost(cost: ManaCost | null | undefined): ManaColor[] {
  if (!cost) return []
  const found = new Set<ManaColor>()
  for (const c of COLORS) if ((cost.colored[c] ?? 0) > 0) found.add(c)
  for (const pair of cost.hybrid) pair.forEach((c) => found.add(c))
  for (const c of [...cost.twoBrid, ...cost.phyrexian]) found.add(c)
  return COLORS.filter((c) => found.has(c))
}

// The printed characteristics of a card anywhere (hand, stack, a view of a hidden zone's revealed card…).
export function printed(card: CardRef, controller: PlayerId): Characteristics {
  const r = card.rules
  return {
    types: typesOf(card),
    subtypes: r?.subtypes ?? [],
    supertypes: r?.supertypes ?? [],
    colors: r?.colors ?? colorsOfCost(r?.cost),
    keywords: r?.keywords ?? [],
    power: r?.power ?? 0,
    toughness: r?.toughness ?? 0,
    controller,
    known: !!r,
  }
}

const counterDelta = (counters: Record<string, number>) => (counters[PLUS_ONE] ?? 0) - (counters[MINUS_ONE] ?? 0)

// The characteristics of an object in the game, right now.
export function charsOf(_state: GameState, obj: GameObject): Characteristics {
  const base = printed(obj.card, obj.controller)
  const delta = counterDelta(obj.counters)
  const mod = (key: 'power' | 'toughness') => obj.ptMods.reduce((n, m) => n + m[key], 0)
  return { ...base, power: base.power + delta + mod('power'), toughness: base.toughness + delta + mod('toughness') }
}

// Shorthands for the questions the rules ask most.
export const controllerOf = (state: GameState, obj: GameObject) => charsOf(state, obj).controller
export const isType = (state: GameState, obj: GameObject, type: CardType) => charsOf(state, obj).types.includes(type)
export const hasKeywordNow = (state: GameState, obj: GameObject, keyword: Keyword) => charsOf(state, obj).keywords.includes(keyword)
export const isLand = (state: GameState, obj: GameObject) => isType(state, obj, 'land')
// CR 307.1 / 702.8: instants and cards with Flash may be cast whenever their controller has priority.
export const hasInstantSpeed = (state: GameState, obj: GameObject) => isType(state, obj, 'instant') || hasKeywordNow(state, obj, 'flash')
