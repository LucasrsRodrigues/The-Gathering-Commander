// Targets of a "when this enters" trigger (épico 11, T11.7): a plain list of the legal targets. Clicking them on the
// 3D table, with highlights, comes with T11.9; until then this panel keeps the game from waiting forever.

import { useState } from 'react'
import { legalTargetsInView, type PlayerId, type PlayerView, type Target } from '@gathering-hall/engine'
import type { Dispatch } from './PlayerPanels'

const key = (t: Target) => ('player' in t ? `p:${t.player}` : `o:${t.object}`)

export function ChooseTargetsPanel({ view, seat, dispatch }: { view: PlayerView; seat: PlayerId; dispatch: Dispatch }) {
  const pending = view.pending
  if (pending?.kind !== 'chooseTargets') return null
  const source = view.objects[pending.trigger.sourceId]?.card?.name ?? 'Habilidade'
  if (pending.player !== seat) {
    return <div className="combat-panel" role="status"><p className="muted">{view.players[pending.player]?.name ?? pending.player} está escolhendo os alvos de {source}…</p></div>
  }
  return <Picker key={`${pending.trigger.sourceId}-${pending.trigger.index}`} view={view} seat={seat} dispatch={dispatch} source={source} />
}

function Picker({ view, seat, dispatch, source }: { view: PlayerView; seat: PlayerId; dispatch: Dispatch; source: string }) {
  const pending = view.pending as Extract<PlayerView['pending'], { kind: 'chooseTargets' }>
  const [chosen, setChosen] = useState<Target[]>([])
  const ctx = { controller: seat, sourceId: pending.trigger.sourceId }
  const seen = new Set<string>()
  const options = pending.specs.flatMap((spec) => legalTargetsInView(view, spec, ctx)).filter((t) => !seen.has(key(t)) && seen.add(key(t)))
  const max = pending.specs.reduce((n, s) => n + (s.kind === 'object' ? s.count : 1), 0)
  const label = (t: Target) => {
    if ('player' in t) return view.players[t.player]?.name ?? t.player
    const obj = view.objects[t.object]
    const owner = obj ? view.players[obj.controller]?.name : undefined
    return `${obj?.card?.name ?? 'Carta'}${owner ? ` (${owner})` : ''}`
  }
  const toggle = (t: Target) => setChosen((list) => (list.some((c) => key(c) === key(t)) ? list.filter((c) => key(c) !== key(t)) : list.length < max ? [...list, t] : list))

  return (
    <div className="combat-panel" role="dialog" aria-label={`Alvos de ${source}`}>
      <h3>{source}</h3>
      <p className="small">{pending.text}</p>
      <p className="muted small">Escolha {max === 1 ? 'o alvo' : `até ${max} alvos`}:</p>
      <ul className="combat-rows">
        {options.map((t) => (
          <li key={key(t)}>
            <label><input type="checkbox" checked={chosen.some((c) => key(c) === key(t))} onChange={() => toggle(t)} /> {label(t)}</label>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" onClick={() => dispatch({ type: 'chooseTargets', targets: [], manual: true })}>Resolver à mão</button>
        <button className="btn primary" disabled={!chosen.length} onClick={() => dispatch({ type: 'chooseTargets', targets: chosen })}>Confirmar</button>
      </div>
    </div>
  )
}
