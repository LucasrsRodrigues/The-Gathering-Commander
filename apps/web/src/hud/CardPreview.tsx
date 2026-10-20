// The enlarged card on hover / long press, with a text box beside it (Arena style): the Portuguese printed text when
// Scryfall has one (else the Oracle text), the keywords explained, and — on the table — the card's current state.

import type { CardRef, ManaCost, ObjectView, PlayerView } from '@gathering-hall/engine'
import { imagesFor } from '../catalog/catalog'
import { useCardText } from '../catalog/cardText'
import { useStore } from '../ui/store'
import { previewObjectStore, previewStore } from '../ui/stores'
import { keywordHelp } from './keywordHelp'

function costText(cost: ManaCost | null | undefined): string {
  if (!cost) return ''
  const parts: string[] = []
  for (let i = 0; i < cost.x; i++) parts.push('{X}')
  if (cost.generic) parts.push(`{${cost.generic}}`)
  for (const [a, b] of cost.hybrid) parts.push(`{${a}/${b}}`)
  for (const c of cost.twoBrid) parts.push(`{2/${c}}`)
  for (const c of cost.phyrexian) parts.push(`{${c}/P}`)
  for (const [c, n] of Object.entries(cost.colored)) for (let i = 0; i < (n ?? 0); i++) parts.push(`{${c}}`)
  return parts.join('')
}

const COUNTER_NAMES: Record<string, string> = { loyalty: 'lealdade', charge: 'carga', time: 'tempo', poison: 'veneno', shield: 'escudo', stun: 'atordoamento' }

// Only where it means something: on the battlefield (and who controls a spell or ability on the stack).
function stateLines(obj: ObjectView, card: CardRef, view: PlayerView | undefined): string[] {
  const lines: string[] = []
  const owner = view?.players[obj.owner]?.name
  const controller = view?.players[obj.controller]?.name
  if (obj.zone === 'stack') return controller ? [`Na pilha, de ${controller}`] : []
  if (obj.zone !== 'battlefield') return []
  if (controller) lines.push(obj.controller !== obj.owner && owner ? `Controlada por ${controller} (dono: ${owner})` : `Controlada por ${controller}`)
  const printedP = card.rules?.power
  const printedT = card.rules?.toughness
  if (obj.power !== null && obj.toughness !== null) {
    const changed = printedP !== null && printedP !== undefined && (obj.power !== printedP || obj.toughness !== printedT)
    lines.push(`Força/resistência agora: ${obj.power}/${obj.toughness}${changed ? ` (impressa ${printedP}/${printedT})` : ''}`)
  }
  if (obj.damage > 0) lines.push(`${obj.damage} de dano marcado neste turno`)
  for (const [name, n] of Object.entries(obj.counters)) if (n) lines.push(`${n} marcador${n > 1 ? 'es' : ''} ${COUNTER_NAMES[name] ?? name}`)
  if (obj.tapped) lines.push('Virada')
  if (obj.summoningSick && obj.zone === 'battlefield') lines.push('Acabou de chegar: ainda não ataca nem usa {T}')
  if (obj.isCommander) lines.push(obj.commanderTax ? `Comandante · taxa de comandante {${obj.commanderTax}}` : 'Comandante')
  if (obj.isToken) lines.push('Ficha')
  return lines
}

export function CardPreview({ view }: { view?: PlayerView }) {
  const card = useStore(previewStore)
  const obj = useStore(previewObjectStore)
  const { text, pt, loadingPt } = useCardText(card)
  if (!card) return null
  const img = imagesFor(card)
  const onTable = obj && obj.card === card ? obj : null
  const cost = costText(card.rules?.cost)
  const keywords = keywordHelp(text?.keywords ?? [])
  const state = onTable ? stateLines(onTable, card, view) : []
  const body = pt?.text || text?.oracleText || ''
  return (
    <div className="preview-wrap" aria-hidden="true">
      {img ? <img className="preview" src={img.large} alt="" /> : (
        <div className="preview placeholder"><strong>{card.name}</strong><span>{card.typeLine}</span></div>
      )}
      {(text || pt) && (
        <div className="preview-text">
          <div className="preview-title">
            <b>{pt?.name ?? card.name}</b>
            {cost && <span className="preview-cost">{cost}</span>}
          </div>
          {pt && pt.name !== card.name && <div className="muted small">{card.name}</div>}
          <div className="muted small">{pt?.typeLine || text?.typeLine || card.typeLine}</div>
          {body && <p className="preview-body">{body}</p>}
          {!pt && !loadingPt && text && <p className="muted small">Sem tradução em português; texto Oracle em inglês.</p>}
          {keywords.length > 0 && (
            <ul className="preview-keywords">
              {keywords.map((k) => <li key={k.name}><b>{k.name}:</b> {k.help}</li>)}
            </ul>
          )}
          {state.length > 0 && (
            <ul className="preview-state">
              {state.map((l) => <li key={l}>{l}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
