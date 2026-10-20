// What follows the pointer during a drag in the editor, and the highlight on the drop target under it.

import { useEffect } from 'react'
import { useStore } from '../../ui/store'
import { dragStore } from './gestures'

export function DragGhost() {
  const drag = useStore(dragStore)
  const over = drag?.over ?? null
  useEffect(() => {
    if (!over) return
    const el = [...document.querySelectorAll<HTMLElement>('[data-drop]')].find((e) => e.dataset.drop === over)
    el?.classList.add('drop-over')
    return () => el?.classList.remove('drop-over')
  }, [over])
  useEffect(() => {
    if (!drag) return
    document.body.classList.add('dragging-card')
    return () => document.body.classList.remove('dragging-card')
  }, [drag])
  if (!drag) return null
  return (
    <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
      {drag.image ? <img src={drag.image} alt="" /> : <span>{drag.label}</span>}
      {drag.count > 1 && <span className="deck-card-count">{drag.count}</span>}
    </div>
  )
}
