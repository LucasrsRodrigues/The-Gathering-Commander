// Automatic payment (épico 09, req. 13): casting shows which sources will be tapped; one click confirms.

import { formatCost, type PlayerView } from '@gathering-hall/engine'
import { Dialog } from '../ui/Dialog'
import { formatMana, type PendingPayment } from './mana'
import type { Dispatch } from './PlayerPanels'

export function PaymentDialog({ payment, view, onClose, dispatch }: {
  payment: PendingPayment
  view: PlayerView
  onClose: () => void
  dispatch: Dispatch
}) {
  const obj = view.objects[payment.action.objectId]
  const rules = obj?.card?.rules
  const tax = obj?.zone === 'command' ? obj.commanderTax : 0
  const cost = rules?.cost ? formatCost(rules.cost, payment.action.x ?? 0, tax) : ''
  const sources = payment.plan.map((a) => {
    const source = view.objects[a.objectId]
    const ability = source?.card?.rules?.manaAbilities[a.abilityIndex]
    const made = a.color ? formatMana({ [a.color]: ability?.produces.kind === 'anyColor' ? ability.produces.amount : 1 })
      : ability?.produces.kind === 'fixed' ? formatMana(ability.produces.mana) : ''
    return { key: `${a.objectId}-${a.abilityIndex}`, name: source?.card?.name ?? 'Fonte', made }
  })

  function cast() {
    dispatch({ ...payment.action, payWith: payment.plan })
    onClose()
  }

  return (
    <Dialog title={`Lançar ${obj?.card?.name ?? 'carta'}`} onClose={onClose}>
      <p>Custo {cost}{tax ? ` (com taxa de comandante +${tax})` : ''}. Vamos virar:</p>
      <ul className="payment-sources">{sources.map((s) => <li key={s.key}>{s.name} <b>{s.made}</b></li>)}</ul>
      <p className="muted small">Prefere escolher? Feche, clique nas fontes que quiser e lance de novo.</p>
      <div className="row end">
        <button className="btn" onClick={onClose}>Pagar à mão</button>
        <button className="btn primary" autoFocus onClick={cast}>Lançar</button>
      </div>
    </Dialog>
  )
}
