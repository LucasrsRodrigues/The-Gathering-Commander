// Automatic passing on the table (épico 09, T9.18): "pass until…" shortcuts and the grid of stops.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { defaultStops, type PlayerId, type PlayerView, type Step, type StopSettings } from '@gathering-hall/engine'
import { STEP_LABELS } from '../session/describe'
import { Dialog } from '../ui/Dialog'
import type { Dispatch } from './PlayerPanels'

// Steps where a player can receive priority (none in untap and, normally, cleanup: CR 502.4, 514.3).
const STOPPABLE: Step[] = ['upkeep', 'draw', 'main1', 'beginCombat', 'declareAttackers', 'declareBlockers', 'combatDamage', 'endCombat', 'main2', 'end']

const UNTIL_LABELS = { endOfTurn: 'até o fim do turno', myTurn: 'até o seu turno' } as const

export function PassShortcuts({ view, viewer, dispatch }: { view: PlayerView; viewer: PlayerId; dispatch: Dispatch }) {
  const [editing, setEditing] = useState(false)
  const me = view.players[viewer]
  if (view.ruleset.timingRules === 'off' || !me?.stops || view.status !== 'playing') return null
  return (
    <div className="pass-shortcuts">
      {me.passUntil ? (
        <button className="btn ghost small" onClick={() => dispatch({ type: 'passUntil', until: null })}>
          Passando {UNTIL_LABELS[me.passUntil]} · parar
        </button>
      ) : (
        <>
          <button className="btn ghost small" onClick={() => dispatch({ type: 'passUntil', until: 'endOfTurn' })}>Passar até o fim do turno</button>
          {view.turn.active !== viewer && (
            <button className="btn ghost small" onClick={() => dispatch({ type: 'passUntil', until: 'myTurn' })}>Passar até o meu turno</button>
          )}
        </>
      )}
      <button className="btn ghost small" onClick={() => setEditing(true)}>Paradas…</button>
      {/* Portal: the phase bar is a positioning context and would clip a modal rendered inside it. */}
      {editing && createPortal(
        <StopsDialog stops={me.stops} onClose={() => setEditing(false)} onSave={(stops) => dispatch({ type: 'setStops', stops })} />,
        document.body,
      )}
    </div>
  )
}

function StopsDialog({ stops, onClose, onSave }: { stops: StopSettings; onClose: () => void; onSave: (s: StopSettings) => void }) {
  const [draft, setDraft] = useState(stops)
  const toggle = (side: 'own' | 'others', step: Step) => setDraft((d) => ({
    ...d, [side]: d[side].includes(step) ? d[side].filter((s) => s !== step) : [...d[side], step],
  }))
  return (
    <Dialog title="Onde parar" onClose={onClose}>
      <p className="muted small">
        Nas etapas marcadas você recebe a prioridade; nas outras ela passa sozinha. Você sempre para quando outro jogador
        põe algo na pilha ou ataca você.
      </p>
      <table className="stops-grid">
        <thead><tr><th scope="col">Etapa</th><th scope="col">Meu turno</th><th scope="col">Turno dos outros</th></tr></thead>
        <tbody>
          {STOPPABLE.map((step) => (
            <tr key={step}>
              <th scope="row">{STEP_LABELS[step]}</th>
              {(['own', 'others'] as const).map((side) => (
                <td key={side}>
                  <input type="checkbox" checked={draft[side].includes(step)} onChange={() => toggle(side, step)}
                    aria-label={`${STEP_LABELS[step]}, ${side === 'own' ? 'meu turno' : 'turno dos outros'}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check">
        <input type="checkbox" checked={draft.passAfterOwnSpell} onChange={(e) => setDraft({ ...draft, passAfterOwnSpell: e.target.checked })} />
        Passar sozinho depois de lançar uma mágica minha
      </label>
      <div className="row end">
        <button className="btn" onClick={() => setDraft(defaultStops())}>Padrão</button>
        <button className="btn primary" onClick={() => { onSave(draft); onClose() }}>Salvar</button>
      </div>
    </Dialog>
  )
}
