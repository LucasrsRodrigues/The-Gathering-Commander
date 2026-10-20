// The cards a cost needs (épico 11, onda 2): "Sacrifice a creature", "Discard a card". The choice goes inside the
// `activateAbility` action; closing sends nothing.

import { useState } from 'react'
import { Dialog } from '../ui/Dialog'
import type { CostChoice } from './abilities'
import type { Dispatch } from './PlayerPanels'

export function CostChoiceDialog({ choice, onClose, dispatch }: { choice: CostChoice; onClose: () => void; dispatch: Dispatch }) {
  const [chosen, setChosen] = useState<string[]>([])
  const verb = choice.kind === 'sacrifice' ? 'sacrificar' : 'descartar'
  const toggle = (id: string) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < choice.count ? [...list, id] : choice.count === 1 ? [id] : list))
  function confirm() {
    onClose()
    dispatch({ ...choice.action, [choice.kind]: chosen })
  }
  return (
    <Dialog title={`Escolha ${choice.count === 1 ? 'a carta' : `${choice.count} cartas`} para ${verb}`} onClose={onClose}>
      {choice.options.length ? (
        <ul className="target-options" aria-label={`Cartas para ${verb}`}>
          {choice.options.map((o, i) => (
            <li key={o.id}>
              <button autoFocus={i === 0} className={`chip-btn${chosen.includes(o.id) ? ' on' : ''}`} aria-pressed={chosen.includes(o.id)} onClick={() => toggle(o.id)}>
                {o.card?.name ?? 'Carta'}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">Nenhuma carta serve para esse custo agora.</p>}
      <div className="row end">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={chosen.length !== choice.count} onClick={confirm}>Confirmar</button>
      </div>
    </Dialog>
  )
}
