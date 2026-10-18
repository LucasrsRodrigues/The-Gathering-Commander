import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlayerView } from '@gathering-hall/engine'
import { imagesFor } from '../catalog/catalog'
import { ZONE_LABELS } from '../session/describe'
import type { LogEntry } from '../session/GameSession'
import { menuStore, previewStore, toastStore, zoneViewerStore } from '../ui/stores'
import { useStore } from '../ui/store'
import { libraryMenu, menuFor, type MenuGroup } from './actions'
import type { Dispatch } from './PlayerPanels'

export function CardPreview() {
  const card = useStore(previewStore)
  if (!card) return null
  const img = imagesFor(card)
  return img ? <img className="preview" src={img.large} alt={card.name} /> : (
    <div className="preview placeholder"><strong>{card.name}</strong><span>{card.typeLine}</span></div>
  )
}

export function CardMenu({ view, dispatch }: { view: PlayerView; dispatch: Dispatch }) {
  const menu = useStore(menuStore)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  // Keep the menu fully on screen: measure it, then clamp to the viewport.
  useLayoutEffect(() => {
    const el = ref.current
    if (!menu || !el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    })
  }, [menu])

  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
  }, [menu])

  if (!menu) return null
  let title = ''
  let groups: MenuGroup[] = []
  if (menu.target.kind === 'library') {
    title = 'Grimório'
    groups = libraryMenu()
  } else {
    const obj = view.objects[menu.target.objectId]
    if (!obj) return null
    title = obj.card?.name ?? 'Carta virada para baixo'
    groups = menuFor(obj)
  }
  return (
    <div ref={ref} className="card-menu" role="menu" aria-label={title} style={pos}
      onKeyDown={(e) => {
        if (e.key === 'Escape') menuStore.set(null)
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const buttons = [...(ref.current?.querySelectorAll('button') ?? [])]
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
          buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
        }
      }}>
      <div className="menu-title">{title}</div>
      {groups.map((g, gi) => (
        <div key={gi} className="menu-group">
          {g.title && <div className="menu-subtitle">{g.title}</div>}
          {g.items.map((item) => (
            <button key={item.label} role="menuitem" onClick={() => {
              menuStore.set(null)
              dispatch(item.action)
            }}>{item.label}</button>
          ))}
        </div>
      ))}
    </div>
  )
}

export function ZoneViewer({ view }: { view: PlayerView }) {
  const open = useStore(zoneViewerStore)
  if (!open) return null
  const player = view.players[open.seat]
  const ids = player ? [...player[open.zone]].reverse() : []
  return (
    <div className="zone-viewer" role="dialog" aria-label={`${ZONE_LABELS[open.zone]} de ${player?.name}`}
      onKeyDown={(e) => e.key === 'Escape' && zoneViewerStore.set(null)}>
      <header>
        <h2>{ZONE_LABELS[open.zone]} · {player?.name} <span className="count">{ids.length}</span></h2>
        <button className="btn ghost" autoFocus onClick={() => zoneViewerStore.set(null)}>Fechar</button>
      </header>
      {ids.length === 0 ? <p className="muted">Nenhuma carta.</p> : (
        <div className="zone-grid">
          {ids.map((id) => {
            const obj = view.objects[id]
            const img = imagesFor(obj?.card ?? null)
            return (
              <button key={id} className="zone-card" aria-label={obj?.card?.name ?? 'Carta'}
                onPointerEnter={() => obj?.card && previewStore.set(obj.card)}
                onPointerLeave={() => previewStore.set(null)}
                onClick={(e) => menuStore.set({ target: { kind: 'object', objectId: id }, x: e.clientX, y: e.clientY })}>
                {img ? <img src={img.small} alt="" /> : <span>{obj?.card?.name}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Curtain({ name, onReady }: { name: string; onReady: () => void }) {
  return (
    <div className="curtain" role="dialog" aria-label="Troca de jogador">
      <p className="eyebrow">Modo de mesa compartilhada</p>
      <h2>Passe o dispositivo para {name}</h2>
      <p className="muted">A mão de {name} fica escondida até {name} confirmar.</p>
      <button className="btn primary" autoFocus onClick={onReady}>Sou {name}, mostrar</button>
    </div>
  )
}

export function Toasts() {
  const toasts = useStore(toastStore)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  )
}

export function GameLog({ entries }: { entries: LogEntry[] }) {
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [entries])
  return (
    // Collapsed by default on tablet-sized screens so it doesn't cover the table.
    <details className="game-log" open={window.innerWidth >= 1280}>
      <summary>Registro</summary>
      <ol ref={ref}>
        {entries.slice(-80).map((e) => <li key={e.id}>{e.text}</li>)}
      </ol>
    </details>
  )
}
