import { useCallback, useEffect, useMemo, useState } from 'react'
import { PaymentDialog } from '../hud/Payment'
import { CardMenu, CardPreview, Curtain, GameLog, Toasts, ZoneViewer } from '../hud/Overlays'
import { CombatPanel } from '../hud/Combat'
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
  const dispatch: Dispatch = useCallback((action) => {
    // Casting that needs sources tapped asks first (automatic payment).
    const pending = paymentFor(session.view(), session.seat(), action)
    if (pending) return setPayment(pending)
    const error = session.dispatch(action)
    if (error) toast(error.message)
  }, [session, setPayment])

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
    arrange: (objectId, x, z) => dispatch({ type: 'setArrangement', objectId, arrangement: { x, z } }),
  }), [dispatch, session])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // While the hot-seat curtain is up, nothing but its own button may act.
      if (session.needsCurtain()) return
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        if (!session.undo()) toast('Nada para desfazer.')
      } else if (e.key === 'Escape') {
        closeTopmost()
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
          <StackPanel view={view} dispatch={dispatch} />
          <GameLog entries={session.getLog()} />
        </aside>
        <PhaseBar view={view} viewer={seat} dispatch={dispatch} />
        {!curtain && <HandArea key={seat} view={view} viewer={seat} dispatch={dispatch} />}
        <CardPreview />
        <CardMenu view={view} dispatch={dispatch} />
        <ZoneViewer view={view} />
        <Toasts />
        {payment && !curtain && (
          <PaymentDialog payment={payment} view={view} onClose={() => setPayment(null)}
            dispatch={(a) => { const error = session.dispatch(a); if (error) toast(error.message) }} />
        )}
        {!curtain && view.status === 'playing' && <CombatPanel view={view} seat={seat} dispatch={dispatch} />}
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
