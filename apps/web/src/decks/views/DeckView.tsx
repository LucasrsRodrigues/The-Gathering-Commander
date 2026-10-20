// The deck in the editor (épico 10, req. 4): the same groups in three views — list (the accessible reference), stacks
// (overlapping cards, Moxfield style) and grid. Images load lazily in Scryfall's small size, and groups off screen
// are skipped by the browser (content-visibility).

import type { CardRef } from '@gathering-hall/engine'
import { isEligibleAlone } from '@gathering-hall/formats'
import { previewStore } from '../../ui/stores'
import type { CardImages } from '../../catalog/catalog'
import type { DeckCardData } from '../cardData'
import type { DeckCard, DeckZone } from '../model'
import type { CardGroup, DeckViewMode } from './grouping'


export interface DeckCardActions {
  add: (card: DeckCard, zone: DeckZone) => void
  remove: (card: DeckCard, zone: DeckZone) => void
  move: (card: DeckCard, from: DeckZone) => void
  pickArt: (card: DeckCard) => void
}

interface ViewProps {
  mode: DeckViewMode
  commanders: DeckCard[]
  groups: CardGroup[]
  data: DeckCardData
  actions: DeckCardActions
  highlight: Set<string> // card names involved in the selected violation
}

const refOf = (c: DeckCard, data: DeckCardData): CardRef =>
  (c.scryfallId && data.printings.get(c.scryfallId)?.ref) || data.byOracle.get(c.oracleId)?.ref || { name: c.name }
const imagesOf = (c: DeckCard, data: DeckCardData): CardImages | null =>
  (c.scryfallId && data.printings.get(c.scryfallId)?.images) || data.byOracle.get(c.oracleId)?.images || null

function previewProps(c: DeckCard, data: DeckCardData) {
  const show = () => previewStore.set(refOf(c, data))
  const hide = () => previewStore.set(null)
  return { onPointerEnter: show, onPointerLeave: hide, onFocus: show, onBlur: hide }
}

// +1 / −1 and "commander ⇄ deck", shared by the three views.
function Controls({ card, zone, data, actions }: { card: DeckCard; zone: DeckZone; data: DeckCardData; actions: DeckCardActions }) {
  const facts = data.facts.get(card.oracleId)
  const canLead = zone === 'commanders' || (facts ? isEligibleAlone(facts) : false)
  return (
    <span className="row-actions">
      {canLead && (
        <button className="btn ghost tiny" onClick={() => actions.move(card, zone)}>{zone === 'commanders' ? 'Ao deck' : 'Comandante'}</button>
      )}
      {zone === 'cards' && <button className="step-btn" aria-label={`Mais uma cópia de ${card.name}`} onClick={() => actions.add(card, zone)}>+</button>}
      <button className="step-btn" aria-label={`Remover uma cópia de ${card.name}`} onClick={() => actions.remove(card, zone)}>−</button>
    </span>
  )
}

function ListRow({ card, zone, props }: { card: DeckCard; zone: DeckZone; props: ViewProps }) {
  const { data, actions, highlight } = props
  return (
    <li className={`deck-row${highlight.has(card.name) ? ' flagged' : ''}`}>
      <span className="qty">{card.count}</span>
      <button className="link card-name" onClick={() => actions.pickArt(card)} {...previewProps(card, data)} aria-label={`${card.name}: escolher arte`}>
        {card.name}
      </button>
      <span className="mv muted" aria-label="Valor de mana">{data.info.get(card.oracleId)?.manaValue ?? ''}</span>
      <Controls card={card} zone={zone} data={data} actions={actions} />
      {card.tags?.length ? <span className="tag-chips">{card.tags.map((t) => <span key={t} className="tag-chip">{t}</span>)}</span> : null}
    </li>
  )
}

// One card as an image: in a stack only the top strip shows until hovered or focused.
function CardImage({ card, zone, props }: { card: DeckCard; zone: DeckZone; props: ViewProps }) {
  const { data, actions, highlight } = props
  const images = imagesOf(card, data)
  return (
    <li className={`deck-card${highlight.has(card.name) ? ' flagged' : ''}`}>
      <button className="deck-card-face" onClick={() => actions.pickArt(card)} {...previewProps(card, data)}
        aria-label={`${card.count} × ${card.name}: escolher arte`}>
        {images ? <img src={images.small} alt="" loading="lazy" decoding="async" width={146} height={204} /> : <span className="deck-card-name">{card.name}</span>}
        {card.count > 1 && <span className="deck-card-count" aria-hidden="true">×{card.count}</span>}
      </button>
      <Controls card={card} zone={zone} data={data} actions={actions} />
    </li>
  )
}

function Group({ id, label, count, cards, zone, props }: { id: string; label: string; count: number; cards: DeckCard[]; zone: DeckZone; props: ViewProps }) {
  const headingId = `group-${id}`
  return (
    <section className="deck-group" aria-labelledby={headingId}>
      <h2 id={headingId}>{label} <span className="count">{count}</span></h2>
      <ul className={props.mode === 'list' ? 'group-rows' : props.mode === 'stacks' ? 'group-stack' : 'group-grid'}>
        {cards.map((c) => (props.mode === 'list'
          ? <ListRow key={c.oracleId} card={c} zone={zone} props={props} />
          : <CardImage key={c.oracleId} card={c} zone={zone} props={props} />))}
      </ul>
    </section>
  )
}

export function DeckView(props: ViewProps) {
  const { commanders, groups, mode } = props
  return (
    <section className={`deck-view view-${mode}`} aria-label="Cartas do deck">
      {commanders.length
        ? <Group id="commanders" label={commanders.length > 1 ? 'Comandantes' : 'Comandante'} count={commanders.length} cards={commanders} zone="commanders" props={props} />
        : <section className="deck-group"><h2>Comandante</h2><p className="muted">Nenhum ainda. Use a busca para escolher.</p></section>}
      {groups.map((g) => <Group key={g.key} id={g.key.replace(/[^a-z0-9]/gi, '-')} label={g.label} count={g.count} cards={g.cards} zone="cards" props={props} />)}
    </section>
  )
}
