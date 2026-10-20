// Characteristics (épico 12, CR 109.3, 613): what an object is right now — types, colors, abilities, power and
// toughness, controller. Every rule of the engine reads them through here, never from the printed card (fitness).
//
// On the battlefield they come from the layer system (CR 613): the printed card, then every continuous effect in
// force, layer by layer (1 copy, 2 control, 3 text, 4 type, 5 color, 6 abilities, 7a–7d power/toughness). Inside a
// layer, characteristic-defining abilities first (613.3), then timestamp order (613.7) unless an effect depends on
// another (613.8), which then comes after it. Elsewhere (hand, stack, graveyard) only the printed card applies.

import { typesOf } from './cards'
import { evalValue, matchesFilter } from './effects/value'
import type {
  Affected, CardRef, CardType, Change, ContinuousEffect, GameObject, GameState, Keyword, Layer, ManaAbility, ManaColor, ManaCost,
  ObjectId, PlayerId, StaticAbility, Supertype, Value,
} from './types'
import type { ObjectView } from './view'

export interface Characteristics {
  types: CardType[]
  subtypes: string[]
  supertypes: Supertype[]
  colors: ManaColor[] // the card's color (CR 105.2), not its color identity
  keywords: Keyword[]
  power: number // printed (0 when unknown) after every layer; meaningful only for creatures
  toughness: number
  controller: PlayerId
  known: boolean // the card has structured rules (otherwise only its type line is known)
  statics: StaticAbility[] // the static abilities it has now
  manaAbilities: ManaAbility[]
  abilitiesLost?: boolean // CR 613.1f / 305.7: its rules-text abilities are gone (activated and triggered too)
  copyOf?: ObjectId // layer 1
}

const PLUS_ONE = '+1/+1'
const MINUS_ONE = '-1/-1'
const COLORS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G']
const BASIC: Record<string, ManaColor> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' }
export const LAYERS: readonly Layer[] = [1, 2, 3, 4, 5, 6, '7a', '7b', '7c', '7d']

// CR 202.2: an object's color comes from the colored symbols of its mana cost (tokens carry their own colors).
export function colorsOfCost(cost: ManaCost | null | undefined): ManaColor[] {
  if (!cost) return []
  const found = new Set<ManaColor>()
  for (const c of COLORS) if ((cost.colored[c] ?? 0) > 0) found.add(c)
  for (const pair of cost.hybrid) pair.forEach((c) => found.add(c))
  for (const c of [...cost.twoBrid, ...cost.phyrexian]) found.add(c)
  return COLORS.filter((c) => found.has(c))
}

// The printed characteristics of a card anywhere (hand, stack, a view of a revealed card…).
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
    statics: r?.statics ?? [],
    manaAbilities: r?.manaAbilities ?? [],
  }
}

export function layerOf(change: Change, cda = false): Layer {
  switch (change.kind) {
    case 'copy': return 1
    case 'control': return 2
    case 'text': return 3
    case 'addTypes': case 'setTypes': return 4
    case 'addColors': case 'setColors': return 5
    case 'addKeywords': case 'loseAllAbilities': return 6
    case 'setPT': return cda ? '7a' : '7b'
    case 'modifyPT': return '7c'
    case 'switchPT': return '7d'
  }
}

// ---- The board ------------------------------------------------------------------

// One continuous effect as the algorithm sees it: one layer's part of a static ability or of a resolved effect.
interface Part {
  key: string // the ability or effect (its parts in several layers share it: CR 613.6)
  sourceId: ObjectId | null
  ability?: StaticAbility // for statics: which ability of the source
  controller: PlayerId
  timestamp: number
  cda: boolean
  affects: Affected
  change: Change
}

type Board = Map<ObjectId, Characteristics>

const clone = (c: Characteristics): Characteristics => ({
  ...c, types: [...c.types], subtypes: [...c.subtypes], supertypes: [...c.supertypes], colors: [...c.colors],
  keywords: [...c.keywords], statics: [...c.statics], manaAbilities: [...c.manaAbilities],
})
const cloneBoard = (b: Board): Board => new Map([...b].map(([id, c]) => [id, clone(c)]))

// While a board is being computed, the values and filters inside effects ("for each Elf") read the board so far.
let computing: { state: GameState; board: Board } | null = null
function within<T>(state: GameState, board: Board, f: () => T): T {
  const previous = computing
  computing = { state, board }
  try {
    return f()
  } finally {
    computing = previous
  }
}

function inForce(state: GameState, e: ContinuousEffect): boolean {
  if (e.until.kind === 'whileSourceOnBattlefield') return !!e.source && state.objects[e.source]?.zone === 'battlefield'
  return true // 'endOfTurn' effects are removed in the cleanup step (CR 514.2)
}

// The parts of a layer: the statics of objects that have them now, or whose ability already started applying in an
// earlier layer (613.6), and the resolved effects in force.
function partsOf(state: GameState, board: Board, layer: Layer, started: Set<string>): Part[] {
  const parts: Part[] = []
  for (const id of state.battlefield) {
    const obj = state.objects[id]!
    const now = board.get(id)!
    const own = now.copyOf ? now.statics : (obj.card.rules?.statics ?? [])
    own.forEach((ability, index) => {
      const key = `s:${id}:${now.copyOf ?? ''}:${index}`
      if (!now.statics.includes(ability) && !started.has(key)) return // lost before it began (613.5)
      for (const change of ability.changes) {
        if (layerOf(change, ability.cda) !== layer) continue
        parts.push({ key, sourceId: id, ability, controller: now.controller, timestamp: obj.timestamp, cda: !!ability.cda, affects: ability.affects, change })
      }
    })
  }
  for (const e of state.effects ?? []) {
    if (layerOf(e.change) !== layer || !inForce(state, e)) continue
    parts.push({ key: `e:${e.id}`, sourceId: e.source, controller: e.controller, timestamp: e.timestamp, cda: false, affects: e.affects, change: e.change })
  }
  return parts
}

// Which objects a part applies to on this board. A set locked by a resolved spell keeps only the same objects: one
// that left and came back is a new object, with a later timestamp (CR 400.7).
function affectedBy(state: GameState, board: Board, part: Part): ObjectId[] {
  const source = part.sourceId ? state.objects[part.sourceId] : undefined
  switch (part.affects.kind) {
    case 'self': return source?.zone === 'battlefield' ? [source.id] : []
    case 'attached': {
      const host = source?.zone === 'battlefield' ? source.attachedTo : undefined
      return host && state.objects[host]?.zone === 'battlefield' ? [host] : []
    }
    case 'ids': return part.affects.ids.filter((id) => state.objects[id]?.zone === 'battlefield' && state.objects[id]!.timestamp <= part.timestamp)
    case 'objects': {
      const filter = part.affects.filter
      const ctx = { controller: part.controller, ...(part.sourceId ? { sourceId: part.sourceId } : {}) }
      return within(state, board, () => state.battlefield.filter((id) => matchesFilter(state, state.objects[id]!, filter, ctx)))
    }
  }
}

const value = (state: GameState, board: Board, part: Part, v: Value, affectedId?: ObjectId): number =>
  within(state, board, () => evalValue(state, { controller: part.controller, ...(part.sourceId ? { sourceId: part.sourceId } : {}), ...(affectedId ? { affectedId } : {}) }, v))

function apply(state: GameState, board: Board, part: Part, ids: readonly ObjectId[]) {
  const ch = part.change
  for (const id of ids) {
    const c = board.get(id)
    if (!c) continue
    const amounts = ch.kind === 'setPT' || ch.kind === 'modifyPT' ? { p: value(state, board, part, ch.power, id), t: value(state, board, part, ch.toughness, id) } : null
    switch (ch.kind) {
      case 'copy': {
        const of = state.objects[ch.of]
        if (of) Object.assign(c, { ...printed(of.card, c.controller), controller: c.controller, copyOf: ch.of }) // CR 707.2
        break
      }
      case 'control': c.controller = ch.to === 'sourceController' ? part.controller : ch.to; break
      case 'text': break
      case 'addTypes':
      case 'setTypes': {
        const added = ch.kind === 'addTypes' ? (ch.subtypes ?? []).filter((s) => !c.subtypes.includes(s)) : []
        if (ch.types) c.types = ch.kind === 'setTypes' ? [...ch.types] : [...new Set([...c.types, ...ch.types])]
        if (ch.subtypes) c.subtypes = ch.kind === 'setTypes' ? [...ch.subtypes] : [...new Set([...c.subtypes, ...ch.subtypes])]
        if (ch.landTypes && ch.kind === 'setTypes') {
          // CR 305.7: a land whose land types are set loses its rules-text abilities and gains the basic ones.
          c.statics = []
          c.keywords = []
          c.abilitiesLost = true
          c.manaAbilities = c.subtypes.flatMap(basicMana)
        } else if (ch.landTypes) {
          c.manaAbilities = [...c.manaAbilities, ...added.flatMap(basicMana)] // CR 305.6: "in addition to its other types"
        }
        break
      }
      case 'addColors': c.colors = COLORS.filter((x) => c.colors.includes(x) || ch.colors.includes(x)); break
      case 'setColors': c.colors = COLORS.filter((x) => ch.colors.includes(x)); break
      case 'addKeywords': c.keywords = [...new Set([...c.keywords, ...ch.keywords])]; break
      case 'loseAllAbilities':
        c.keywords = []
        c.statics = []
        c.manaAbilities = []
        c.abilitiesLost = true
        break
      case 'setPT': c.power = amounts!.p; c.toughness = amounts!.t; break
      case 'modifyPT': c.power += amounts!.p; c.toughness += amounts!.t; break
      case 'switchPT': [c.power, c.toughness] = [c.toughness, c.power]; break
    }
  }
}

const basicMana = (subtype: string): ManaAbility[] => {
  const color = BASIC[subtype.toLowerCase()]
  return color ? [{ produces: { kind: 'fixed', mana: { [color]: 1 } } }] : []
}

// What a part looks like on a board: whether it exists, what it applies to and what it would do (CR 613.8a).
function signature(state: GameState, board: Board, part: Part, locked: Map<string, ObjectId[]>): string {
  const exists = !part.ability || !!board.get(part.sourceId!)?.statics.includes(part.ability)
  const ids = locked.get(part.key) ?? affectedBy(state, board, part)
  const ch = part.change
  const does = ch.kind === 'setPT' || ch.kind === 'modifyPT' ? ids.map((id) => [value(state, board, part, ch.power, id), value(state, board, part, ch.toughness, id)]) : null
  return JSON.stringify([exists, ids, does])
}

// A depends on B (CR 613.8a): applying B first would change whether A exists, what it applies to or what it does.
// Characteristic-defining abilities depend on nothing.
// Changes that can alter what others exist as, apply to or count; the rest (P/T, keywords) only matter to an effect
// whose values read power or toughness. Checked first because the trial below is the expensive part.
const SHAPING = new Set<Change['kind']>(['copy', 'control', 'addTypes', 'setTypes', 'addColors', 'setColors', 'loseAllAbilities'])
const readsPT = (p: Part) => (p.change.kind === 'setPT' || p.change.kind === 'modifyPT') && [p.change.power, p.change.toughness].some((v) => v.kind === 'power' || v.kind === 'toughness')

function dependsOn(state: GameState, board: Board, a: Part, b: Part, locked: Map<string, ObjectId[]>): boolean {
  if (a.cda || a.key === b.key) return false
  if (!SHAPING.has(b.change.kind) && !readsPT(a)) return false
  const before = signature(state, board, a, locked)
  const trial = cloneBoard(board)
  apply(state, trial, b, locked.get(b.key) ?? affectedBy(state, trial, b))
  return signature(state, trial, a, locked) !== before
}

// CR 708.2: a face-down permanent is a 2/2 creature with no name, color, other types or abilities.
const faceDownChars = (obj: GameObject): Characteristics => ({
  types: ['creature'], subtypes: [], supertypes: [], colors: [], keywords: [], power: 2, toughness: 2,
  controller: obj.controller, known: true, statics: [], manaAbilities: [],
})

function computeBoard(state: GameState): Board {
  const board: Board = new Map()
  for (const id of state.battlefield) {
    const obj = state.objects[id]!
    board.set(id, obj.faceDown ? faceDownChars(obj) : printed(obj.card, obj.controller))
  }
  const started = new Set<string>()
  const locked = new Map<string, ObjectId[]>() // CR 613.6: the same objects in every later layer
  const byTime = (x: Part, y: Part) => x.timestamp - y.timestamp || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0)
  for (const layer of LAYERS) {
    if (layer === '7c') {
      // CR 613.4c: counters and the manual "until end of turn" adjustments modify power and toughness here.
      for (const id of state.battlefield) {
        const obj = state.objects[id]!
        const c = board.get(id)!
        const delta = (obj.counters[PLUS_ONE] ?? 0) - (obj.counters[MINUS_ONE] ?? 0)
        c.power += delta + obj.ptMods.reduce((n, m) => n + m.power, 0)
        c.toughness += delta + obj.ptMods.reduce((n, m) => n + m.toughness, 0)
      }
    }
    const parts = partsOf(state, board, layer, started)
    const run = (part: Part) => {
      const ids = locked.get(part.key) ?? affectedBy(state, board, part)
      if (!locked.has(part.key)) locked.set(part.key, ids)
      started.add(part.key)
      apply(state, board, part, ids)
    }
    parts.filter((p) => p.cda).sort(byTime).forEach(run)
    const rest = parts.filter((p) => !p.cda).sort(byTime)
    while (rest.length) {
      // The earliest effect that depends on no other still waiting; in a loop, simply the earliest (613.8b).
      const free = rest.find((a) => !rest.some((b) => b !== a && dependsOn(state, board, a, b, locked) && !dependsOn(state, board, b, a, locked)))
      const next = free ?? rest[0]!
      rest.splice(rest.indexOf(next), 1)
      // An effect whose ability is gone by now, before it ever applied, does not apply (613.8a: "existence").
      const gone = next.ability && !started.has(next.key) && !board.get(next.sourceId!)?.statics.includes(next.ability)
      if (!gone) run(next)
    }
  }
  return board
}

// ---- Cache --------------------------------------------------------------------
// States are immutable once reduce returns, but inside an action the Tx writes to the same state object, sometimes
// through references kept from earlier. So the cache keeps, next to the board, the facts it was computed from, and
// checks them (reference and number comparisons, much cheaper than the layers) before reusing it.

interface Cached { facts: unknown[]; board: Board }
const cache = new WeakMap<GameState, Cached>()

function factsOf(state: GameState): unknown[] {
  const facts: unknown[] = [state.battlefield.length, state.effects, state.effects?.length]
  for (const id of state.battlefield) {
    const o = state.objects[id]!
    facts.push(id, o.card, o.controller, o.timestamp, o.faceDown, o.attachedTo, o.counters[PLUS_ONE], o.counters[MINUS_ONE], o.ptMods, o.ptMods.length)
  }
  // Values may count cards in hands and graveyards.
  for (const p of state.seats) facts.push(state.zones[p]?.hand.length, state.zones[p]?.graveyard.length, state.players[p]?.lost)
  return facts
}

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

// Whether anything can change characteristics; when not, the printed card is the answer (the fast path).
function hasEffects(state: GameState): boolean {
  if (state.effects?.length) return true
  for (const id of state.battlefield) {
    const o = state.objects[id]!
    if (o.card.rules?.statics?.length || o.faceDown) return true
  }
  return false
}

export function boardOf(state: GameState): ReadonlyMap<ObjectId, Characteristics> {
  const facts = factsOf(state)
  const hit = cache.get(state)
  if (hit && same(hit.facts, facts)) return hit.board
  const board = computeBoard(state)
  cache.set(state, { facts, board })
  return board
}

// Off the battlefield (or with nothing in force): the printed card, counters and adjustments.
function plain(obj: GameObject): Characteristics {
  const c = printed(obj.card, obj.controller)
  const delta = (obj.counters[PLUS_ONE] ?? 0) - (obj.counters[MINUS_ONE] ?? 0)
  c.power += delta + obj.ptMods.reduce((n, m) => n + m.power, 0)
  c.toughness += delta + obj.ptMods.reduce((n, m) => n + m.toughness, 0)
  return c
}

// The characteristics of an object in the game, right now.
export function charsOf(state: GameState, obj: GameObject): Characteristics {
  if (computing && computing.state === state) {
    const partial = computing.board.get(obj.id)
    if (partial) return partial
  }
  if (obj.zone !== 'battlefield' || !hasEffects(state)) return plain(obj)
  return boardOf(state).get(obj.id) ?? plain(obj)
}

// What a player's view says an object is (the online table judges filters and targets with this).
export function fromView(o: ObjectView): Characteristics {
  const base = o.card ? printed(o.card, o.controller) : printed({ name: '' }, o.controller)
  return {
    ...base, types: o.types ?? base.types, subtypes: o.subtypes ?? base.subtypes, keywords: o.keywords ?? base.keywords, colors: o.colors ?? base.colors, controller: o.controller,
    power: o.power ?? 0, toughness: o.toughness ?? 0, ...(o.copyOf ? { copyOf: o.copyOf } : {}), ...(o.abilitiesLost ? { abilitiesLost: true } : {}),
  }
}

// Shorthands for the questions the rules ask most.
export const controllerOf = (state: GameState, obj: GameObject) => charsOf(state, obj).controller
export const isType = (state: GameState, obj: GameObject, type: CardType) => charsOf(state, obj).types.includes(type)
export const hasKeywordNow = (state: GameState, obj: GameObject, keyword: Keyword) => charsOf(state, obj).keywords.includes(keyword)
export const isLand = (state: GameState, obj: GameObject) => isType(state, obj, 'land')
// CR 307.1 / 702.8: instants and cards with Flash may be cast whenever their controller has priority.
export const hasInstantSpeed = (state: GameState, obj: GameObject) => isType(state, obj, 'instant') || hasKeywordNow(state, obj, 'flash')
