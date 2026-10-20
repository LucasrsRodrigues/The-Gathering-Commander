// Combat damage (épico 09, CR 510, 702.2 Deathtouch, 702.4 Double strike, 702.7 First strike, 702.15 Lifelink,
// 702.19 Trample, 903.10a commander damage). The engine proposes the damage, the active player confirms or adjusts
// it within the rules, then it is dealt all at once.

import { controllerOf, hasKeywordNow } from './layers'
import { fail } from './errors'
import { dealDamageTo, hasKnownStats, isPlaneswalker, powerOf, toughnessOf } from './stats'
import type { Tx } from './tx'
import type { CombatState, DamageAssignment, DamageProposal, GameObject, GameState, ObjectId, PlayerId, RuleFinding } from './types'

const onBattlefield = (state: GameState, id: ObjectId) => state.objects[id]?.zone === 'battlefield'
const strikesFirst = (state: GameState, obj: GameObject) => hasKeywordNow(state, obj, 'firstStrike') || hasKeywordNow(state, obj, 'doubleStrike')

// Who deals damage in this step (CR 510.4): first strikers in the first step; then everyone who has not dealt damage
// yet, plus double strikers again.
function dealsDamage(state: GameState, obj: GameObject, phase: DamageProposal['phase'], combat: CombatState): boolean {
  if (phase === 'first') return strikesFirst(state, obj)
  return !combat.firstStrikeDealt || !hasKeywordNow(state, obj, 'firstStrike') || hasKeywordNow(state, obj, 'doubleStrike')
}

function combatants(state: GameState): ObjectId[] {
  const combat = state.turn.combat
  if (!combat) return []
  return [...combat.attacks.map((a) => a.attacker), ...combat.blocks.map((b) => b.blocker)].filter((id) => onBattlefield(state, id))
}

// The next damage step this combat needs, if any.
export function nextDamagePhase(state: GameState): DamageProposal['phase'] | null {
  const combat = state.turn.combat
  if (!combat?.attacks.length || combat.regularDealt) return null
  if (!combat.firstStrikeDealt && combatants(state).some((id) => strikesFirst(state, state.objects[id]!))) return 'first'
  return 'regular'
}

// Damage that destroys this creature (CR 702.19c), counting Deathtouch from the source (702.2c).
function lethal(state: GameState, blocker: GameObject, source: GameObject): number {
  if (hasKeywordNow(state, source, 'deathtouch')) return 1
  if (!hasKnownStats(blocker)) return Number.POSITIVE_INFINITY // unknown toughness: the players decide
  return Math.max(1, toughnessOf(state, blocker) - blocker.damage)
}

// The target of an attack, if it can still be dealt damage: the player, or a planeswalker still on the battlefield.
function attackTarget(state: GameState, target: string): string | null {
  if (state.players[target]) return state.players[target].lost ? null : target
  return onBattlefield(state, target) && isPlaneswalker(state, state.objects[target]!) ? target : null
}

export function proposeDamage(state: GameState, phase: DamageProposal['phase']): DamageProposal {
  const combat = state.turn.combat!
  const assignments: DamageAssignment[] = []
  for (const attack of combat.attacks) {
    const attacker = state.objects[attack.attacker]
    if (!attacker || !onBattlefield(state, attacker.id) || !dealsDamage(state, attacker, phase, combat)) continue
    let left = Math.max(0, powerOf(state, attacker))
    if (!left) continue
    const wasBlocked = combat.blocks.some((b) => b.attacker === attacker.id) // CR 509.1h: stays blocked
    const blockers = (combat.damageOrder[attacker.id] ?? []).filter((id) => onBattlefield(state, id))
    const target = attackTarget(state, attack.target)
    const trample = hasKeywordNow(state, attacker, 'trample')
    if (!wasBlocked || (!blockers.length && trample)) {
      if (target) assignments.push({ source: attacker.id, to: target, amount: left })
      continue
    }
    blockers.forEach((id, i) => {
      const last = i === blockers.length - 1
      const give = last && !trample ? left : Math.min(left, lethal(state, state.objects[id]!, attacker))
      if (give > 0) assignments.push({ source: attacker.id, to: id, amount: give })
      left -= give
    })
    if (left > 0 && trample && target) assignments.push({ source: attacker.id, to: target, amount: left })
  }
  for (const block of combat.blocks) {
    const blocker = state.objects[block.blocker]
    if (!blocker || !onBattlefield(state, blocker.id) || !onBattlefield(state, block.attacker) || !dealsDamage(state, blocker, phase, combat)) continue
    const power = Math.max(0, powerOf(state, blocker))
    if (power) assignments.push({ source: blocker.id, to: block.attacker, amount: power })
  }
  return { phase, assignments }
}

// Structural checks: only sources and recipients that are in this combat. Anything else is not a combat at all.
export function checkAssignmentShape(state: GameState, assignments: DamageAssignment[]) {
  if (state.pending?.kind !== 'confirmDamage') fail('notYourDecision', 'Não há dano de combate para confirmar.')
  if (!Array.isArray(assignments) || assignments.length > 400) fail('invalidAction', 'Dano malformado.')
  const proposal = state.pending.proposal
  const sources = new Set(proposal.assignments.map((a) => a.source))
  const combat = state.turn.combat!
  const seen = new Set<string>()
  for (const a of assignments) {
    if (!a || typeof a.source !== 'string' || typeof a.to !== 'string' || !Number.isInteger(a.amount) || a.amount < 0 || a.amount > 10_000) {
      fail('invalidAction', 'Dano malformado.')
    }
    const key = `${a.source}>${a.to}`
    if (seen.has(key) || !sources.has(a.source)) fail('invalidSelection', 'Esse dano não faz parte deste combate.')
    seen.add(key)
    const attack = combat.attacks.find((x) => x.attacker === a.source)
    const ok = attack
      ? a.to === attack.target || (combat.damageOrder[a.source] ?? []).includes(a.to)
      : combat.blocks.some((b) => b.blocker === a.source && b.attacker === a.to)
    if (!ok) fail('invalidSelection', 'Uma criatura só causa dano a quem está no combate com ela.')
  }
}

// Rule checks (combat area): each source deals exactly its damage, blockers in order with lethal before moving on,
// and only Trample reaches past the blockers. A bent rule here is what an exception approves (prevention, etc.).
export function assignmentFinding(state: GameState, assignments: DamageAssignment[]): RuleFinding | null {
  if (state.pending?.kind !== 'confirmDamage') return null
  const proposal = state.pending.proposal
  const combat = state.turn.combat!
  const finding = (message: string): RuleFinding => ({ area: 'combat', code: 'damageAssignment', message })
  const by = (source: string) => assignments.filter((a) => a.source === source)
  for (const source of new Set(proposal.assignments.map((a) => a.source))) {
    const expected = proposal.assignments.filter((a) => a.source === source).reduce((n, a) => n + a.amount, 0)
    const given = by(source).reduce((n, a) => n + a.amount, 0)
    const obj = state.objects[source]!
    if (given !== expected) return finding(`${obj.card.name} causa ${expected} de dano, nem mais nem menos.`)
    const attack = combat.attacks.find((x) => x.attacker === source)
    if (!attack) continue
    const order = (combat.damageOrder[source] ?? []).filter((id) => onBattlefield(state, id))
    const amountTo = (to: string) => by(source).find((a) => a.to === to)?.amount ?? 0
    for (let i = 0; i < order.length; i++) {
      const later = order.slice(i + 1).reduce((n, id) => n + amountTo(id), 0) + amountTo(attack.target)
      if (later > 0 && amountTo(order[i]!) < lethal(state, state.objects[order[i]!]!, obj)) {
        return finding(`${obj.card.name} precisa causar dano letal a cada bloqueador, na ordem, antes de passar ao próximo.`)
      }
    }
    if (order.length && amountTo(attack.target) > 0 && !hasKeywordNow(state, obj, 'trample')) {
      return finding(`${obj.card.name} foi bloqueada e não tem Trample: o dano fica nos bloqueadores.`)
    }
  }
  return null
}

// Deals the confirmed damage simultaneously (CR 510.2), then the step moves on with priority to the active player.
export function applyCombatDamage(tx: Tx, assignments: DamageAssignment[]) {
  const s = tx.s
  const proposal = (s.pending as Extract<GameState['pending'], { kind: 'confirmDamage' }>).proposal
  const dealt = new Map<ObjectId, number>()
  const real = assignments.filter((a) => a.amount > 0)
  for (const a of real) {
    const source = s.objects[a.source]!
    dealt.set(a.source, (dealt.get(a.source) ?? 0) + a.amount)
    if (s.players[a.to]) damagePlayer(tx, a.to, source, a.amount)
    else if (onBattlefield(s, a.to)) dealDamageTo(tx, s.objects[a.to]!, a.amount, hasKeywordNow(s, source, 'deathtouch'))
  }
  for (const [id, amount] of dealt) {
    const source = s.objects[id]!
    if (!hasKeywordNow(s, source, 'lifelink')) continue
    const controller = controllerOf(s, source)
    const p = tx.player(controller)
    const from = p.life
    p.life += amount
    tx.emit({ type: 'lifeChanged', player: controller, from, to: p.life })
  }
  tx.emit({ type: 'combatDamage', phase: proposal.phase, assignments: real })
  const combat = s.turn.combat!
  s.turn = { ...s.turn, combat: { ...combat, ...(proposal.phase === 'first' ? { firstStrikeDealt: true } : { regularDealt: true }) } }
  s.pending = null
}

// Damage to a player is life loss; a commander's combat damage also counts toward the 21 (CR 903.10a).
function damagePlayer(tx: Tx, player: PlayerId, source: GameObject, amount: number) {
  const p = tx.player(player)
  const from = p.life
  p.life -= amount
  tx.emit({ type: 'lifeChanged', player, from, to: p.life })
  if (source.isCommander) {
    const total = (p.commanderDamage[source.id] ?? 0) + amount
    p.commanderDamage = { ...p.commanderDamage, [source.id]: total }
    tx.emit({ type: 'commanderDamageDealt', player, commanderId: source.id, amount, total })
  }
}
