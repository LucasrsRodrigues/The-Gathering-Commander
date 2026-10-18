import { useCallback, useEffect, useMemo } from 'react'
import { CardMenu, CardPreview, Curtain, GameLog, Toasts, ZoneViewer } from '../hud/Overlays'
import { HandArea } from '../hud/HandArea'
import { isInteractiveTarget } from '../hud/a11y'
import { PlayerPanels, type Dispatch } from '../hud/PlayerPanels'
import { primaryAction } from '../hud/primaryAction'
import { PhaseBar, StackPanel } from '../hud/TurnControls'
import type { GameSession } from '../session/GameSession'
import { useSessionVersion } from '../session/useSession'
import { TableScene, type TableIntents } from '../table/TableScene'
import { closeTopmost, toast } from '../ui/stores'

export function GameScreen({ session, onExit }: { session: GameSession; onExit: () => void }) {
  useSessionVersion(session)
  const view = session.view()
  const seat = session.seat()
  const curtain = session.needsCurtain()

  const dispatch: Dispatch = useCallback((action) => {
    const error = session.dispatch(action)
    if (error) toast(error.message)
  }, [session])

  const intents: TableIntents = useMemo(() => ({
    tap: (objectId) => {
      const obj = session.view().objects[objectId]
      dispatch({ type: obj?.tapped ? 'untap' : 'tap', objectId })
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

  return (
    <div className="game">
      {/* Under the curtain the table and HUD are inert: no focus, no screen reader access to the next hand. */}
      <div className="table-layer" inert={curtain}>
        <TableScene view={view} viewer={seat} intents={intents} />
      </div>
      <div className="hud" inert={curtain}>
        <PlayerPanels view={view} viewer={seat} dispatch={dispatch} />
        <div className="topbar">
          <button className="btn ghost" disabled={!session.canUndo()} onClick={() => session.undo()} title="Ctrl/Cmd + Z">Desfazer</button>
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
        {view.status === 'ended' && (
          <div className="game-over" role="alert">
            <h2>{winners ? `Vitória de ${winners}!` : 'Fim de jogo'}</h2>
            <button className="btn primary" autoFocus onClick={onExit}>Nova partida</button>
          </div>
        )}
      </div>
      {curtain && <Curtain name={view.players[seat]?.name ?? ''} onReady={() => session.confirmSeat()} />}
    </div>
  )
}
