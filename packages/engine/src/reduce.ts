// The single entry point that changes a game: reduce(state, action) → new state + events, or an error.
// Pipeline: validate → apply → state-based actions (CR 704.3). The input state is never mutated.

import { RuleViolation, fail } from './errors'
import { bottomCards, keepHand, takeMulligan } from './mulligan'
import { isLand } from './layers'
import { declareAttackers, declareBlockers } from './combat'
import { applyCombatDamage, checkAssignmentShape } from './damage'
import { findPayment, formatCost, spellCost } from './cost'
import { dealDamageTo } from './stats'
import { addMana, MANA_TYPES, MAX_DECLARED_MANA, payGeneric, poolTotal, production } from './mana'
import { answerException, cancelException, pendingException, requestException } from './exceptions'
import { checkPolicies, levelOf } from './policies'
import { autoPass } from './stops'
import { checkStateBasedActions, eliminate } from './stateBased'
import { advanceStep, finishCleanup, givePriority, passPriority } from './turn'
import { Tx } from './tx'
import { STEPS, type Action, type CardRef, type GameObject, type GameState, type ManaActivation, type PlayerId, type ReduceResult, type Step, type ZoneKind } from './types'
import { drawCards, moveObject, shuffleLibrary } from './zones'
import { checkTargets } from './effects/targets'
import { pushTrigger, stackTriggers } from './triggers'
import { activateAbility } from './activate'
import { answerArrange, answerSearch } from './libraryChoice'

const ZONES: readonly ZoneKind[] = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'stack', 'command']
const MULLIGAN_ACTIONS = new Set<Action['type']>(['keepHand', 'mulligan', 'bottomCards'])
// Actions that do not take priority: bookkeeping or leaving the game.
// Mana abilities (CR 605.3a) are activated while paying costs, without holding priority.
const NO_PRIORITY_ACTIONS = new Set<Action['type']>([
  'setArrangement', 'concede', 'passPriority', 'advanceStep', 'activateMana', 'declareMana', 'declareAttackers', 'declareBlockers',
  'setStops', 'passUntil', 'chooseTargets', 'searchLibrary', 'arrangeTop',
])
// While combat waits for a declaration, only that (and leaving or making mana) can happen.
const DURING_DECLARATION = new Set<Action['type']>([
  'declareAttackers', 'declareBlockers', 'assignDamage', 'discard', 'concede', 'activateMana', 'declareMana', 'setArrangement', 'setStops', 'passUntil',
  'chooseTargets', 'searchLibrary', 'arrangeTop',
])
const MAX_BATCH = 100
const MAX_TEXT = 200
const MAX_COUNTER_NAME = 40
// Life, poison, damage and counter changes per action. Generous for any real game, but keeps
// numbers far from Number.MAX_SAFE_INTEGER no matter what a client sends.
const MAX_DELTA = 10_000
// Free arrangement on the table, in table units (the table is a few units wide).
const MAX_COORD = 1_000
const ACTION_TYPES = new Set<Action['type']>([
  'keepHand', 'mulligan', 'bottomCards', 'passPriority', 'advanceStep', 'moveObject', 'draw', 'mill',
  'shuffleLibrary', 'tap', 'untap', 'setFaceDown', 'addCounter', 'createToken', 'setArrangement',
  'adjustLife', 'adjustPoison', 'commanderDamage', 'putAbilityOnStack', 'concede', 'playLand', 'castSpell',
  'requestException', 'answerException', 'cancelException', 'activateMana', 'declareMana', 'adjustPT', 'dealDamage',
  'declareAttackers', 'declareBlockers', 'assignDamage', 'discard', 'setStops', 'passUntil', 'chooseTargets', 'resolveManually',
  'activateAbility', 'searchLibrary', 'arrangeTop',
])
const MAX_PT_DELTA = 100
const WAITING: Record<string, string> = {
  declareAttackers: 'Declare os atacantes primeiro.',
  declareBlockers: 'Esperando os bloqueios.',
  confirmDamage: 'Confirme o dano de combate primeiro.',
  discard: 'Descarte até o tamanho máximo da mão primeiro.',
  chooseTargets: 'Esperando a escolha dos alvos de uma habilidade.',
  searchLibrary: 'Esperando a busca no grimório.',
  scry: 'Esperando a vidência.',
  surveil: 'Esperando a escolha do vigiar.',
}
const MAX_X = 100
const MAX_PAY_WITH = 60

export function reduce(state: GameState, action: Action): ReduceResult {
  return run(state, action, false)
}

// `skipPolicies` is only for rule exceptions that were approved (exceptions.ts).
function run(state: GameState, action: Action, skipPolicies: boolean): ReduceResult {
  try {
    // Actions may come from a UI, a bot or (later) the network: their shape is checked at runtime,
    // not just trusted from the TypeScript types.
    checkShape(action)
    if (action.type === 'requestException') return requestException(state, action, run)
    if (action.type === 'answerException') return answerException(state, action, run)
    if (action.type === 'cancelException') return cancelException(state, action)
    const tx = new Tx(state)
    apply(tx, action, skipPolicies)
    checkStateBasedActions(tx)
    autoPass(tx) // épico 09: stops (resolving on the way can need state-based actions again)
    checkStateBasedActions(tx)
    return { ok: true, state: tx.s, events: tx.events }
  } catch (err) {
    if (err instanceof RuleViolation) return { ok: false, error: err.toGameError() }
    throw err
  }
}

function apply(tx: Tx, action: Action, skipPolicies: boolean) {
  const s = tx.s
  const actor = action.player
  if (s.status === 'ended') fail('gameOver', 'A partida já terminou.')
  const player = own(s.players, actor)
  if (!player) fail('unknownPlayer', 'Jogador desconhecido.')
  if (player.lost) fail('playerLost', 'Esse jogador já saiu da partida.')

  if (action.type === 'concede') {
    const request = pendingException(s)
    if (request?.player === actor) s.pending = request.resume ?? null // the request leaves with whoever asked
    eliminate(tx, actor, 'conceded')
    return
  }
  if (pendingException(s)) fail('pendingException', 'Há um pedido de exceção esperando resposta.')
  const waiting = s.pending && s.pending.kind !== 'mulligan' && s.pending.kind !== 'bottomCards' ? WAITING[s.pending.kind] : null
  if (waiting && !DURING_DECLARATION.has(action.type)) fail('notYourDecision', waiting)

  if (s.status === 'mulligan') {
    if (!MULLIGAN_ACTIONS.has(action.type)) fail('wrongPhase', 'Termine os mulligans antes de jogar.')
    applyMulligan(tx, action)
    return
  }
  if (MULLIGAN_ACTIONS.has(action.type)) fail('wrongPhase', 'A fase de mulligan já terminou.')

  if (s.ruleset.priorityMode === 'strict' && !NO_PRIORITY_ACTIONS.has(action.type) && s.priority?.player !== actor) {
    fail('strictPriority', 'Você precisa ter prioridade para agir.')
  }

  // House-rule policies (épico 09): 'block' rejects the action, 'warn' lets it through and logs it.
  const findings = skipPolicies ? [] : checkPolicies(s, action)
  const blocking = findings.filter((f) => levelOf(s.ruleset, f.area) === 'block')
  if (blocking.length) throw new RuleViolation('ruleBlocked', blocking.map((f) => f.message).join(' '), blocking)

  applyGameAction(tx, action)
  for (const f of findings) tx.emit({ type: 'ruleBent', player: actor, area: f.area, code: f.code, message: f.message })

  if (!NO_PRIORITY_ACTIONS.has(action.type) && tx.s.status === 'playing' && !tx.s.players[actor]!.lost) {
    // CR 117.3c: after acting, the player receives priority again.
    givePriority(tx, actor)
  }
}

function applyMulligan(tx: Tx, action: Action) {
  const pending = tx.s.pending
  if (!pending || pending.player !== action.player) fail('notYourDecision', 'Não é a sua vez de decidir.')
  switch (action.type) {
    case 'keepHand':
      if (pending.kind !== 'mulligan') fail('notYourDecision', 'Escolha as cartas para o fundo do grimório.')
      keepHand(tx, action.player)
      return
    case 'mulligan':
      if (pending.kind !== 'mulligan') fail('notYourDecision', 'Escolha as cartas para o fundo do grimório.')
      takeMulligan(tx, action.player)
      return
    case 'bottomCards': {
      if (pending.kind !== 'bottomCards') fail('notYourDecision', 'Não há cartas para colocar no fundo agora.')
      const ids = action.objectIds
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) fail('invalidAction', 'Ação malformada.')
      const hand = tx.s.zones[action.player]!.hand
      if (ids.length !== pending.count || new Set(ids).size !== ids.length || !ids.every((id) => hand.includes(id))) {
        fail('invalidSelection', `Escolha exatamente ${pending.count} carta(s) da sua mão.`)
      }
      bottomCards(tx, action.player, ids)
      return
    }
    default:
      return
  }
}

function applyGameAction(tx: Tx, action: Action) {
  const s = tx.s
  const actor = action.player
  switch (action.type) {
    case 'passPriority':
      if (s.priority?.player !== actor) fail('notYourPriority', 'Você não tem prioridade agora.')
      passPriority(tx, actor)
      return

    case 'advanceStep':
      if (s.ruleset.priorityMode !== 'relaxed') fail('strictPriority', 'No modo estrito, todos precisam passar a prioridade.')
      if (s.turn.active !== actor) fail('notActivePlayer', 'Só o jogador ativo pode avançar a etapa.')
      if (s.stack.length) fail('stackNotEmpty', 'Resolva a pilha antes de avançar.')
      advanceStep(tx)
      return

    case 'moveObject': {
      if (!ZONES.includes(action.to)) fail('invalidZone', 'Zona inválida.')
      if (action.position !== undefined && action.position !== 'top' && action.position !== 'bottom') {
        fail('invalidAction', 'Posição inválida.')
      }
      optionalBoolean(action.faceDown)
      const obj = touchable(tx, actor, action.objectId)
      moveObject(tx, obj.id, action.to, { position: action.position, faceDown: action.faceDown, controller: actor })
      return
    }

    case 'draw':
      drawCards(tx, actor, count(action.count))
      return

    // Épico 09: the regular ways to play cards. Timing is checked by the policies (timing area) before this.
    case 'playLand': {
      const obj = ownCard(tx, actor, action.objectId, ['hand'])
      if (!isLand(s, obj)) fail('invalidAction', 'Isso não é um terreno: use "Lançar".')
      moveObject(tx, obj.id, 'battlefield', { controller: actor })
      tx.player(actor).landsPlayed += 1
      if (obj.card.rules?.entersTapped) {
        tx.object(obj.id).tapped = true
        tx.emit({ type: 'tapped', objectId: obj.id })
      }
      return
    }

    // CR 605: tap a source and add its mana. Costs and summoning sickness are policies (mana area).
    case 'activateMana':
      activateManaAbility(tx, actor, action)
      return

    case 'declareMana': {
      const obj = controlledSource(tx, actor, action.objectId)
      if (obj.card.rules && !obj.card.rules.hasUnrecognizedMana) fail('invalidAction', 'Use a habilidade de mana da carta.')
      const mana = action.mana
      if (!mana || typeof mana !== 'object' || Object.keys(mana).some((k) => !MANA_TYPES.includes(k as never))) fail('invalidAction', 'Mana inválida.')
      for (const t of MANA_TYPES) {
        const n = mana[t]
        if (n !== undefined && (!Number.isInteger(n) || n < 0)) fail('invalidAmount', 'Quantidade de mana inválida.')
      }
      const total = poolTotal(mana)
      if (total < 1 || total > MAX_DECLARED_MANA) fail('invalidAmount', `Declare de 1 a ${MAX_DECLARED_MANA} manas.`)
      tap(tx, obj.id)
      tx.emit({ type: 'manaDeclared', player: actor, objectId: obj.id })
      addMana(tx, actor, mana, obj.id)
      return
    }

    case 'castSpell': {
      const obj = ownCard(tx, actor, action.objectId, ['hand', 'command'])
      // Épico 11, CR 601.2c: targets are chosen before costs are paid. A spell with target specs cast without targets
      // (a table that does not ask yet) resolves by hand, as before.
      const specs = obj.card.rules?.spell?.targets ?? []
      if (action.targets !== undefined) {
        if (!specs.length) fail('invalidAction', 'Essa mágica não tem alvos.')
        const problem = checkTargets(s, specs, action.targets, { controller: actor, sourceId: obj.id })
        if (problem) fail('invalidTarget', problem)
      }
      if (action.payWith !== undefined) {
        // CR 601.2g: mana abilities are activated while casting; all of it happens or none does.
        if (!Array.isArray(action.payWith) || action.payWith.length > MAX_PAY_WITH) fail('invalidAction', 'Pagamento malformado.')
        for (const activation of action.payWith) activateManaAbility(tx, actor, activation)
      }
      if (isLand(s, obj)) fail('invalidAction', 'Terrenos não são lançados: use "Jogar terreno".')
      if (action.x !== undefined && (!Number.isInteger(action.x) || action.x < 0 || action.x > MAX_X)) {
        fail('invalidAmount', `X precisa ser um número inteiro entre 0 e ${MAX_X}.`)
      }
      if (levelOf(s.ruleset, 'mana') !== 'off') payForSpell(tx, actor, obj, action.x ?? 0) // before the move: tax counts casts
      moveObject(tx, obj.id, 'stack', { controller: actor })
      const stack = tx.stack()
      const spell = obj.card.rules?.spell
      stack[stack.length - 1] = {
        ...stack[stack.length - 1]!,
        ...(action.x !== undefined ? { x: action.x } : {}),
        ...(spell ? { ability: { from: 'spell' as const, index: 0 } } : {}),
        ...(action.targets?.length ? { targets: action.targets } : {}),
        ...(spell && specs.length && !action.targets ? { manual: true } : {}),
      }
      return
    }

    case 'mill': {
      const n = count(action.count)
      for (let i = 0; i < n; i++) {
        const top = s.zones[actor]!.library.at(-1)
        if (top === undefined) break
        moveObject(tx, top, 'graveyard')
      }
      return
    }

    case 'shuffleLibrary':
      shuffleLibrary(tx, actor)
      return

    case 'tap':
    case 'untap': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield'])
      const tapped = action.type === 'tap'
      if (obj.tapped === tapped) return
      tx.object(obj.id).tapped = tapped
      tx.emit({ type: tapped ? 'tapped' : 'untapped', objectId: obj.id })
      return
    }

    case 'setFaceDown': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield', 'exile'])
      if (typeof action.faceDown !== 'boolean') fail('invalidAction', 'Ação malformada.')
      tx.object(obj.id).faceDown = action.faceDown
      tx.emit({ type: 'faceChanged', objectId: obj.id, faceDown: action.faceDown })
      return
    }

    case 'addCounter': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield', 'exile'])
      const counter = text(action.counter, MAX_COUNTER_NAME)
      // The name becomes an object key: refuse names that would reach Object.prototype.
      if (RESERVED_KEYS.has(counter)) fail('invalidAmount', 'Nome de marcador inválido.')
      const delta = amount(action.delta)
      const value = Math.min(MAX_DELTA, Math.max(0, (own(obj.counters, counter) ?? 0) + delta))
      const writable = tx.object(obj.id)
      if (value === 0) delete writable.counters[counter]
      else writable.counters[counter] = value
      tx.emit({ type: 'counterChanged', objectId: obj.id, counter, value })
      return
    }

    // Épico 09: manual effects for unscripted cards. Free, and in the log.
    case 'adjustPT': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield'])
      for (const n of [action.power, action.toughness]) {
        if (!Number.isInteger(n) || Math.abs(n) > MAX_PT_DELTA) fail('invalidAmount', `Ajuste de P/T entre −${MAX_PT_DELTA} e +${MAX_PT_DELTA}.`)
      }
      if (!action.power && !action.toughness) fail('invalidAmount', 'O ajuste não muda nada.')
      tx.object(obj.id).ptMods = [...obj.ptMods, { power: action.power, toughness: action.toughness }]
      tx.emit({ type: 'ptAdjusted', objectId: obj.id, power: action.power, toughness: action.toughness })
      return
    }

    case 'dealDamage': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield'])
      const n = action.amount
      if (!Number.isInteger(n) || n < 1 || n > MAX_DELTA) fail('invalidAmount', 'Quantidade de dano inválida.')
      optionalBoolean(action.deathtouch)
      dealDamageTo(tx, obj, n, !!action.deathtouch)
      return
    }

    case 'declareAttackers':
      declareAttackers(tx, actor, action.attacks)
      return

    case 'declareBlockers':
      declareBlockers(tx, actor, action.blocks)
      return

    // Épico 09: the player's own stop preferences; automatic passing runs after every action.
    case 'setStops': {
      const st = action.stops
      const steps = (v: unknown) => Array.isArray(v) && v.length <= STEPS.length && v.every((x) => STEPS.includes(x)) ? [...new Set(v as Step[])] : fail('invalidAction', 'Paradas inválidas.')
      if (!st || typeof st !== 'object') fail('invalidAction', 'Paradas inválidas.')
      optionalBoolean(st.passAfterOwnSpell)
      tx.player(actor).stops = { own: steps(st.own), others: steps(st.others), passAfterOwnSpell: !!st.passAfterOwnSpell }
      return
    }

    case 'passUntil': {
      if (action.until !== null && action.until !== 'endOfTurn' && action.until !== 'myTurn') fail('invalidAction', 'Opção inválida.')
      tx.player(actor).passUntil = action.until
      return
    }

    // CR 514.1: discard down to the maximum hand size, then cleanup goes on.
    case 'discard': {
      if (s.pending?.kind !== 'discard' || s.pending.player !== actor) fail('notYourDecision', 'Não há descarte pendente para você.')
      const ids = action.objectIds
      const hand = s.zones[actor]!.hand
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || !ids.every((id) => typeof id === 'string' && hand.includes(id)) || ids.length > s.pending.count) {
        fail('invalidSelection', `Escolha ${s.pending.count} carta(s) da sua mão.`)
      }
      s.pending = null
      for (const id of ids) moveObject(tx, id, 'graveyard')
      finishCleanup(tx)
      return
    }

    case 'assignDamage':
      if (s.pending?.kind !== 'confirmDamage' || s.pending.player !== actor) fail('notYourDecision', 'Quem confirma o dano é o jogador ativo.')
      checkAssignmentShape(s, action.assignments)
      applyCombatDamage(tx, action.assignments)
      return

    case 'createToken': {
      const card = tokenCard(action.card)
      optionalBoolean(action.tapped)
      const id = tx.newId('t')
      tx.addObject({
        id, owner: actor, controller: actor, card, zone: 'battlefield',
        tapped: !!action.tapped, faceDown: false, counters: {}, isToken: true, isCommander: false,
        commanderCasts: 0, timestamp: tx.tick(), damage: 0, deathtouchDamage: false, controlledSince: tx.s.turn.number, ptMods: [],
      })
      tx.battlefield().push(id)
      tx.emit({ type: 'tokenCreated', objectId: id })
      tx.emit({ type: 'zoneChanged', objectId: id, owner: actor, from: null, to: 'battlefield' })
      return
    }

    case 'setArrangement': {
      const obj = touchable(tx, actor, action.objectId, ['battlefield'])
      const a = action.arrangement
      if (a != null && (typeof a !== 'object' || !coord(a.x) || !coord(a.z))) fail('invalidAmount', 'Posição inválida.')
      const writable = tx.object(obj.id)
      if (a) writable.arrangement = { x: a.x, z: a.z }
      else delete writable.arrangement
      tx.emit({ type: 'arranged', objectId: obj.id })
      return
    }

    case 'adjustLife': {
      const target = livingPlayer(tx, action.target)
      const delta = amount(action.delta)
      const p = tx.player(target)
      const from = p.life
      p.life += delta
      tx.emit({ type: 'lifeChanged', player: target, from, to: p.life })
      return
    }

    case 'adjustPoison': {
      const target = livingPlayer(tx, action.target)
      const delta = amount(action.delta)
      const p = tx.player(target)
      const from = p.poison
      p.poison = Math.max(0, p.poison + delta)
      tx.emit({ type: 'poisonChanged', player: target, from, to: p.poison })
      return
    }

    case 'commanderDamage': {
      const target = livingPlayer(tx, action.target)
      const commander = own(s.objects, action.commanderId)
      if (!commander?.isCommander) fail('unknownObject', 'Esse objeto não é um comandante.')
      const damage = amount(action.amount)
      optionalBoolean(action.alsoLife)
      const p = tx.player(target)
      const total = Math.max(0, (own(p.commanderDamage, commander.id) ?? 0) + damage)
      p.commanderDamage[commander.id] = total
      tx.emit({ type: 'commanderDamageDealt', player: target, commanderId: commander.id, amount: damage, total })
      if (action.alsoLife) {
        const from = p.life
        p.life -= damage
        tx.emit({ type: 'lifeChanged', player: target, from, to: p.life })
      }
      return
    }

    // Épico 11, CR 603.3d: the targets of a trigger going on the stack ("manual": it goes on the stack to be done by hand).
    case 'chooseTargets': {
      const pending = s.pending
      if (pending?.kind !== 'chooseTargets' || pending.player !== actor) fail('notYourDecision', 'Não há alvos para escolher agora.')
      optionalBoolean(action.manual)
      if (!action.manual) {
        const problem = checkTargets(s, pending.specs, action.targets, { controller: actor, sourceId: pending.trigger.sourceId })
        if (problem) fail('invalidTarget', problem)
      }
      s.pending = null
      pushTrigger(tx, pending.trigger, pending.text, action.manual ? { manual: true } : { targets: action.targets })
      stackTriggers(tx, pending.priorityTo, pending.rest)
      if (!s.pending) givePriority(tx, pending.priorityTo)
      return
    }

    // Épico 11, req. 9: whoever has priority may ask that the top item resolve by hand (a safety valve against a
    // misread card). It changes the game's outcome, so it is a rule exception (policies.ts): approved online.
    case 'searchLibrary':
      answerSearch(tx, actor, action.objectIds)
      return

    case 'arrangeTop':
      answerArrange(tx, actor, action.top, action.away)
      return

    case 'activateAbility':
      activateAbility(tx, actor, action, activateManaAbility)
      return

    case 'resolveManually': {
      const top = s.stack[s.stack.length - 1]
      if (!top || top.id !== action.stackItemId) fail('invalidAction', 'Só o item do topo da pilha pode ser resolvido à mão.')
      if (s.ruleset.timingRules !== 'off' && s.priority?.player !== actor) fail('strictPriority', 'Você precisa ter prioridade para isso.')
      if (!top.ability || top.manual) fail('invalidAction', 'Esse item já é resolvido à mão.')
      const item = { ...top, manual: true }
      tx.stack()[s.stack.length - 1] = item
      tx.emit({ type: 'resolvedManually', player: actor, item })
      return
    }

    case 'putAbilityOnStack': {
      const description = text(action.description, MAX_TEXT)
      if (action.sourceId !== undefined && !own(s.objects, action.sourceId)) fail('unknownObject', 'Origem desconhecida.')
      const item = {
        id: tx.newId('a'), kind: 'ability' as const, controller: actor, description,
        ...(action.sourceId !== undefined ? { sourceId: action.sourceId } : {}),
      }
      tx.stack().push(item)
      tx.emit({ type: 'stackItemAdded', item })
      return
    }

    default:
      fail('invalidAction', 'Ação desconhecida.')
  }
}

// Who may touch an object. Hidden zones (hand, library) always belong to the owner only;
// battlefield and stack objects belong to their controller when the ruleset restricts it.
function touchable(tx: Tx, actor: PlayerId, objectId: string, zones?: ZoneKind[]): GameObject {
  const obj = own(tx.s.objects, objectId)
  if (!obj) fail('unknownObject', 'Carta desconhecida.')
  if (zones && !zones.includes(obj.zone)) fail('invalidZone', 'Essa ação não vale nessa zona.')
  const hidden = obj.zone === 'hand' || obj.zone === 'library'
  if (hidden && obj.owner !== actor) fail('notAllowed', 'Essa carta está numa zona oculta de outro jogador.')
  const controlled = obj.zone === 'battlefield' || obj.zone === 'stack'
  if (controlled && tx.s.ruleset.restrictToController && obj.controller !== actor) {
    fail('notAllowed', 'Você não controla essa carta.')
  }
  return obj
}


// CR 605: tap a source and add its mana. Summoning sickness and the extra cost are policies (mana area).
function activateManaAbility(tx: Tx, actor: PlayerId, a: ManaActivation) {
  const s = tx.s
  if (!a || typeof a !== 'object' || typeof a.objectId !== 'string') fail('invalidAction', 'Ativação de mana malformada.')
  const obj = controlledSource(tx, actor, a.objectId)
  const ability = obj.card.rules?.manaAbilities[a.abilityIndex]
  if (!Number.isInteger(a.abilityIndex) || !ability) fail('invalidAction', 'Essa carta não tem essa habilidade de mana.')
  if (a.color !== undefined && !MANA_TYPES.includes(a.color)) fail('invalidAction', 'Cor de mana inválida.')
  const mana = production(s, actor, ability, a.color, obj.id)
  if (ability.extraCost && levelOf(s.ruleset, 'mana') !== 'off') {
    // Under 'warn' a missing payment is only logged (the policy did that); pay what there is.
    const pool = s.players[actor]!.manaPool
    tx.player(actor).manaPool = payGeneric(pool, ability.extraCost.generic) ?? payGeneric(pool, poolTotal(pool))!
  }
  tap(tx, obj.id)
  if (ability.lifeCost) loseLife(tx, actor, ability.lifeCost)
  if (ability.selfDamage) loseLife(tx, actor, ability.selfDamage)
  addMana(tx, actor, mana, obj.id)
  if (ability.sacrificeSelf) moveObject(tx, obj.id, 'graveyard') // Treasure: "{T}, Sacrifice this token: …"
}

// Takes the cost from the pool (and life for Phyrexian mana). Under 'warn' a cost the pool cannot cover is only
// logged by the policy; costs without data are flagged as paid by hand.
function payForSpell(tx: Tx, actor: PlayerId, obj: GameObject, x: number) {
  const cost = spellCost(obj, tx.s.ruleset)
  if (cost.kind === 'manual') {
    tx.emit({ type: 'manualCost', player: actor, objectId: obj.id })
    return
  }
  if (cost.kind !== 'mana') return
  const payment = findPayment(tx.s.players[actor]!.manaPool, cost.cost, x, cost.tax)
  if (!payment) return
  tx.player(actor).manaPool = payment.pool
  if (payment.life) loseLife(tx, actor, payment.life)
  tx.emit({ type: 'costPaid', player: actor, objectId: obj.id, cost: formatCost(cost.cost, x, cost.tax), mana: payment.spent, life: payment.life })
}

// An untapped permanent the actor controls (mana sources are activated only by their controller, CR 602.2).
function controlledSource(tx: Tx, actor: PlayerId, objectId: string): GameObject {
  const obj = own(tx.s.objects, objectId)
  if (!obj || obj.zone !== 'battlefield') fail('unknownObject', 'Essa carta não está no campo de batalha.')
  if (obj.controller !== actor) fail('notAllowed', 'Você não controla essa carta.')
  if (obj.tapped) fail('invalidAction', 'Essa carta já está virada.')
  return obj
}

function tap(tx: Tx, id: string) {
  tx.object(id).tapped = true
  tx.emit({ type: 'tapped', objectId: id })
}

function loseLife(tx: Tx, player: PlayerId, amount: number) {
  const p = tx.player(player)
  const from = p.life
  p.life -= amount
  tx.emit({ type: 'lifeChanged', player, from, to: p.life })
}

// A card its owner plays: in their own hand or command zone.
function ownCard(tx: Tx, actor: PlayerId, objectId: string, zones: ZoneKind[]): GameObject {
  const obj = own(tx.s.objects, objectId)
  if (!obj || (obj.zone === 'hand' && obj.owner !== actor)) fail('unknownObject', 'Carta desconhecida.')
  if (!zones.includes(obj.zone)) fail('invalidZone', 'Essa carta não está na sua mão nem na zona de comando.')
  if (obj.owner !== actor) fail('notAllowed', 'Só o dono joga essa carta.')
  return obj
}

function livingPlayer(tx: Tx, id: PlayerId): PlayerId {
  const p = own(tx.s.players, id)
  if (!p) fail('unknownPlayer', 'Jogador desconhecido.')
  if (p.lost) fail('playerLost', 'Esse jogador já saiu da partida.')
  return id
}

function count(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > MAX_BATCH) fail('invalidAmount', `Use um número entre 1 e ${MAX_BATCH}.`)
  return n
}

function text(value: string, max: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || trimmed.length > max) fail('invalidAmount', `Use um texto de 1 a ${max} caracteres.`)
  return trimmed
}

function amount(n: number): number {
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > MAX_DELTA) {
    fail('invalidAmount', `Use um número inteiro diferente de zero, até ${MAX_DELTA}.`)
  }
  return n
}

function coord(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_COORD
}

function optionalBoolean(value: unknown) {
  if (value !== undefined && typeof value !== 'boolean') fail('invalidAction', 'Ação malformada.')
}

// A token's card comes from the client: keep only known string fields, each bounded.
function tokenCard(card: CardRef): CardRef {
  if (typeof card !== 'object' || card === null) fail('invalidAction', 'Ação malformada.')
  const out: CardRef = { name: text(card.name, MAX_TEXT) }
  for (const key of ['scryfallId', 'oracleId', 'typeLine', 'imageKey'] as const) {
    const value = card[key]
    if (value !== undefined) out[key] = text(value, MAX_TEXT)
  }
  return out
}

// Own-property lookup: ids and names from actions must never resolve to inherited members
// such as "constructor" or "__proto__".
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return typeof key === 'string' && Object.hasOwn(record, key) ? record[key] : undefined
}

function checkShape(action: Action) {
  if (typeof action !== 'object' || action === null || !ACTION_TYPES.has(action.type)) {
    fail('invalidAction', 'Ação desconhecida.')
  }
  if (typeof action.player !== 'string') fail('invalidAction', 'Ação malformada.')
  for (const key of ['objectId', 'target', 'commanderId', 'sourceId', 'stackItemId'] as const) {
    const value = (action as Partial<Record<typeof key, unknown>>)[key]
    if (value !== undefined && typeof value !== 'string') fail('invalidAction', 'Ação malformada.')
  }
}
