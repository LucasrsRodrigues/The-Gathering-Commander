// Combat (épico 09, CR 506–511): declaring attackers and blockers. Legality that a house rule may bend (summoning
// sickness, Defender, Flying, Menace…) lives in the policies; what is structurally impossible fails here.
//
// Only while combat rules are on: with 'off' the combat steps stay the sandbox they were.

import { fail } from './errors'
import { nextDamagePhase, proposeDamage } from './damage'
import { isCreature, isPlaneswalker } from './stats'
import { givePriority, goToStep } from './turn'
import type { Tx } from './tx'
import type { Attack, Block, GameState, PlayerId, Step } from './types'

const MAX_DECLARED = 200

export const combatOn = (state: GameState) => state.ruleset.combatRules !== 'off'

// Who an attack is aimed at: the player, or the controller of the attacked planeswalker.
export function defenderOf(state: GameState, attack: Attack): PlayerId | null {
  if (state.players[attack.target]) return attack.target
  const pw = state.objects[attack.target]
  return pw && pw.zone === 'battlefield' && isPlaneswalker(pw) ? pw.controller : null
}

const untappedCreatures = (state: GameState, player: PlayerId) =>
  state.battlefield.filter((id) => {
    const o = state.objects[id]!
    return o.controller === player && !o.tapped && isCreature(o)
  })

// Turn-based actions of the combat steps. Returns true when the step took over (no normal priority).
export function onCombatStep(tx: Tx, step: Step): boolean {
  const s = tx.s
  if (!combatOn(s)) return false
  const active = s.turn.active
  switch (step) {
    case 'beginCombat':
      s.turn = { ...s.turn, combat: { attacks: [], blocks: [], damageOrder: {}, firstStrikeDealt: false, regularDealt: false } }
      return false
    case 'declareAttackers':
      // Nothing that could attack: no attackers, and the combat damage steps are skipped (CR 508.8).
      if (!untappedCreatures(s, active).length) {
        goToStep(tx, 'endCombat')
        return true
      }
      s.priority = null
      s.pending = { kind: 'declareAttackers', player: active }
      return true
    case 'declareBlockers': {
      const combat = s.turn.combat
      if (!combat?.attacks.length) return false
      const defenders = [...new Set(combat.attacks.map((a) => defenderOf(s, a)).filter((p): p is PlayerId => !!p))]
        .filter((p) => !s.players[p]!.lost && untappedCreatures(s, p).length)
      if (!defenders.length) return finishBlockers(tx)
      s.priority = null
      s.pending = { kind: 'declareBlockers', player: defenders[0]!, players: defenders }
      return true
    }
    case 'combatDamage': {
      // CR 510: propose this step's damage; the active player confirms it. A step with nothing to deal just passes.
      for (let phase = nextDamagePhase(s); phase; phase = nextDamagePhase(s)) {
        const proposal = proposeDamage(s, phase)
        if (proposal.assignments.length) {
          s.priority = null
          s.pending = { kind: 'confirmDamage', player: active, proposal }
          return true
        }
        const c = s.turn.combat!
        s.turn = { ...s.turn, combat: { ...c, ...(phase === 'first' ? { firstStrikeDealt: true } : { regularDealt: true }) } }
      }
      return false
    }
    case 'main2':
      s.turn = { ...s.turn, combat: null } // CR 511.3: creatures leave combat when the phase ends
      return false
    default:
      return false
  }
}

export function declareAttackers(tx: Tx, player: PlayerId, attacks: Attack[]) {
  const s = tx.s
  if (s.pending?.kind !== 'declareAttackers' || s.pending.player !== player) fail('notYourDecision', 'Não é a hora de declarar atacantes.')
  if (!Array.isArray(attacks) || attacks.length > MAX_DECLARED) fail('invalidAction', 'Ataque malformado.')
  const seen = new Set<string>()
  for (const a of attacks) {
    const obj = a && typeof a.attacker === 'string' ? s.objects[a.attacker] : undefined
    if (!obj || obj.zone !== 'battlefield' || obj.controller !== player || !isCreature(obj)) fail('invalidAction', 'Só criaturas suas no campo atacam.')
    if (seen.has(obj.id)) fail('invalidAction', 'Cada criatura ataca uma vez.')
    seen.add(obj.id)
    const defender = typeof a.target === 'string' ? defenderOf(s, a) : null
    if (!defender || defender === player || s.players[defender]!.lost) fail('invalidAction', 'Ataque um oponente ou um planeswalker dele.')
  }
  s.pending = null
  for (const a of attacks) {
    const obj = s.objects[a.attacker]!
    // CR 508.1f: attacking taps the creature, unless it has Vigilance.
    if (!obj.tapped && !obj.card.rules?.keywords.includes('vigilance')) {
      tx.object(obj.id).tapped = true
      tx.emit({ type: 'tapped', objectId: obj.id })
    }
  }
  s.turn = { ...s.turn, combat: { ...(s.turn.combat ?? { blocks: [], damageOrder: {}, firstStrikeDealt: false, regularDealt: false }), attacks: attacks.map(({ attacker, target }) => ({ attacker, target })) } }
  tx.emit({ type: 'attackersDeclared', player, attacks: s.turn.combat!.attacks })
  if (!attacks.length) goToStep(tx, 'endCombat') // CR 508.8
  else givePriority(tx, player)
}

export function declareBlockers(tx: Tx, player: PlayerId, blocks: Block[]) {
  const s = tx.s
  const pending = s.pending
  if (pending?.kind !== 'declareBlockers' || !pending.players.includes(player)) fail('notYourDecision', 'Não é a sua vez de declarar bloqueadores.')
  if (!Array.isArray(blocks) || blocks.length > MAX_DECLARED) fail('invalidAction', 'Bloqueio malformado.')
  const combat = s.turn.combat!
  const seen = new Set<string>()
  for (const b of blocks) {
    const blocker = b && typeof b.blocker === 'string' ? s.objects[b.blocker] : undefined
    if (!blocker || blocker.zone !== 'battlefield' || blocker.controller !== player || !isCreature(blocker)) fail('invalidAction', 'Só criaturas suas no campo bloqueiam.')
    if (seen.has(blocker.id)) fail('invalidAction', 'Cada criatura bloqueia um atacante.')
    seen.add(blocker.id)
    const attack = combat.attacks.find((a) => a.attacker === b.attacker)
    if (!attack || defenderOf(s, attack) !== player) fail('invalidAction', 'Bloqueie um atacante que esteja atacando você ou um planeswalker seu.')
  }
  const blocksNow = blocks.map(({ blocker, attacker }) => ({ blocker, attacker }))
  s.turn = { ...s.turn, combat: { ...combat, blocks: [...combat.blocks, ...blocksNow] } }
  tx.emit({ type: 'blockersDeclared', player, blocks: blocksNow })
  const left = pending.players.filter((p) => p !== player)
  if (left.length) s.pending = { kind: 'declareBlockers', player: left[0]!, players: left }
  else finishBlockers(tx)
}

// All blocks are in: damage assignment order is the order blockers were declared (CR 509.2, adjustable later).
function finishBlockers(tx: Tx): true {
  const s = tx.s
  const combat = s.turn.combat!
  const damageOrder: Record<string, string[]> = {}
  for (const b of combat.blocks) (damageOrder[b.attacker] ??= []).push(b.blocker)
  s.turn = { ...s.turn, combat: { ...combat, damageOrder } }
  s.pending = null
  givePriority(tx, s.turn.active)
  return true
}

// A player leaves while combat waits on them (CR 800.4): they no longer declare.
export function leaveCombatDecision(tx: Tx, player: PlayerId) {
  const pending = tx.s.pending
  if (pending?.kind === 'declareBlockers' && pending.players.includes(player)) {
    const left = pending.players.filter((p) => p !== player)
    if (left.length) tx.s.pending = { kind: 'declareBlockers', player: left[0]!, players: left }
    else finishBlockers(tx)
  }
}
