// House-rule policies (épico 09): which rules of turn structure an action breaks, per area. Pure: it only reads the
// state. reduce() decides what to do with the findings from the area's level (block / warn / off).

import { hasInstantSpeed, hasKeyword } from './cards'
import { findPayment, formatCost, spellCost } from './cost'
import { assignmentFinding } from './damage'
import { isSummoningSick, poolTotal, simulatePool } from './mana'
import type { Action, GameState, PlayerId, RuleArea, RuleFinding, RuleLevel, Ruleset } from './types'

type Policy = (state: GameState, action: Action) => RuleFinding | null

export function levelOf(ruleset: Ruleset, area: RuleArea): RuleLevel {
  return area === 'timing' ? ruleset.timingRules : area === 'mana' ? ruleset.manaRules : ruleset.combatRules
}

// CR 601.2a / 305.1: cards are played from hand or the command zone by casting them or playing a land, not by
// moving them by hand. Other manual moves stay free (they are how unscripted effects are applied).
const playedByHand: Policy = (state, action) => {
  if (action.type !== 'moveObject' || (action.to !== 'battlefield' && action.to !== 'stack')) return null
  const obj = state.objects[action.objectId]
  if (!obj || (obj.zone !== 'hand' && obj.zone !== 'command')) return null
  return {
    area: 'timing', code: 'useCastOrPlay',
    message: 'Use "Jogar terreno" ou "Lançar" para pôr uma carta da mão ou da zona de comando em jogo.',
  }
}

const timing = (code: string, message: string): RuleFinding => ({ area: 'timing', code, message })
const isMain = (state: GameState) => state.turn.step === 'main1' || state.turn.step === 'main2'

// What "sorcery speed" asks (CR 307.1): your turn, a main phase, an empty stack. Null when all hold.
function sorcerySpeed(state: GameState, player: PlayerId, what: string): RuleFinding | null {
  if (state.turn.active !== player) return timing('notYourTurn', `${what} só no seu turno.`)
  if (!isMain(state)) return timing('notMainPhase', `${what} só nas fases principais.`)
  if (state.stack.length) return timing('stackNotEmpty', `${what} só com a pilha vazia.`)
  return null
}

// CR 305.1–305.2: lands at sorcery speed, as many as the house rules allow per turn (one officially).
const landTiming: Policy = (state, action) => {
  if (action.type !== 'playLand') return null
  const speed = sorcerySpeed(state, action.player, 'Terrenos')
  if (speed) return speed
  const { landsPerTurn } = state.ruleset
  if (state.players[action.player]!.landsPlayed >= landsPerTurn) {
    return timing('landLimit', `Você já jogou ${landsPerTurn === 1 ? 'um terreno' : `${landsPerTurn} terrenos`} neste turno.`)
  }
  return null
}

// CR 117.1a / 307.1: instants and Flash need only priority; everything else also needs sorcery speed.
const spellTiming: Policy = (state, action) => {
  if (action.type !== 'castSpell') return null
  const obj = state.objects[action.objectId]
  if (!obj) return null
  if (state.priority?.player !== action.player) return timing('noPriority', 'Você precisa ter prioridade para lançar.')
  return hasInstantSpeed(obj.card) ? null : sorcerySpeed(state, action.player, 'Essa mágica (sem Flash) pode ser lançada')
}

const mana = (code: string, message: string): RuleFinding => ({ area: 'mana', code, message })

// CR 302.6 for mana: a creature's {T} mana ability waits for its controller's next turn (unless Haste).
const manaSickness: Policy = (state, action) => {
  if (action.type !== 'activateMana' && action.type !== 'declareMana') return null
  const obj = state.objects[action.objectId]
  if (!obj || obj.zone !== 'battlefield' || !isSummoningSick(state, obj)) return null
  return mana('summoningSick', 'Essa criatura acabou de chegar: só gera mana a partir do seu próximo turno.')
}

// "{1}, {T}: Add {U}{B}." — the extra cost comes out of the pool.
const manaExtraCost: Policy = (state, action) => {
  if (action.type !== 'activateMana') return null
  const extra = state.objects[action.objectId]?.card.rules?.manaAbilities[action.abilityIndex]?.extraCost
  if (!extra || poolTotal(state.players[action.player]?.manaPool ?? {}) >= extra.generic) return null
  return mana('notEnoughMana', `Essa habilidade custa {${extra.generic}} da sua reserva de mana.`)
}

// CR 601.2f–h: the total cost is paid from the pool.
const spellPayment: Policy = (state, action) => {
  if (action.type !== 'castSpell') return null
  const obj = state.objects[action.objectId]
  if (!obj) return null
  const cost = spellCost(obj, state.ruleset)
  if (cost.kind === 'none') return mana('noManaCost', 'Essa carta não tem custo de mana: só entra por outro efeito.')
  if (cost.kind !== 'mana') return null
  const x = action.x ?? 0
  // With payWith, the sources are tapped first: judge the pool they leave (an impossible activation fails later).
  const simulated = action.payWith?.length ? simulatePool(state, action.player, action.payWith) : null
  if (simulated?.sick) return mana('summoningSick', 'Uma criatura do pagamento acabou de chegar: só gera mana a partir do seu próximo turno.')
  const pool = simulated?.pool ?? state.players[action.player]!.manaPool
  if (!simulated?.short && findPayment(pool, cost.cost, x, cost.tax)) return null
  const tax = cost.tax ? ` (com taxa de comandante +${cost.tax})` : ''
  return mana('notEnoughMana', `Mana insuficiente: custa ${formatCost(cost.cost, x, cost.tax)}${tax}. Gere mana primeiro.`)
}

const combat = (code: string, message: string): RuleFinding => ({ area: 'combat', code, message })
const nameOf = (state: GameState, id: string) => state.objects[id]?.card.name ?? 'Uma criatura'

// CR 508.1a, 302.6, 702.3b: attackers are untapped, have been under control since the turn began (or have Haste)
// and do not have Defender.
const attackLegality: Policy = (state, action) => {
  if (action.type !== 'declareAttackers' || !Array.isArray(action.attacks)) return null
  for (const { attacker } of action.attacks) {
    const obj = state.objects[attacker]
    if (!obj || obj.zone !== 'battlefield' || obj.controller !== action.player) continue // impossible: fails on its own
    if (obj.tapped) return combat('tapped', `${obj.card.name} está virada e não pode atacar.`)
    if (hasKeyword(obj.card, 'defender')) return combat('defender', `${obj.card.name} tem Defender e não ataca.`)
    if (isSummoningSick(state, obj)) return combat('summoningSick', `${obj.card.name} acabou de chegar e não pode atacar neste turno.`)
  }
  return null
}

// CR 509.1a–b, 702.9b (Flying), 702.17 (Reach), 702.110b (Menace).
const blockLegality: Policy = (state, action) => {
  if (action.type !== 'declareBlockers' || !Array.isArray(action.blocks)) return null
  const perAttacker = new Map<string, number>()
  for (const { blocker, attacker } of action.blocks) {
    const b = state.objects[blocker]
    const a = state.objects[attacker]
    // Impossible blocks (not attacking, not yours) fail on their own; rules only judge real ones.
    if (!b || !a || b.controller !== action.player || !state.turn.combat?.attacks.some((x) => x.attacker === attacker)) continue
    if (b.tapped) return combat('tapped', `${b.card.name} está virada e não pode bloquear.`)
    if (hasKeyword(a.card, 'flying') && !hasKeyword(b.card, 'flying') && !hasKeyword(b.card, 'reach')) {
      return combat('flying', `${a.card.name} voa: só criaturas com Flying ou Reach bloqueiam.`)
    }
    perAttacker.set(attacker, (perAttacker.get(attacker) ?? 0) + 1)
  }
  for (const [attacker, n] of perAttacker) {
    if (n === 1 && hasKeyword(state.objects[attacker]!.card, 'menace')) {
      return combat('menace', `${nameOf(state, attacker)} tem Menace: precisa de dois ou mais bloqueadores.`)
    }
  }
  return null
}

const damageLegality: Policy = (state, action) =>
  action.type === 'assignDamage' && Array.isArray(action.assignments) ? assignmentFinding(state, action.assignments) : null

const POLICIES: { area: RuleArea; check: Policy }[] = [
  { area: 'combat', check: attackLegality },
  { area: 'combat', check: damageLegality },
  { area: 'combat', check: blockLegality },
  { area: 'mana', check: manaSickness },
  { area: 'mana', check: spellPayment },
  { area: 'mana', check: manaExtraCost },
  { area: 'timing', check: playedByHand },
  { area: 'timing', check: landTiming },
  { area: 'timing', check: spellTiming },
]

// Findings for every area that is not 'off'.
export function checkPolicies(state: GameState, action: Action): RuleFinding[] {
  const findings: RuleFinding[] = []
  for (const { area, check } of POLICIES) {
    if (levelOf(state.ruleset, area) === 'off') continue
    const finding = check(state, action)
    if (finding) findings.push(finding)
  }
  return findings
}
