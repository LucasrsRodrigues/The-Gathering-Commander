import { STEPS, type PlayerId, type PlayerView } from '@gathering-hall/engine'
import { STEP_LABELS } from '../session/describe'
import type { Dispatch } from './PlayerPanels'

export interface PrimaryAction {
  label: string
  run: (() => void) | null
}

const DECISIONS: Record<string, string> = {
  declareAttackers: 'Declarando atacantes…',
  declareBlockers: 'Declarando bloqueios…',
  confirmDamage: 'Confirmando o dano…',
  discard: 'Descartando…',
  exception: 'Pedido de exceção…',
}

// The one big button: advance (relaxed mode, your turn, empty stack) or pass priority.
export function primaryAction(view: PlayerView, viewer: PlayerId, dispatch: Dispatch): PrimaryAction {
  if (view.status !== 'playing') return { label: view.status === 'ended' ? 'Fim de jogo' : 'Mulligan…', run: null }
  // While the game waits on a decision (combat, discard, an exception), the panel for it is the way forward.
  const decision = view.pending ? DECISIONS[view.pending.kind] : undefined
  if (decision) return { label: decision, run: null }
  const hasPriority = view.priority?.player === viewer
  const canAdvance = view.ruleset.priorityMode === 'relaxed' && view.turn.active === viewer && view.stack.length === 0
  if (canAdvance) {
    const next = STEPS[STEPS.indexOf(view.turn.step) + 1]
    const label = !next || next === 'cleanup' ? 'Passar o turno' : `Ir para ${STEP_LABELS[next]}`
    return { label, run: () => dispatch({ type: 'advanceStep' }) }
  }
  if (hasPriority) {
    return { label: view.stack.length ? 'Passar (resolver)' : 'Passar prioridade', run: () => dispatch({ type: 'passPriority' }) }
  }
  const waiting = view.priority ? view.players[view.priority.player]?.name : ''
  return { label: `Aguardando ${waiting}`, run: null }
}
