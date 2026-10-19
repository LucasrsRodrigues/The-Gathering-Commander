// "Fazer mesmo assim" (épico 09, req. 33–36): the dialog for an action a house rule blocked, and the request the
// other players approve online. Local games approve at once, so only the first part shows there.

import { useState } from 'react'
import type { ActionIntent, ExceptionRequest, PlayerId, PlayerView } from '@gathering-hall/engine'
import type { BlockedAction } from '../session/port'
import { Dialog } from '../ui/Dialog'
import { describeIntent } from './labels'
import type { Dispatch } from './PlayerPanels'

const cardOf = (view: PlayerView, action: ActionIntent) => ('objectId' in action ? view.objects[action.objectId]?.card : null)

export function BlockedDialog({ blocked, view, online, onDismiss, dispatch }: {
  blocked: BlockedAction
  view: PlayerView
  online: boolean
  onDismiss: () => void
  dispatch: Dispatch
}) {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const reasons = blocked.error.findings?.map((f) => f.message) ?? [blocked.error.message]
  const what = describeIntent(blocked.action, cardOf(view, blocked.action))

  function request() {
    dispatch({ type: 'requestException', action: blocked.action, reason: reason.trim().slice(0, 200) })
    onDismiss()
  }

  return (
    <Dialog title="As regras não deixam agora" onClose={onDismiss}>
      <p>Você tentou {what}.</p>
      <ul className="rule-reasons">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {!asking ? (
        <>
          <p className="muted small">
            Se outra carta permite (um efeito sem automação ainda), peça uma exceção. Ela fica no log como ação de juiz.
          </p>
          <div className="row end">
            <button className="btn" onClick={() => setAsking(true)}>Fazer mesmo assim…</button>
            <button className="btn primary" autoFocus onClick={onDismiss}>Entendi</button>
          </div>
        </>
      ) : (
        <>
          <label className="field">Por quê? (opcional)
            <input value={reason} maxLength={200} placeholder="Ex.: Exploration deixa jogar outro terreno"
              onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && request()} autoFocus />
          </label>
          {online && (
            <p className="muted small">
              Os outros jogadores precisam aprovar e vão ver a carta envolvida. A partida espera a resposta.
            </p>
          )}
          <div className="row end">
            <button className="btn" onClick={onDismiss}>Cancelar</button>
            <button className="btn primary" onClick={request}>{online ? 'Pedir aos outros' : 'Fazer mesmo assim'}</button>
          </div>
        </>
      )}
    </Dialog>
  )
}

// While a request is open: who asked waits (and may give up), the others approve or refuse.
export function ExceptionPrompt({ view, viewer, dispatch }: { view: PlayerView; viewer: PlayerId; dispatch: Dispatch }) {
  const request = view.pending?.kind === 'exception' ? (view.pending as ExceptionRequest) : null
  if (!request) return null
  const name = (id: PlayerId) => view.players[id]?.name ?? id
  const what = describeIntent(request.action, request.card ?? cardOf(view, request.action))
  const voters = view.seats.filter((id) => id !== request.player && !view.players[id]?.lost)
  const waitingFor = voters.filter((id) => !request.approvals.includes(id)).map(name)

  return (
    <div className="exception-request" role="alertdialog" aria-label="Pedido de exceção">
      <p><strong>{name(request.player)}</strong> pede para {what} mesmo contra as regras.</p>
      {request.reason && <p className="muted">“{request.reason}”</p>}
      <ul className="rule-reasons small">{request.findings.map((f) => <li key={f.code}>{f.message}</li>)}</ul>
      {request.player === viewer ? (
        <div className="row">
          <span className="muted small">Esperando: {waitingFor.join(', ')}</span>
          <button className="btn" onClick={() => dispatch({ type: 'cancelException' })}>Desistir</button>
        </div>
      ) : voters.includes(viewer) && !request.approvals.includes(viewer) ? (
        <div className="row">
          <button className="btn primary" onClick={() => dispatch({ type: 'answerException', approve: true })}>Aprovar</button>
          <button className="btn" onClick={() => dispatch({ type: 'answerException', approve: false })}>Recusar</button>
        </div>
      ) : (
        <span className="muted small">Esperando: {waitingFor.join(', ') || '—'}</span>
      )}
    </div>
  )
}
