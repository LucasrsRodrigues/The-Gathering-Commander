// Activated abilities (épico 11, onda 2, CR 602): "{2}, {T}, Sacrifice this artifact: You gain 3 life."
//
// Order of CR 602.2: the ability goes on the stack, targets are chosen, then the costs are paid — all in one action
// here, so it happens entirely or not at all. The table chooses the targets and the cards a cost needs (which
// creature to sacrifice, which card to discard) and sends them with the action. Timing and missing mana are house-rule
// policies (policies.ts), so they can be bent like the others.

import { fail } from './errors'
import { checkTargets } from './effects/targets'
import { matchesFilter } from './effects/value'
import { findPayment, formatCost } from './cost'
import { levelOf } from './policies'
import type { Tx } from './tx'
import type { ActivateAbility, ActivatedAbility, GameObject, GameState, ManaActivation, ManaAmount, ObjectId, PlayerId, StackItem } from './types'
import { moveObject } from './zones'

const MAX_PAY_WITH = 60

export function activatedAbility(state: GameState, objectId: ObjectId, index: number): { obj: GameObject; ability: ActivatedAbility } | null {
  const obj = Object.hasOwn(state.objects, objectId) ? state.objects[objectId] : undefined
  const ability = Number.isInteger(index) ? obj?.card.rules?.activated?.[index] : undefined
  return obj && ability ? { obj, ability } : null
}

// The cards a "Sacrifice a creature" cost may take: permanents the player controls that fit the filter.
export function sacrificeChoices(state: GameState, player: PlayerId, obj: GameObject, ability: ActivatedAbility): ObjectId[] {
  const filter = ability.cost.sacrifice
  if (!filter || filter === 'self') return []
  return state.battlefield.filter((id) => {
    const o = state.objects[id]!
    return o.controller === player && matchesFilter(state, o, filter, { controller: player, sourceId: obj.id })
  })
}

// `activateMana` is the reducer's own mana activation (the same one castSpell's payWith uses).
export function activateAbility(tx: Tx, actor: PlayerId, action: ActivateAbility, activateMana: (tx: Tx, actor: PlayerId, a: ManaActivation) => void) {
  const s = tx.s
  const found = activatedAbility(s, action.objectId, action.index)
  if (!found) fail('invalidAction', 'Essa carta não tem essa habilidade.')
  const { obj, ability } = found
  if (obj.zone !== 'battlefield') fail('unknownObject', 'Essa carta não está no campo de batalha.')
  if (obj.controller !== actor) fail('notAllowed', 'Só quem controla a carta ativa as habilidades dela.') // CR 602.2
  const cost = ability.cost

  // Targets (CR 602.2b → 601.2c). Without them, the ability goes on the stack to be done by hand.
  const specs = ability.targets ?? []
  if (action.targets !== undefined) {
    if (!specs.length) fail('invalidAction', 'Essa habilidade não tem alvos.')
    const problem = checkTargets(s, specs, action.targets, { controller: actor, sourceId: obj.id })
    if (problem) fail('invalidTarget', problem)
  }

  // The choices a cost needs, checked before anything is paid.
  const sacrifice = choose(action.sacrifice, cost.sacrifice && cost.sacrifice !== 'self' ? 1 : 0, 'sacrificar')
  const allowed = new Set(sacrificeChoices(s, actor, obj, ability))
  for (const id of sacrifice) if (!allowed.has(id)) fail('invalidAction', 'Essa carta não serve para esse custo.')
  const discard = choose(action.discard, cost.discard ?? 0, 'descartar')
  for (const id of discard) if (!s.zones[actor]!.hand.includes(id)) fail('invalidAction', 'Só cartas da sua mão podem ser descartadas.')
  if (cost.tap && obj.tapped) fail('invalidAction', 'Essa carta já está virada.')
  if (cost.life && s.players[actor]!.life < cost.life) fail('invalidAction', `Você não tem ${cost.life} de vida para pagar.`) // CR 119.4

  // Mana sources first (CR 602.2b → 601.2g), never the source itself when the cost taps it.
  if (action.payWith !== undefined) {
    if (!Array.isArray(action.payWith) || action.payWith.length > MAX_PAY_WITH) fail('invalidAction', 'Pagamento malformado.')
    if (cost.tap && action.payWith.some((a) => a?.objectId === obj.id)) fail('invalidAction', 'A própria carta já vira para pagar esse custo.')
    for (const activation of action.payWith) activateMana(tx, actor, activation)
  }

  // Costs (CR 602.2h → 601.2h), in the printed order of the usual templates.
  let spent: ManaAmount | null = null
  if (cost.mana && levelOf(s.ruleset, 'mana') !== 'off') {
    const payment = findPayment(tx.s.players[actor]!.manaPool, cost.mana, 0, 0)
    if (payment) {
      tx.player(actor).manaPool = payment.pool
      spent = payment.spent
    }
  }
  if (cost.tap) {
    tx.object(obj.id).tapped = true
    tx.emit({ type: 'tapped', objectId: obj.id })
  }
  if (cost.life) {
    const p = tx.player(actor)
    const from = p.life
    p.life -= cost.life
    tx.emit({ type: 'lifeChanged', player: actor, from, to: p.life })
  }
  for (const id of discard) moveObject(tx, id, 'graveyard')
  for (const id of sacrifice) moveObject(tx, id, 'graveyard')
  if (cost.sacrifice === 'self') moveObject(tx, obj.id, 'graveyard')
  if (spent && cost.mana) tx.emit({ type: 'costPaid', player: actor, objectId: obj.id, cost: formatCost(cost.mana, 0, 0), mana: spent, life: 0 })

  const item: StackItem = {
    id: tx.newId('a'), kind: 'ability', controller: actor, sourceId: obj.id, description: ability.text,
    ability: { from: 'activated', index: action.index },
    ...(action.targets?.length ? { targets: action.targets } : {}),
    ...(specs.length && !action.targets ? { manual: true } : {}),
    ...(cost.sacrifice === 'self' ? { snapshot: ability } : {}),
  }
  tx.stack().push(item)
  tx.emit({ type: 'stackItemAdded', item })
}

function choose(ids: ObjectId[] | undefined, needed: number, what: string): ObjectId[] {
  const list = ids ?? []
  if (!Array.isArray(list) || list.some((id) => typeof id !== 'string') || new Set(list).size !== list.length) fail('invalidAction', 'Ação malformada.')
  if (list.length !== needed) fail('invalidAction', needed ? `Escolha ${needed} carta(s) para ${what}.` : `Essa habilidade não pede para ${what}.`)
  return list
}
