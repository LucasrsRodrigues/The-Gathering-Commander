import { useRef, useState } from 'react'
import type { ActionIntent, PlayerId, PlayerView } from '@gathering-hall/engine'
import { seatOrder } from '../table/layout'
import { focusStore, menuStore, zoneViewerStore } from '../ui/stores'
import { useStore } from '../ui/store'
import { menuAnchor } from './a11y'
import { formatMana } from './mana'

export type Dispatch = (action: ActionIntent) => void

const LONG_STEP = 5
const LONG_PRESS_MS = 450

// +/− that changes by 1 on tap and by 5 on long press.
function Stepper({ label, onChange }: { label: string; onChange: (delta: number) => void }) {
  const timer = useRef(0)
  const long = useRef(false)
  const button = (sign: 1 | -1) => (
    <button
      className="step-btn"
      aria-label={`${sign > 0 ? 'Aumentar' : 'Diminuir'} ${label}`}
      onPointerDown={() => {
        long.current = false
        timer.current = window.setTimeout(() => {
          long.current = true
          onChange(sign * LONG_STEP)
        }, LONG_PRESS_MS)
      }}
      onPointerUp={() => clearTimeout(timer.current)}
      onPointerLeave={() => clearTimeout(timer.current)}
      onClick={() => !long.current && onChange(sign)}
    >
      {sign > 0 ? '+' : '−'}
    </button>
  )
  return <>{button(-1)}{button(1)}</>
}

function PlayerPanel({ view, seat, dispatch, local }: {
  view: PlayerView; seat: PlayerId; dispatch: Dispatch; local: boolean
}) {
  const p = view.players[seat]!
  const focus = useStore(focusStore)
  const [expanded, setExpanded] = useState(local)
  const active = view.turn.active === seat
  const priority = view.priority?.player === seat
  // Every opposing commander we can see, plus any that already dealt damage.
  const opposing = Object.values(view.objects).filter((o) => o.isCommander && o.owner !== seat).map((o) => o.id)
  const damageSources = [...new Set([...opposing, ...Object.keys(p.commanderDamage)])]
  const pool = formatMana(p.manaPool)
  const battlefieldCount = view.battlefield.filter((id) => view.objects[id]?.controller === seat).length

  return (
    <section className={`player${local ? ' local' : ''}${active ? ' active' : ''}${priority ? ' priority' : ''}${p.lost ? ' lost' : ''}`}
      aria-label={`Jogador ${p.name}`}>
      <header>
        <strong className="player-name">{p.name}</strong>
        {active && <span className="badge">turno</span>}
        {priority && <span className="badge gold">prioridade</span>}
        <span className="header-actions">
          {!local && (
            <button className="link" onClick={() => focusStore.set(focus === seat ? null : seat)}>
              {focus === seat ? 'Visão geral' : 'Focar'}
            </button>
          )}
          {!local && (
            <button className="link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Menos' : 'Mais'}
            </button>
          )}
        </span>
      </header>
      {p.lost ? <p className="muted">Saiu da partida</p> : (
        <>
          <div className="life" aria-live="polite">
            <Stepper label={`vida de ${p.name}`} onChange={(delta) => dispatch({ type: 'adjustLife', target: seat, delta })} />
            <span className="life-value"><span className="sr-only">Vida </span>{p.life}</span>
            {pool && <span className="mana-pool" title="Reserva de mana (esvazia ao fim da etapa)"><span className="sr-only">Reserva de mana: </span>{pool}</span>}
          </div>
          {!expanded && (
            <div className="summary">
              Veneno {p.poison} · Cmd {Math.max(0, ...Object.values(p.commanderDamage))} · Mão {p.handCount} · Grim. {p.libraryCount}
            </div>
          )}
          {expanded && <><div className="chips">
            <span className="chip">
              Veneno <b>{p.poison}</b>
              <Stepper label={`veneno de ${p.name}`} onChange={(delta) => dispatch({ type: 'adjustPoison', target: seat, delta })} />
            </span>
            {damageSources.map((id) => (
              <span className="chip" key={id} title="Dano de comandante recebido">
                {view.objects[id]?.card?.name.split(',')[0] ?? 'Comandante'} <b>{p.commanderDamage[id] ?? 0}</b>
                <Stepper label={`dano de ${view.objects[id]?.card?.name ?? 'comandante'} em ${p.name}`} onChange={(amount) =>
                  dispatch({ type: 'commanderDamage', target: seat, commanderId: id, amount, alsoLife: amount > 0 })} />
              </span>
            ))}
          </div>
          <div className="zones-row">
            <span>Mão {p.handCount}</span>
            {local ? (
              <button className="link" aria-haspopup="menu" onClick={(e) => menuStore.set({
                target: { kind: 'library', seat }, ...menuAnchor(e, e.currentTarget.getBoundingClientRect()),
              })}>Grimório {p.libraryCount}</button>
            ) : <span>Grimório {p.libraryCount}</span>}
            <button className="link" onClick={() => zoneViewerStore.set({ seat, zone: 'battlefield' })}>Campo {battlefieldCount}</button>
            <button className="link" onClick={() => zoneViewerStore.set({ seat, zone: 'command' })}>Comando {p.command.length}</button>
            <button className="link" onClick={() => zoneViewerStore.set({ seat, zone: 'graveyard' })}>Cemitério {p.graveyard.length}</button>
            <button className="link" onClick={() => zoneViewerStore.set({ seat, zone: 'exile' })}>Exílio {p.exile.length}</button>
          </div></>}
        </>
      )}
    </section>
  )
}

export function PlayerPanels({ view, viewer, dispatch }: { view: PlayerView; viewer: PlayerId; dispatch: Dispatch }) {
  const [me, ...others] = seatOrder(view, viewer)
  return (
    <>
      <div className="opponents">
        {others.map((seat) => <PlayerPanel key={seat} view={view} seat={seat} dispatch={dispatch} local={false} />)}
      </div>
      {me && <div className="me"><PlayerPanel view={view} seat={me} dispatch={dispatch} local /></div>}
    </>
  )
}
