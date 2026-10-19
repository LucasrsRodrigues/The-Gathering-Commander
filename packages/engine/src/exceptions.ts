// Rule exceptions — "Fazer mesmo assim" (épico 09, req. 33–36). An action a 'block' policy rejected can be asked
// for; in local games it applies at once, online every other living player must approve. Approved actions run with
// the policies skipped and are logged as a judge action.

import { fail } from './errors'
import { checkPolicies, levelOf } from './policies'
import { Tx } from './tx'
import type { Action, ExceptionRequest, GameEvent, GameState, PlayerId, ReduceResult } from './types'

export type Run = (state: GameState, action: Action, skipPolicies: boolean) => ReduceResult

const MAX_REASON = 200
// Actions that can never be the subject of an exception.
const NOT_EXCEPTIONS = new Set<Action['type']>([
  'requestException', 'answerException', 'cancelException', 'concede', 'keepHand', 'mulligan', 'bottomCards',
])

export function pendingException(state: GameState): ExceptionRequest | null {
  return state.pending?.kind === 'exception' ? state.pending : null
}

// Everyone who must approve: the other players still in the game.
function voters(state: GameState, requester: PlayerId): PlayerId[] {
  return state.seats.filter((id) => id !== requester && !state.players[id]!.lost)
}

function playing(state: GameState, player: PlayerId) {
  if (state.status !== 'playing') fail('wrongPhase', 'Não há partida em andamento.')
  const p = state.players[player]
  if (!p) fail('unknownPlayer', 'Jogador desconhecido.')
  if (p.lost) fail('playerLost', 'Esse jogador já saiu da partida.')
}

function judged(request: Pick<ExceptionRequest, 'player' | 'action' | 'reason'>, approvedBy: PlayerId[]): GameEvent {
  return { type: 'judgeAction', player: request.player, actionType: request.action.type, reason: request.reason, approvedBy }
}

export function requestException(state: GameState, a: Extract<Action, { type: 'requestException' }>, run: Run): ReduceResult {
  playing(state, a.player)
  if (pendingException(state)) fail('pendingException', 'Já há um pedido de exceção esperando resposta.')
  if (state.pending) fail('notYourDecision', 'Há uma decisão pendente na partida.')
  if (typeof a.reason !== 'string' || a.reason.length > MAX_REASON) fail('invalidAction', 'Motivo inválido.')
  if (!a.action || typeof a.action !== 'object' || NOT_EXCEPTIONS.has(a.action.type)) fail('noException', 'Essa ação não pode ser pedida como exceção.')
  const action = { ...a.action, player: a.player } as Action
  const reason = a.reason.trim()

  // It must work once the policies are skipped; otherwise it fails for another reason and is no exception.
  // Checked first, so asking about another player's hidden card answers exactly like playing it would.
  const dry = run(state, action, true)
  if (!dry.ok) return dry
  const findings = checkPolicies(state, action).filter((f) => levelOf(state.ruleset, f.area) === 'block')
  if (!findings.length) fail('noException', 'Essa ação não precisa de exceção: as regras já deixam.')

  const others = voters(state, a.player)
  if (state.options.exceptionApproval === 'auto' || !others.length) {
    return { ok: true, state: dry.state, events: [judged({ player: a.player, action, reason }, []), ...dry.events] }
  }
  const tx = new Tx(state)
  const objectId = 'objectId' in action ? action.objectId : undefined
  const card = objectId ? state.objects[objectId]?.card : undefined
  tx.s.pending = { kind: 'exception', player: a.player, action, reason, findings, approvals: [], ...(card ? { card } : {}) }
  tx.emit({ type: 'exceptionRequested', player: a.player, reason })
  return { ok: true, state: tx.s, events: tx.events }
}

export function answerException(state: GameState, a: Extract<Action, { type: 'answerException' }>, run: Run): ReduceResult {
  playing(state, a.player)
  const request = pendingException(state)
  if (!request) fail('noException', 'Não há pedido de exceção para responder.')
  if (typeof a.approve !== 'boolean') fail('invalidAction', 'Ação malformada.')
  const needed = voters(state, request.player)
  if (!needed.includes(a.player)) fail('notYourDecision', 'Quem pediu não vota no próprio pedido.')
  if (request.approvals.includes(a.player)) fail('notYourDecision', 'Você já aprovou esse pedido.')

  const answered: GameEvent = { type: 'exceptionAnswered', player: a.player, approve: a.approve }
  const approvals = [...request.approvals, a.player]
  if (!a.approve || needed.every((id) => approvals.includes(id))) {
    const cleared: GameState = { ...state, pending: null }
    if (!a.approve) return { ok: true, state: cleared, events: [answered] }
    const result = run(cleared, request.action, true)
    if (!result.ok) {
      return { ok: true, state: cleared, events: [answered, { type: 'exceptionFailed', player: request.player, message: result.error.message }] }
    }
    return { ok: true, state: result.state, events: [answered, judged(request, approvals), ...result.events] }
  }
  return { ok: true, state: { ...state, pending: { ...request, approvals } }, events: [answered] }
}

export function cancelException(state: GameState, a: Extract<Action, { type: 'cancelException' }>): ReduceResult {
  playing(state, a.player)
  const request = pendingException(state)
  if (!request) fail('noException', 'Não há pedido de exceção para cancelar.')
  if (request.player !== a.player) fail('notYourDecision', 'Só quem pediu pode desistir do pedido.')
  return { ok: true, state: { ...state, pending: null }, events: [{ type: 'exceptionCancelled', player: a.player }] }
}
