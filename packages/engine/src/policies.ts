// House-rule policies (épico 09): which rules of turn structure an action breaks, per area. Pure: it only reads the
// state. reduce() decides what to do with the findings from the area's level (block / warn / off).

import { hasInstantSpeed } from './cards'
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

const POLICIES: { area: RuleArea; check: Policy }[] = [
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
