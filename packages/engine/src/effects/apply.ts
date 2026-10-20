// The effect interpreter (épico 11, req. 5, 10): applies an automated ability's effects, in order, when its stack
// item resolves. Everything goes through the same zone and life helpers as manual play, so state-based actions,
// the log and replays treat automated and manual play alike.

import { hasKeyword } from '../cards'
import { addMana } from '../mana'
import { dealDamageTo, isCreature, isPlaneswalker, PLUS_ONE } from '../stats'
import type { Tx } from '../tx'
import type {
  Ability, CardRef, CardRules, Effect, Filter, GameObject, ManaColor, ObjectId, PlayerId, StackItem, TokenDef, Who,
} from '../types'
import { drawCards, moveObject } from '../zones'
import { evalValue, matchesFilter, type ValueContext } from './value'

const MAX_TOKENS = 50 // per effect: "create X tokens" with a huge X stays bounded (state size, T7.8 limits)
const MAX_COUNT = 100

export function applyAbility(tx: Tx, item: StackItem, ability: Ability) {
  const ctx: ValueContext = {
    controller: item.controller,
    ...((item.sourceId ?? item.objectId) ? { sourceId: (item.sourceId ?? item.objectId)! } : {}),
    ...(item.targets ? { targets: item.targets } : {}),
    ...(item.x !== undefined ? { x: item.x } : {}),
  }
  tx.emit({ type: 'abilityResolving', item, text: ability.text })
  for (const effect of ability.effects) applyEffect(tx, effect, ctx)
}

const n = (tx: Tx, ctx: ValueContext, v: Parameters<typeof evalValue>[2], max = MAX_COUNT) => Math.min(max, Math.max(0, evalValue(tx.s, ctx, v)))
const living = (tx: Tx) => tx.s.seats.filter((p) => !tx.s.players[p]?.lost)
const objectTargets = (tx: Tx, ctx: ValueContext): GameObject[] =>
  (ctx.targets ?? []).flatMap((t) => ('object' in t && tx.s.objects[t.object] ? [tx.s.objects[t.object]!] : []))
const playerTargets = (ctx: ValueContext): PlayerId[] => (ctx.targets ?? []).flatMap((t) => ('player' in t ? [t.player] : []))

function players(tx: Tx, ctx: ValueContext, who: Who): PlayerId[] {
  switch (who) {
    case 'you': return [ctx.controller]
    case 'each player': return living(tx)
    case 'each opponent': return living(tx).filter((p) => p !== ctx.controller)
    case 'target': {
      const p = playerTargets(ctx)[0] ?? objectTargets(tx, ctx)[0]?.controller
      return p && !tx.s.players[p]?.lost ? [p] : []
    }
  }
}

function changeLife(tx: Tx, player: PlayerId, delta: number) {
  if (!delta) return
  const p = tx.player(player)
  const from = p.life
  p.life += delta
  tx.emit({ type: 'lifeChanged', player, from, to: p.life })
}

// Non-combat damage (CR 120.3): players lose life, creatures get it marked, planeswalkers lose loyalty. Lifelink and
// deathtouch come from the source; commander damage counts only in combat (CR 903.10a), so not here.
function damage(tx: Tx, ctx: ValueContext, amount: number, players: PlayerId[], objects: GameObject[]) {
  if (amount <= 0) return
  const source = ctx.sourceId ? tx.s.objects[ctx.sourceId] : undefined
  const deathtouch = !!source && hasKeyword(source.card, 'deathtouch')
  let dealt = 0
  for (const p of players) {
    changeLife(tx, p, -amount)
    dealt += amount
  }
  for (const obj of objects) {
    if (obj.zone !== 'battlefield' || !(isCreature(obj) || isPlaneswalker(obj))) continue
    dealDamageTo(tx, obj, amount, deathtouch)
    dealt += amount
  }
  if (source && hasKeyword(source.card, 'lifelink')) changeLife(tx, ctx.controller, dealt)
}

// The objects an effect is about: its targets, the source, or every object a filter matches on the battlefield.
function subjects(tx: Tx, ctx: ValueContext, what: 'target' | 'self' | { each: Filter } | { all: Filter }): GameObject[] {
  if (what === 'target') return objectTargets(tx, ctx)
  if (what === 'self') return ctx.sourceId && tx.s.objects[ctx.sourceId]?.zone === 'battlefield' ? [tx.s.objects[ctx.sourceId]!] : []
  const filter = 'each' in what ? what.each : what.all
  return tx.s.battlefield.flatMap((id) => {
    const obj = tx.s.objects[id]
    return obj && matchesFilter(tx.s, obj, filter, ctx) ? [obj] : []
  })
}

function tokenCard(def: TokenDef): CardRef {
  const typeLine = `Token ${def.types.map((t) => t[0]!.toUpperCase() + t.slice(1)).join(' ')}${def.subtypes.length ? ` — ${def.subtypes.join(' ')}` : ''}`
  const rules: CardRules = {
    types: def.types, supertypes: [], subtypes: def.subtypes, cost: null, power: def.power, toughness: def.toughness, loyalty: null,
    keywords: def.keywords, manaAbilities: def.manaAbilities, colorIdentity: def.colors as ManaColor[], coverage: 'automated',
  }
  return { name: def.name, typeLine, rules }
}

function createTokens(tx: Tx, controller: PlayerId, def: TokenDef, count: number, tapped: boolean) {
  for (let i = 0; i < count; i++) {
    const id: ObjectId = tx.newId('t')
    tx.addObject({
      id, owner: controller, controller, card: tokenCard(def), zone: 'battlefield',
      tapped, faceDown: false, counters: {}, isToken: true, isCommander: false,
      commanderCasts: 0, timestamp: tx.tick(), damage: 0, deathtouchDamage: false, controlledSince: tx.s.turn.number, ptMods: [],
    })
    tx.battlefield().push(id)
    tx.emit({ type: 'tokenCreated', objectId: id })
    tx.emit({ type: 'zoneChanged', objectId: id, owner: controller, from: null, to: 'battlefield' })
  }
}

function addCounters(tx: Tx, obj: GameObject, counter: string, amount: number) {
  if (amount <= 0 || obj.zone !== 'battlefield') return
  const key = counter === '+1/+1' ? PLUS_ONE : counter
  const value = Math.min(9999, (obj.counters[key] ?? 0) + amount)
  tx.object(obj.id).counters = { ...obj.counters, [key]: value }
  tx.emit({ type: 'counterChanged', objectId: obj.id, counter: key, value })
}

export function applyEffect(tx: Tx, effect: Effect, ctx: ValueContext) {
  switch (effect.kind) {
    case 'draw':
      for (const p of players(tx, ctx, effect.who)) drawCards(tx, p, n(tx, ctx, effect.amount))
      return
    case 'gainLife':
    case 'loseLife': {
      const amount = n(tx, ctx, effect.amount, 9999)
      for (const p of players(tx, ctx, effect.who)) changeLife(tx, p, effect.kind === 'gainLife' ? amount : -amount)
      return
    }
    case 'damage': {
      const amount = n(tx, ctx, effect.amount, 9999)
      if (effect.to === 'target') return damage(tx, ctx, amount, playerTargets(ctx), objectTargets(tx, ctx))
      if (effect.to === 'each opponent') return damage(tx, ctx, amount, players(tx, ctx, 'each opponent'), [])
      return damage(tx, ctx, amount, [], subjects(tx, ctx, { each: { types: ['creature'] } }))
    }
    case 'destroy':
    case 'exile':
    case 'bounce': {
      const to = effect.kind === 'destroy' ? 'graveyard' : effect.kind === 'exile' ? 'exile' : 'hand'
      for (const obj of subjects(tx, ctx, effect.what)) {
        if (obj.zone !== 'battlefield') continue
        if (effect.kind === 'destroy' && hasKeyword(obj.card, 'indestructible')) continue // CR 702.12b
        moveObject(tx, obj.id, to)
      }
      return
    }
    case 'counters': {
      const amount = n(tx, ctx, effect.amount)
      for (const obj of subjects(tx, ctx, effect.what)) addCounters(tx, obj, effect.counter, amount)
      return
    }
    case 'pump': {
      const power = Math.max(-999, Math.min(999, evalValue(tx.s, ctx, effect.power)))
      const toughness = Math.max(-999, Math.min(999, evalValue(tx.s, ctx, effect.toughness)))
      if (!power && !toughness) return
      for (const obj of subjects(tx, ctx, effect.what)) {
        if (obj.zone !== 'battlefield' || !isCreature(obj)) continue
        tx.object(obj.id).ptMods = [...obj.ptMods, { power, toughness }]
        tx.emit({ type: 'ptAdjusted', objectId: obj.id, power, toughness })
      }
      return
    }
    case 'token':
      return createTokens(tx, ctx.controller, effect.token, n(tx, ctx, effect.amount, MAX_TOKENS), !!effect.tapped)
    case 'mill':
      for (const p of players(tx, ctx, effect.who)) {
        for (let i = n(tx, ctx, effect.amount); i > 0; i--) {
          const top = tx.s.zones[p]!.library.at(-1)
          if (top === undefined) break
          moveObject(tx, top, 'graveyard')
        }
      }
      return
    case 'addMana':
      if (effect.produces.kind === 'fixed') addMana(tx, ctx.controller, effect.produces.mana, ctx.sourceId ?? null)
      return
    case 'discard':
    case 'search':
    case 'scry':
    case 'surveil':
      // Choices the player makes (wave 2): the reader does not produce these yet; an exception that does leaves a note.
      tx.emit({ type: 'manualStep', text: `${effect.kind}: faça à mão` })
      return
  }
}

