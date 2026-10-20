// The deck in the editor (épico 10, req. 4, 7, 9): the same groups in three views — list (the accessible reference),
// stacks (overlapping cards, Moxfield style) and grid — plus the "Talvez" list. Images load lazily in Scryfall's
// small size, and groups off screen are skipped by the browser (content-visibility).
//
// Each card: click → art; Shift/Ctrl/⌘+click (or "Selecionar" mode) → selection; right click, long press or "⋯" →
// menu; drag → another category group (when grouped by category), the Talvez list or back to the deck.

import type { CardRef } from '@gathering-hall/engine'
import { isEligibleAlone } from '@gathering-hall/formats'
import type { MouseEvent } from 'react'
import { previewStore } from '../../ui/stores'
import { imagesOf, type DeckCardData } from '../cardData'
import type { DeckCard, DeckZone } from '../model'
import { useCardGestures } from './gestures'
import { cardKey, dropForCategory, type CardGroup, type DeckViewMode, type GroupBy } from './grouping'

export interface DeckCardActions {
  add: (card: DeckCard, zone: DeckZone) => void
  remove: (card: DeckCard, zone: DeckZone) => void
  move: (card: DeckCard, from: DeckZone) => void
  pickArt: (card: DeckCard) => void
  select: (card: DeckCard, zone: DeckZone) => void // toggles
  menu: (card: DeckCard, zone: DeckZone, x: number, y: number) => void
  moveTo: (card: DeckCard, from: DeckZone, to: DeckZone) => void // every copy
  drop: (card: DeckCard, zone: DeckZone, target: string) => void
}


interface ViewProps {
  mode: DeckViewMode
  groupBy: GroupBy
  commanders: DeckCard[]
  groups: CardGroup[]
  maybe: DeckCard[]
  data: DeckCardData
  actions: DeckCardActions
  highlight: Set<string> // card names involved in the selected violation
  selected: Set<string> // cardKey
  selecting: boolean // "Selecionar" mode: taps select
  maybeOpen: boolean
  onToggleMaybe: () => void
  readOnly?: boolean // the public page: no controls, no editing
}

const refOf = (c: DeckCard, data: DeckCardData): CardRef =>
  (c.scryfallId && data.printings.get(c.scryfallId)?.ref) || data.byOracle.get(c.oracleId)?.ref || { name: c.name }

function previewProps(c: DeckCard, data: DeckCardData) {
  const show = () => previewStore.set(refOf(c, data))
  const hide = () => previewStore.set(null)
  return { onPointerEnter: (e: { pointerType: string }) => e.pointerType === 'mouse' && show(), onPointerLeave: hide, onFocus: show, onBlur: hide }
}

// Click, selection, menu and drag for one card.
function useCardHandlers(card: DeckCard, zone: DeckZone, props: ViewProps) {
  const { actions, selecting, selected, data } = props
  const gestures = useCardGestures({
    onMenu: (x, y) => actions.menu(card, zone, x, y),
    onDragStart: () => {
      const many = selected.has(cardKey(zone, card.oracleId)) ? selected.size : 1
      return { label: many > 1 ? `${many} cartas` : card.name, image: imagesOf(card, data)?.small ?? null, count: many }
    },
    onDrop: (target) => actions.drop(card, zone, target),
  })
  const { consumeClick, ...pointer } = gestures
  const onClick = (e: MouseEvent) => {
    if (consumeClick()) return
    if (selecting || e.shiftKey || e.ctrlKey || e.metaKey) actions.select(card, zone)
    else actions.pickArt(card)
  }
  return { ...pointer, onClick }
}

// "⋯", +1 / −1 and "commander ⇄ deck", shared by the three views.
function Controls({ card, zone, props }: { card: DeckCard; zone: DeckZone; props: ViewProps }) {
  if (props.readOnly) return null
  const { data, actions } = props
  const facts = data.facts.get(card.oracleId)
  const canLead = zone === 'commanders' || (zone === 'cards' && facts ? isEligibleAlone(facts) : false)
  return (
    <span className="row-actions">
      <button className="step-btn more-btn" aria-haspopup="menu" aria-label={`Mais ações para ${card.name}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          actions.menu(card, zone, r.left, r.bottom + 4)
        }}>⋯</button>
      {canLead && (
        <button className="btn ghost tiny" onClick={() => actions.move(card, zone)}>{zone === 'commanders' ? 'Ao deck' : 'Comandante'}</button>
      )}
      {zone === 'cards' && (
        <button className="btn ghost tiny" aria-label={`Mover ${card.name} para o Talvez`} onClick={() => actions.moveTo(card, 'cards', 'maybe')}>Talvez</button>
      )}
      {zone === 'maybe' && (
        <button className="btn ghost tiny to-deck" aria-label={`Mover ${card.name} para o deck`} onClick={() => actions.moveTo(card, 'maybe', 'cards')}>Ao deck</button>
      )}
      {zone !== 'commanders' && <button className="step-btn" aria-label={`Mais uma cópia de ${card.name}`} onClick={() => actions.add(card, zone)}>+</button>}
      <button className="step-btn" aria-label={`Remover uma cópia de ${card.name}`} onClick={() => actions.remove(card, zone)}>−</button>
    </span>
  )
}

function classes(card: DeckCard, zone: DeckZone, props: ViewProps, base: string) {
  const flagged = props.highlight.has(card.name) ? ' flagged' : ''
  const chosen = props.selected.has(cardKey(zone, card.oracleId)) ? ' selected' : ''
  return `${base}${flagged}${chosen}`
}

function ListRow({ card, zone, props }: { card: DeckCard; zone: DeckZone; props: ViewProps }) {
  const handlers = useCardHandlers(card, zone, props)
  const isSelected = props.selected.has(cardKey(zone, card.oracleId))
  return (
    <li className={classes(card, zone, props, 'deck-row')}>
      <span className="qty">{card.count}</span>
      <button className="link card-name" {...handlers} {...previewProps(card, props.data)} aria-pressed={props.selecting ? isSelected : undefined}
        aria-label={props.selecting ? `${card.name}: selecionar` : `${card.name}: escolher arte`} aria-keyshortcuts="Shift+F10">
        {card.name}
      </button>
      <span className="mv muted" aria-label="Valor de mana">{props.data.info.get(card.oracleId)?.manaValue ?? ''}</span>
      <Controls card={card} zone={zone} props={props} />
      {card.tags?.length ? <span className="tag-chips">{card.tags.map((t) => <span key={t} className="tag-chip">{t}</span>)}</span> : null}
    </li>
  )
}

// One card as an image: in a stack only the top strip shows until hovered or focused.
function CardImage({ card, zone, props }: { card: DeckCard; zone: DeckZone; props: ViewProps }) {
  const handlers = useCardHandlers(card, zone, props)
  const images = imagesOf(card, props.data)
  const isSelected = props.selected.has(cardKey(zone, card.oracleId))
  return (
    <li className={classes(card, zone, props, 'deck-card')}>
      <button className="deck-card-face" {...handlers} {...previewProps(card, props.data)} aria-pressed={props.selecting ? isSelected : undefined}
        aria-label={`${card.count} × ${card.name}: ${props.selecting ? 'selecionar' : 'escolher arte'}`} aria-keyshortcuts="Shift+F10">
        {images ? <img src={images.small} alt="" loading="lazy" decoding="async" draggable={false} width={146} height={204} /> : <span className="deck-card-name">{card.name}</span>}
        {card.count > 1 && <span className="deck-card-count" aria-hidden="true">×{card.count}</span>}
      </button>
      <Controls card={card} zone={zone} props={props} />
    </li>
  )
}

function Group({ id, label, count, cards, zone, drop, props }: {
  id: string; label: string; count: number; cards: DeckCard[]; zone: DeckZone; drop?: string; props: ViewProps
}) {
  const headingId = `group-${id}`
  return (
    <section className="deck-group" aria-labelledby={headingId} data-drop={drop}>
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
  const { commanders, groups, mode, maybe } = props
  const maybeCount = maybe.reduce((n, c) => n + c.count, 0)
  return (
    <div className="deck-area">
      <section className={`deck-view view-${mode}`} aria-label="Cartas do deck">
        {commanders.length
          ? <Group id="commanders" label={commanders.length > 1 ? 'Comandantes' : 'Comandante'} count={commanders.length} cards={commanders} zone="commanders" props={props} />
          : <section className="deck-group"><h2>Comandante</h2><p className="muted">Nenhum ainda. Use a busca para escolher.</p></section>}
        {groups.map((g) => (
          <Group key={g.key} id={g.key.replace(/[^a-z0-9]/gi, '-')} label={g.label} count={g.count} cards={g.cards} zone="cards" props={props}
            drop={props.groupBy === 'category' ? dropForCategory(g.label) : 'zone:cards'} />
        ))}
        {groups.length === 0 && <section className="deck-group" data-drop="zone:cards"><p className="muted">O deck está vazio. Busque cartas à esquerda.</p></section>}
      </section>
      <section className="maybe-board" data-drop="zone:maybe" aria-labelledby="maybe-title">
        <h2 id="maybe-title">
          <button className="link maybe-toggle" aria-expanded={props.maybeOpen} onClick={props.onToggleMaybe}>
            {props.maybeOpen ? '▾' : '▸'} Talvez <span className="count">{maybeCount}</span>
          </button>
          <span className="muted small">{props.readOnly ? 'cartas que o dono está considerando' : 'fora da validação e da partida'}</span>
        </h2>
        {props.maybeOpen && (maybe.length
          ? <ul className={mode === 'list' ? 'group-rows' : 'group-grid maybe-grid'}>
            {maybe.map((c) => (mode === 'list'
              ? <ListRow key={c.oracleId} card={c} zone="maybe" props={props} />
              : <CardImage key={c.oracleId} card={c} zone="maybe" props={props} />))}
          </ul>
          : <p className="muted small">{props.readOnly ? 'Vazio.' : 'Arraste cartas para cá, ou use o menu da carta (⋯) → "Mover para o Talvez".'}</p>)}
      </section>
    </div>
  )
}
