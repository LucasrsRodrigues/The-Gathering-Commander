import { useCallback, useEffect, useMemo, useState } from 'react'
import { PaymentDialog } from '../hud/Payment'
import { CardMenu, CardPreview, Curtain, GameLog, Toasts, ZoneViewer } from '../hud/Overlays'
import { CombatPanel } from '../hud/Combat'
import { TargetBar } from '../hud/TargetBar'
import { CostChoiceDialog } from '../hud/CostChoice'
import { costChoiceFor, type CostChoice } from '../hud/abilities'
import { castTargeting, targetingStore, toggleTarget, triggerTargeting } from '../hud/targeting'
import { AwayNotice, type AwayControls } from '../hud/AwayNotice'
import { BlockedDialog, ExceptionPrompt } from '../hud/Exceptions'
import { HandArea } from '../hud/HandArea'
import { isInteractiveTarget } from '../hud/a11y'
import { PlayerPanels, type Dispatch } from '../hud/PlayerPanels'
import { primaryAction } from '../hud/primaryAction'
import { PhaseBar, StackPanel } from '../hud/TurnControls'
import type { GameSessionPort } from '../session/port'
import { useSessionVersion } from '../session/useSession'
import { TableScene, type TableIntents } from '../table/TableScene'
import { closeTopmost, menuStore, toast } from '../ui/stores'
import { manaItems, paymentFor, type PendingPayment } from '../hud/mana'

const CONNECTION_LABELS = { connecting: 'Conectando…', online: 'Online', offline: 'Sem conexão: reconectando…' } as const

export function GameScreen({ session, onExit, onRematch, away: awayControls }: {
  session: GameSessionPort
  onExit: () => void
  onRematch?: () => void // online host: back to the room lobby with the same seats
  away?: AwayControls // online: who left and, for the host, skipping them
}) {
  useSessionVersion(session)
  const view = session.view()
  const seat = session.seat()
  const curtain = session.needsCurtain()

  const [payment, setPayment] = useState<PendingPayment | null>(null)
  const [costChoice, setCostChoice] = useState<CostChoice | null>(null)
  // Sends an action without asking for targets again; dispatch below asks for them first. Either way, the cards a
  // cost needs (épico 11, onda 2) and the sources to tap (automatic payment) are asked before the engine sees it.
  const send: Dispatch = useCallback((action) => {
    const choice = costChoiceFor(session.view(), session.seat(), action)
    if (choice) return setCostChoice(choice)
    const pending = paymentFor(session.view(), session.seat(), action)
    if (pending) return setPayment(pending)
    const error = session.dispatch(action)
    if (error) toast(error.message)
  }, [session, setPayment, setCostChoice])
  const dispatch: Dispatch = useCallback((action) => {
    // Épico 11: a spell or an ability with targets asks for them on the table first.
    const targeting = castTargeting(session.view(), action)
    if (targeting) return targetingStore.set(targeting)
    send(action)
  }, [session, send])

  const intents: TableIntents = useMemo(() => ({
    // Clicking a mana source makes mana: at once when there is one way, otherwise a menu of the options.
    tap: (objectId, x, y) => {
      const view = session.view()
      const obj = view.objects[objectId]
      const mana = obj ? manaItems(view, session.seat(), obj) : []
      if (mana.length === 1) dispatch(mana[0]!.action)
      else if (mana.length > 1) menuStore.set({ target: { kind: 'object', objectId }, x, y })
      else dispatch({ type: obj?.tapped ? 'untap' : 'tap', objectId })
    },
    target: (target) => toggleTarget(target),
    arrange: (objectId, x, z) => dispatch({ type: 'setArrangement', objectId, arrangement: { x, z } }),
  }), [dispatch, session])

  // A trigger waiting on this seat opens the target band; it closes when the engine has the answer. A cast in target
  // mode ends if the card left the hand meanwhile (online, another player's action can't do that, but undo can).
  const trigger = curtain ? null : triggerTargeting(view, seat)
  useEffect(() => {
    const current = targetingStore.get()
    if (trigger && current?.id !== trigger.id) targetingStore.set(trigger)
    else if (!trigger && current?.kind === 'trigger') targetingStore.set(null)
    else if (current?.kind === 'cast' && (curtain || !view.objects[current.sourceId] || view.objects[current.sourceId]!.zone === 'stack')) targetingStore.set(null)
  }, [trigger?.id, curtain, view, trigger])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // While the hot-seat curtain is up, nothing but its own button may act.
      if (session.needsCurtain()) return
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        if (!session.undo()) toast('Nada para desfazer.')
      } else if (e.key === 'Escape') {
        if (targetingStore.get()?.kind === 'cast' && !menuStore.get()) targetingStore.set(null)
        else closeTopmost()
      } else if (e.key === ' ' && !isInteractiveTarget(e.target)) {
        e.preventDefault()
        primaryAction(session.view(), session.seat(), dispatch).run?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, dispatch])

  const winners = view.winners?.map((id) => view.players[id]?.name).join(', ')
  const connection = session.connection()
  const presence = session.presence()
  const away = presence ? view.seats.filter((id) => !presence.includes(id) && !view.players[id]?.lost) : []
  const blocked = session.blocked()

  return (
    <div className="game">
      {/* Under the curtain the table and HUD are inert: no focus, no screen reader access to the next hand. */}
      <div className="table-layer" inert={curtain}>
        <TableScene view={view} viewer={seat} intents={intents} />
      </div>
      <div className="hud" inert={curtain}>
        <PlayerPanels view={view} viewer={seat} dispatch={dispatch} />
        <div className="topbar">
          {connection !== 'local' && (
            <span className={`net-status ${connection}`} role="status">
              {CONNECTION_LABELS[connection]}
              {away.length > 0 && ` · fora: ${away.map((id) => view.players[id]?.name).join(', ')}`}
            </span>
          )}
          {awayControls && view.status !== 'ended' && <AwayNotice view={view} away={awayControls} />}
          {connection === 'local' && (
            <button className="btn ghost" disabled={!session.canUndo()} onClick={() => session.undo()} title="Ctrl/Cmd + Z">Desfazer</button>
          )}
          <button className="btn ghost" onClick={() => { if (confirm('Sair da partida atual?')) onExit() }}>Sair</button>
        </div>
        <aside className="side">
          <StackPanel view={view} viewer={seat} dispatch={dispatch} />
          <GameLog entries={session.getLog()} />
        </aside>
        <PhaseBar view={view} viewer={seat} dispatch={dispatch} />
        {!curtain && <HandArea key={seat} view={view} viewer={seat} dispatch={dispatch} />}
        <CardPreview view={view} />
        <CardMenu view={view} dispatch={dispatch} />
        <ZoneViewer view={view} />
        <Toasts />
        {payment && !curtain && (
          <PaymentDialog payment={payment} view={view} onClose={() => setPayment(null)}
            dispatch={(a) => { const error = session.dispatch(a); if (error) toast(error.message) }} />
        )}
        {costChoice && <CostChoiceDialog choice={costChoice} onClose={() => setCostChoice(null)} dispatch={send} />}
        {!curtain && view.status === 'playing' && <CombatPanel view={view} seat={seat} dispatch={dispatch} />}
        {!curtain && view.status === 'playing' && <TargetBar view={view} seat={seat} dispatch={dispatch} send={send} />}
        {!curtain && <ExceptionPrompt view={view} viewer={seat} dispatch={dispatch} />}
        {blocked && !curtain && (
          <BlockedDialog blocked={blocked} view={view} online={connection !== 'local'} dispatch={dispatch}
            onDismiss={() => session.dismissBlocked()} />
        )}
        {view.status === 'ended' && (
          <div className="game-over" role="alert">
            <h2>{winners ? `Vitória de ${winners}!` : 'Fim de jogo'}</h2>
            <div className="row">
              {onRematch && <button className="btn primary" autoFocus onClick={onRematch}>Revanche na mesma sala</button>}
              <button className={onRematch ? 'btn' : 'btn primary'} autoFocus={!onRematch} onClick={onExit}>
                {connection === 'local' ? 'Nova partida' : 'Sair da sala'}
              </button>
            </div>
          </div>
        )}
      </div>
      {curtain && <Curtain name={view.players[seat]?.name ?? ''} onReady={() => session.confirmSeat()} />}
    </div>
  )
}
