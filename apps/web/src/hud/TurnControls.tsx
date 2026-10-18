import { useState } from 'react'
import type { PlayerId, PlayerView, Step } from '@gathering-hall/engine'
import { STEP_LABELS } from '../session/describe'
import { menuStore, previewStore } from '../ui/stores'
import type { Dispatch } from './PlayerPanels'
import { menuAnchor } from './a11y'
import { primaryAction } from './primaryAction'

// The 12 steps grouped into the 5 phases players think in (CR 500.1).
const PHASES: { label: string; steps: Step[] }[] = [
  { label: 'Início', steps: ['untap', 'upkeep', 'draw'] },
  { label: 'Principal 1', steps: ['main1'] },
  { label: 'Combate', steps: ['beginCombat', 'declareAttackers', 'declareBlockers', 'combatDamage', 'endCombat'] },
  { label: 'Principal 2', steps: ['main2'] },
  { label: 'Final', steps: ['end', 'cleanup'] },
]

export function PhaseBar({ view, viewer, dispatch }: { view: PlayerView; viewer: PlayerId; dispatch: Dispatch }) {
  const primary = primaryAction(view, viewer, dispatch)
  const hasPriority = view.priority?.player === viewer
  const showPass = hasPriority && primary.label.startsWith('Ir para')
  return (
    <nav className="phasebar" aria-label="Etapas do turno">
      <div className="turn-label">
        Turno {view.turn.number} · <b>{view.players[view.turn.active]?.name}</b>
      </div>
      <ol className="phases" aria-label="Fases">
        {PHASES.map((phase) => {
          const current = phase.steps.includes(view.turn.step)
          return (
            <li key={phase.label} className={current ? 'current' : ''} aria-current={current ? 'step' : undefined}>
              {phase.label}
              {current && phase.steps.length > 1 && <small> · {STEP_LABELS[view.turn.step]}</small>}
            </li>
          )
        })}
      </ol>
      <div className="phase-actions">
        {showPass && <button className="btn ghost" onClick={() => dispatch({ type: 'passPriority' })}>Passar prioridade</button>}
        <button className="btn primary" disabled={!primary.run} onClick={() => primary.run?.()} title="Atalho: espaço" aria-keyshortcuts="Space">
          {primary.label}
        </button>
      </div>
    </nav>
  )
}

export function StackPanel({ view, dispatch }: { view: PlayerView; dispatch: Dispatch }) {
  const [text, setText] = useState('')
  const items = [...view.stack].reverse()
  return (
    <section className="stack-panel" aria-label="Pilha">
      <h2>Pilha {view.stack.length > 0 && <span className="count">{view.stack.length}</span>}</h2>
      {items.length === 0 ? <p className="muted">Vazia</p> : (
        <ol>
          {items.map((item, i) => {
            const obj = item.objectId ? view.objects[item.objectId] : undefined
            return (
              <li key={item.id} className={i === 0 ? 'top' : ''}>
                {obj ? (
                  <button className="stack-item" aria-haspopup="menu"
                    aria-label={`${i === 0 ? 'Topo: ' : ''}${obj.card?.name ?? 'Carta'}, de ${view.players[item.controller]?.name}`}
                    onPointerEnter={() => obj.card && previewStore.set(obj.card)}
                    onPointerLeave={() => previewStore.set(null)}
                    onFocus={() => obj.card && previewStore.set(obj.card)}
                    onBlur={() => previewStore.set(null)}
                    onClick={(e) => menuStore.set({ target: { kind: 'object', objectId: obj.id }, ...menuAnchor(e, e.currentTarget.getBoundingClientRect()) })}>
                    <span>{obj.card?.name ?? 'Carta'}</span>
                    <small>{view.players[item.controller]?.name}</small>
                  </button>
                ) : (
                  <div className="stack-item">
                    <span>{item.description}</span>
                    <small>{view.players[item.controller]?.name}</small>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <form className="add-ability" onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        dispatch({ type: 'putAbilityOnStack', description: text })
        setText('')
      }}>
        <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)}
          placeholder="Habilidade ou gatilho…" aria-label="Descrever habilidade para a pilha" />
        <button className="btn ghost" type="submit">Pôr na pilha</button>
      </form>
    </section>
  )
}
