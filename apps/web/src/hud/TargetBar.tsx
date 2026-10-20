// The target band (épico 11, T11.9): "Escolha 1 alvo para Lightning Bolt · Confirmar · Cancelar". Legal targets glow
// on the 3D table and in the player panels; this band lists the same targets as buttons, for keyboard and screen
// readers.

import type { PlayerId, PlayerView, Target } from '@gathering-hall/engine'
import { useStore } from '../ui/store'
import type { Dispatch } from './PlayerPanels'
import { confirmAction, legalOptions, limits, manualAction, targetingStore, targetKey, toggleTarget } from './targeting'

export function TargetBar({ view, seat, dispatch, send }: {
  view: PlayerView
  seat: PlayerId
  dispatch: Dispatch // goes through payment
  send: Dispatch // "à mão": straight on, without asking for targets again
}) {
  const t = useStore(targetingStore)
  const pending = view.pending
  if (!t) {
    if (pending?.kind !== 'chooseTargets' || pending.player === seat) return null
    const who = view.players[pending.player]?.name ?? pending.player
    return <div className="target-bar" role="status"><p className="muted">{who} está escolhendo os alvos de {view.objects[pending.trigger.sourceId]?.card?.name ?? 'uma habilidade'}…</p></div>
  }
  const { min, max } = limits(t.specs)
  const options = legalOptions(view, seat, t)
  const chosen = new Set(t.chosen.map(targetKey))
  const ask = min === max ? `Escolha ${max} alvo${max > 1 ? 's' : ''}` : `Escolha até ${max} alvo${max > 1 ? 's' : ''}`
  const ready = t.chosen.length >= min && t.chosen.length > 0
  const label = (target: Target) => {
    if ('player' in target) return view.players[target.player]?.name ?? target.player
    const obj = view.objects[target.object]
    const owner = obj ? view.players[obj.controller]?.name : undefined
    return `${obj?.card?.name ?? 'Carta'}${owner ? ` (${owner})` : ''}`
  }
  const close = () => targetingStore.set(null)
  // A trigger's band stays until the engine takes the answer (GameScreen clears it with the decision).
  const done = () => { if (t.kind === 'cast') close() }

  return (
    <div className="target-bar" role="dialog" aria-label={`${ask} para ${t.title}`}>
      <p><strong>{ask} para {t.title}</strong> <span className="muted small">{t.text.replace(/\bthis (?:card|spell)\b/gi, t.title)}</span></p>
      {options.length ? (
        <ul className="target-options" aria-label="Alvos válidos">
          {options.map((target, i) => (
            <li key={targetKey(target)}>
              <button autoFocus={i === 0} className={`chip-btn${chosen.has(targetKey(target)) ? ' on' : ''}`} aria-pressed={chosen.has(targetKey(target))}
                onClick={() => toggleTarget(target)}>{label(target)}</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Nenhum alvo válido agora.</p>}
      <div className="row">
        <button className="btn" onClick={() => { done(); send(manualAction(t)) }}
          title={t.kind === 'cast' ? 'Lança sem alvos: o efeito fica com os jogadores' : 'A habilidade vai para a pilha para ser feita à mão'}>
          {t.kind === 'cast' ? 'Lançar à mão' : 'Resolver à mão'}
        </button>
        {t.kind === 'cast' && <button className="btn" onClick={close}>Cancelar</button>}
        <button className="btn primary" disabled={!ready} onClick={() => { done(); dispatch(confirmAction(t)) }}>
          Confirmar{t.chosen.length > 1 ? ` (${t.chosen.length})` : ''}
        </button>
      </div>
    </div>
  )
}
