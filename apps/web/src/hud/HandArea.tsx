import { useState } from 'react'
import type { PlayerId, PlayerView } from '@gathering-hall/engine'
import { imagesFor } from '../catalog/catalog'
import { menuStore, previewStore } from '../ui/stores'
import { playFromHand } from './actions'
import type { Dispatch } from './PlayerPanels'

export function HandArea({ view, viewer, dispatch }: { view: PlayerView; viewer: PlayerId; dispatch: Dispatch }) {
  const hand = view.players[viewer]?.hand ?? []
  const pending = view.pending?.player === viewer ? view.pending : null
  const [selected, setSelected] = useState<string[]>([])
  const choosingBottom = pending?.kind === 'bottomCards'
  const mid = (hand.length - 1) / 2

  function onCard(id: string) {
    if (choosingBottom) {
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < pending.count ? [...s, id] : s))
      return
    }
    const obj = view.objects[id]
    if (obj && view.status === 'playing') dispatch(playFromHand(obj))
  }

  return (
    <>
      {pending && (
        <div className="mulligan" role="dialog" aria-label="Mulligan">
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
      <div className="hand" aria-label="Sua mão">
        {hand.map((id, i) => {
          const obj = view.objects[id]
          const img = imagesFor(obj?.card ?? null)
          return (
            <button key={id}
              className={`hand-card${selected.includes(id) ? ' selected' : ''}`}
              style={{ transform: `translateY(${Math.abs(i - mid) * 6}px) rotate(${(i - mid) * 4}deg)` }}
              aria-label={obj?.card?.name ?? 'Carta'}
              onPointerEnter={(e) => e.pointerType === 'mouse' && obj?.card && previewStore.set(obj.card)}
              onPointerLeave={() => previewStore.set(null)}
              onClick={() => onCard(id)}
              onContextMenu={(e) => {
                e.preventDefault()
                menuStore.set({ target: { kind: 'object', objectId: id }, x: e.clientX, y: e.clientY })
              }}>
              {img ? <img src={img.normal} alt="" draggable={false} /> : <span>{obj?.card?.name}</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}
