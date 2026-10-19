import { isEligibleAlone } from '@gathering-hall/formats'
import type { CardRef } from '@gathering-hall/engine'
import { previewStore } from '../../ui/stores'
import type { DeckCardData } from '../cardData'
import { TYPE_GROUPS, typeGroup, type Deck, type DeckCard, type DeckZone, type TypeGroup } from '../model'

export interface DeckListActions {
  add: (card: DeckCard, zone: DeckZone) => void
  remove: (card: DeckCard, zone: DeckZone) => void
  move: (card: DeckCard, from: DeckZone) => void
  pickArt: (card: DeckCard) => void
}

const GROUP_LABELS: Record<TypeGroup, string> = { ...Object.fromEntries(TYPE_GROUPS), other: 'Outros' } as Record<TypeGroup, string>

export function DeckList({ deck, data, actions, highlight }: {
  deck: Deck
  data: DeckCardData
  actions: DeckListActions
  highlight: Set<string> // card names involved in the selected violation
}) {
  const refOf = (c: DeckCard): CardRef =>
    (c.scryfallId && data.printings.get(c.scryfallId)?.ref) || data.byOracle.get(c.oracleId)?.ref || { name: c.name }
  const groups = new Map<TypeGroup, DeckCard[]>()
  for (const c of [...deck.cards].sort((a, b) => a.name.localeCompare(b.name))) {
    const g = typeGroup(data.info.get(c.oracleId)?.typeLine)
    groups.set(g, [...(groups.get(g) ?? []), c])
  }
  const order: TypeGroup[] = [...TYPE_GROUPS.map(([k]) => k), 'other']

  const row = (c: DeckCard, zone: DeckZone) => {
    const facts = data.facts.get(c.oracleId)
    const canLead = zone === 'commanders' || (facts ? isEligibleAlone(facts) : false)
    return (
      <li key={c.oracleId} className={`deck-row${highlight.has(c.name) ? ' flagged' : ''}`}>
        <span className="qty">{c.count}</span>
        <button className="link card-name" onClick={() => actions.pickArt(c)}
          onPointerEnter={() => previewStore.set(refOf(c))} onPointerLeave={() => previewStore.set(null)}
          onFocus={() => previewStore.set(refOf(c))} onBlur={() => previewStore.set(null)}
          aria-label={`${c.name}: escolher arte`}>
          {c.name}
        </button>
        <span className="mv muted" aria-label="Valor de mana">{data.info.get(c.oracleId)?.manaValue ?? ''}</span>
        <span className="row-actions">
          {canLead && (
            <button className="btn ghost tiny" onClick={() => actions.move(c, zone)}>
              {zone === 'commanders' ? 'Ao deck' : 'Comandante'}
            </button>
          )}
          {zone === 'cards' && <button className="step-btn" aria-label={`Mais uma cópia de ${c.name}`} onClick={() => actions.add(c, zone)}>+</button>}
          <button className="step-btn" aria-label={`Remover uma cópia de ${c.name}`} onClick={() => actions.remove(c, zone)}>−</button>
        </span>
      </li>
    )
  }

  return (
    <section className="deck-list" aria-label="Cartas do deck">
      <h2>Comandante{deck.commanders.length > 1 ? 's' : ''}</h2>
      {deck.commanders.length ? <ul>{deck.commanders.map((c) => row(c, 'commanders'))}</ul>
        : <p className="muted">Nenhum ainda. Use a busca para escolher.</p>}
      {order.filter((g) => groups.has(g)).map((g) => {
        const list = groups.get(g)!
        return (
          <div key={g}>
            <h2>{GROUP_LABELS[g]} <span className="count">{list.reduce((n, c) => n + c.count, 0)}</span></h2>
            <ul>{list.map((c) => row(c, 'cards'))}</ul>
          </div>
        )
      })}
    </section>
  )
}
