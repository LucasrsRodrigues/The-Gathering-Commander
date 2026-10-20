// Library choices on the table (épico 11, T11.12): the cards a search can find (only those, CR 701.19), or the top
// cards of a scry / surveil. Only the player choosing gets the cards in their view; the others see who is choosing.

import { useState } from 'react'
import type { LibraryChoice, ObjectView, PlayerId, PlayerView } from '@gathering-hall/engine'
import { imagesFor } from '../catalog/catalog'
import { previewStore, showPreview } from '../ui/stores'
import type { Dispatch } from './PlayerPanels'

const WHAT: Record<LibraryChoice['kind'], string> = { searchLibrary: 'buscando no grimório', scry: 'fazendo vidência', surveil: 'vigiando' }

export function LibraryChoicePanel({ view, seat, dispatch }: { view: PlayerView; seat: PlayerId; dispatch: Dispatch }) {
  const p = view.pending
  if (p?.kind !== 'searchLibrary' && p?.kind !== 'scry' && p?.kind !== 'surveil') return null
  if (p.player !== seat) return <div className="combat-panel" role="status"><p className="muted">{view.players[p.player]?.name ?? p.player} está {WHAT[p.kind]}…</p></div>
  const key = `${p.kind}:${p.continueWith.itemId}:${p.cards.join(',')}`
  return p.kind === 'searchLibrary'
    ? <SearchPanel key={key} view={view} choice={p} dispatch={dispatch} />
    : <ArrangePanel key={key} view={view} choice={p} dispatch={dispatch} />
}

function CardButton({ obj, on, onClick, label }: { obj: ObjectView | undefined; on: boolean; onClick: () => void; label?: string }) {
  const img = obj?.card ? imagesFor(obj.card) : null
  return (
    <button className={`pick-card${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}
      onPointerEnter={() => obj?.card && showPreview(obj)} onPointerLeave={() => previewStore.set(null)}
      onFocus={() => obj?.card && showPreview(obj)} onBlur={() => previewStore.set(null)}>
      {img ? <img src={img.small} alt="" width={110} height={153} loading="lazy" /> : null}
      <span>{obj?.card?.name ?? 'Carta'}{label ? <small> · {label}</small> : null}</span>
    </button>
  )
}

function SearchPanel({ view, choice, dispatch }: { view: PlayerView; choice: LibraryChoice; dispatch: Dispatch }) {
  const [chosen, setChosen] = useState<string[]>([])
  // Identical cards (80 Forests) show once, with how many there are; each click takes one more copy.
  const groups = new Map<string, string[]>()
  for (const id of choice.cards) {
    const name = view.objects[id]?.card?.name ?? id
    groups.set(name, [...(groups.get(name) ?? []), id])
  }
  const take = (ids: string[]) => setChosen((l) => {
    const next = ids.find((id) => !l.includes(id))
    if (!next) return l
    return l.length < choice.count ? [...l, next] : choice.count === 1 ? [next] : l
  })
  const where = choice.to === 'split' ? 'a 1ª vai para o campo virada, a 2ª para a mão'
    : choice.to === 'battlefield' ? `vai para o campo${choice.tapped ? ' virada' : ''}` : 'vai para a mão'
  return (
    <div className="combat-panel library-panel" role="dialog" aria-label="Busca no grimório">
      <h3>Busca no grimório</h3>
      <p className="small">Escolha {choice.count === 1 ? 'uma carta' : `até ${choice.count} cartas`}: {where}. Depois o grimório é embaralhado.</p>
      {groups.size ? (
        <ul className="pick-cards" aria-label="Cartas que servem">
          {[...groups].map(([name, ids]) => {
            const picked = ids.filter((id) => chosen.includes(id)).length
            return (
              <li key={name}>
                <CardButton obj={view.objects[ids[0]!]} on={picked > 0} onClick={() => take(ids)}
                  label={`${ids.length > 1 ? `×${ids.length}` : ''}${picked ? `${ids.length > 1 ? ' · ' : ''}${picked} escolhida${picked > 1 ? 's' : ''}` : ''}` || undefined} />
              </li>
            )
          })}
        </ul>
      ) : <p className="muted">Nenhuma carta do grimório serve.</p>}
      {chosen.length > 0 && (
        <p className="small">
          Escolhidas:{' '}
          {chosen.map((id, i) => (
            <button key={id} className="chip-btn on" aria-label={`Tirar ${view.objects[id]?.card?.name ?? 'carta'}`} onClick={() => setChosen((l) => l.filter((x) => x !== id))}>
              {view.objects[id]?.card?.name ?? 'Carta'}{choice.to === 'split' ? (i === 0 ? ' → campo' : ' → mão') : ''} ✕
            </button>
          ))}
        </p>
      )}
      <div className="row">
        <button className="btn" onClick={() => dispatch({ type: 'searchLibrary', objectIds: [] })}>Não encontrar nada</button>
        <button className="btn primary" disabled={!chosen.length} onClick={() => dispatch({ type: 'searchLibrary', objectIds: chosen })}>Confirmar</button>
      </div>
    </div>
  )
}

function ArrangePanel({ view, choice, dispatch }: { view: PlayerView; choice: LibraryChoice; dispatch: Dispatch }) {
  const [top, setTop] = useState<string[]>(choice.cards)
  const away = choice.cards.filter((id) => !top.includes(id))
  const awayLabel = choice.kind === 'scry' ? 'fundo' : 'cemitério'
  const move = (id: string, d: -1 | 1) => setTop((l) => {
    const i = l.indexOf(id)
    const j = i + d
    if (i < 0 || j < 0 || j >= l.length) return l
    const next = [...l]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    return next
  })
  return (
    <div className="combat-panel library-panel" role="dialog" aria-label={choice.kind === 'scry' ? 'Vidência' : 'Vigiar'}>
      <h3>{choice.kind === 'scry' ? `Vidência ${choice.count}` : `Vigiar ${choice.count}`}</h3>
      <p className="small">Clique numa carta para mandá-la para o {awayLabel}. As que ficam voltam ao topo nesta ordem (a primeira é o topo).</p>
      <ul className="pick-cards" aria-label="Cartas olhadas">
        {[...top, ...away].map((id) => {
          const onTop = top.includes(id)
          return (
            <li key={id}>
              <CardButton obj={view.objects[id]} on={!onTop} label={onTop ? `topo ${top.indexOf(id) + 1}` : awayLabel}
                onClick={() => setTop((l) => (onTop ? l.filter((x) => x !== id) : [...l, id]))} />
              {onTop && top.length > 1 && (
                <span className="row">
                  <button className="step-btn" aria-label="Mais para o topo" disabled={top.indexOf(id) === 0} onClick={() => move(id, -1)}>↑</button>
                  <button className="step-btn" aria-label="Mais para baixo" disabled={top.indexOf(id) === top.length - 1} onClick={() => move(id, 1)}>↓</button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <div className="row">
        <button className="btn primary" autoFocus onClick={() => dispatch({ type: 'arrangeTop', top, away })}>Confirmar</button>
      </div>
    </div>
  )
}
