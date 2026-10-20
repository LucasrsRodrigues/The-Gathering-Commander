import { useState } from 'react'
import type { PlayerId, PlayerView } from '@gathering-hall/engine'
import { imagesFor } from '../catalog/catalog'
import { menuStore, previewStore, showPreview } from '../ui/stores'
import { menuAnchor } from './a11y'
import { needsX, playFromHand } from './actions'
import { cardLabel } from './labels'
import type { Dispatch } from './PlayerPanels'

export function HandArea({ view, viewer, dispatch }: { view: PlayerView; viewer: PlayerId; dispatch: Dispatch }) {
  const hand = view.players[viewer]?.hand ?? []
  // Opening-hand decisions only; exceptions and combat declarations have their own UI.
  const pending = view.pending?.player === viewer && (view.pending.kind === 'mulligan' || view.pending.kind === 'bottomCards' || view.pending.kind === 'discard') ? view.pending : null
  const [selected, setSelected] = useState<string[]>([])
  // Picking cards from hand: for the bottom of the library (mulligan) or to discard in cleanup.
  const choosingBottom = pending?.kind === 'bottomCards' || pending?.kind === 'discard'
  const mid = (hand.length - 1) / 2

  function onCard(id: string) {
    if (choosingBottom) {
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < pending.count ? [...s, id] : s))
      return
    }
    const obj = view.objects[id]
    if (!obj || view.status !== 'playing') return
    if (needsX(obj)) {
      const x = askX()
      if (x !== null) dispatch({ type: 'castSpell', objectId: id, x })
      return
    }
    dispatch(playFromHand(obj))
  }

  return (
    <>
      {pending && (
        <div className="mulligan" role="dialog" aria-label={pending.kind === 'discard' ? 'Descarte' : 'Mulligan'}>
          {pending.kind === 'mulligan' ? (
            <>
              <p>
                {view.players[viewer]!.mulligans === 0 ? 'Sua mão inicial.' : `Mulligans: ${view.players[viewer]!.mulligans}.`}{' '}
                {view.ruleset.freeMulligans > view.players[viewer]!.mulligans && 'O próximo mulligan é grátis.'}
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => dispatch({ type: 'keepHand' })}>Manter</button>
                <button className="btn" onClick={() => dispatch({ type: 'mulligan' })}>Mulligan</button>
              </div>
            </>
          ) : pending.kind === 'discard' ? (
            <>
              <p>Fim do turno: descarte {pending.count} carta(s) para ficar com {view.ruleset.maxHandSize} ({selected.length}/{pending.count}).</p>
              {/* Fewer cards (an effect like "no maximum hand size") goes through the rules dialog and its exception. */}
              <button className="btn primary" disabled={selected.length > pending.count}
                onClick={() => {
                  dispatch({ type: 'discard', objectIds: selected })
                  setSelected([])
                }}>
                Descartar
              </button>
            </>
          ) : (
            <>
              <p>Escolha {pending.count} carta(s) para o fundo do grimório ({selected.length}/{pending.count}).</p>
              <button className="btn primary" disabled={selected.length !== pending.count}
                onClick={() => {
                  dispatch({ type: 'bottomCards', objectIds: selected })
                  setSelected([])
                }}>
                Confirmar
              </button>
            </>
          )}
        </div>
      )}
      <div className="hand" role="group" aria-label={!choosingBottom ? 'Sua mão' : pending?.kind === 'discard' ? 'Sua mão: escolha as cartas para descartar' : 'Sua mão: escolha as cartas para o fundo'}>
        {hand.map((id, i) => {
          const obj = view.objects[id]
          const img = imagesFor(obj?.card ?? null)
          const openMenu = (point: { x: number; y: number }) => menuStore.set({ target: { kind: 'object', objectId: id }, ...point })
          return (
            <button key={id}
              className={`hand-card${selected.includes(id) ? ' selected' : ''}`}
              style={{ transform: `translateY(${Math.abs(i - mid) * 6}px) rotate(${(i - mid) * 4}deg)` }}
              aria-label={cardLabel(obj)}
              aria-pressed={choosingBottom ? selected.includes(id) : undefined}
              aria-haspopup={choosingBottom ? undefined : 'menu'}
              aria-keyshortcuts={choosingBottom ? undefined : 'M Shift+F10'}
              onPointerEnter={(e) => e.pointerType === 'mouse' && obj?.card && showPreview(obj)}
              onPointerLeave={() => previewStore.set(null)}
              onFocus={() => obj?.card && showPreview(obj)}
              onBlur={() => previewStore.set(null)}
              onClick={() => onCard(id)}
              onKeyDown={(e) => {
                if (!choosingBottom && (e.key === 'm' || e.key === 'M')) {
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  openMenu({ x: r.right, y: r.top })
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                // detail is 0 for right clicks too; only the (0, 0) of the context-menu key counts as keyboard.
                openMenu(menuAnchor({ clientX: e.clientX, clientY: e.clientY, detail: 1 }, e.currentTarget.getBoundingClientRect()))
              }}>
              {img ? <img src={img.normal} alt="" draggable={false} /> : <span>{obj?.card?.name}</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}

// {X} spells: the value is chosen as the spell is cast (CR 601.2b).
function askX(): number | null {
  const raw = prompt('Valor de X (0 a 100):', '0')
  if (raw === null) return null
  const x = Number(raw)
  return Number.isInteger(x) && x >= 0 && x <= 100 ? x : null
}
