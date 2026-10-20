import { manaItems } from './mana'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlayerView } from '@gathering-hall/engine'
import { imagesFor } from '../catalog/catalog'
import { ZONE_LABELS } from '../session/describe'
import type { LogEntry } from '../session/GameSession'
import { closeTopmost, dismissToast, menuStore, previewStore, toastStore, zoneViewerStore } from '../ui/stores'
import { useStore } from '../ui/store'
import { libraryMenu, menuFor, type MenuGroup } from './actions'
import { cardLabel, zoneIds } from './labels'
import { focusables, menuAnchor, trapTab, useFocusFirst, useRestoreFocus, wrapIndex } from './a11y'
import type { Dispatch } from './PlayerPanels'

export { CardPreview } from './CardPreview'

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

  useRestoreFocus(!!menu)
  useFocusFirst(ref, menu)

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
    const mana = manaItems(view, view.viewer, obj)
    groups = [...(mana.length ? [{ title: obj.summoningSick ? 'Mana (acabou de chegar)' : 'Mana', items: mana }] : []), ...menuFor(obj)]
  }
  return (
    <div ref={ref} className="card-menu" role="menu" aria-label={title} style={pos}
      onKeyDown={(e) => {
        const items = focusables(ref.current)
        const i = items.indexOf(document.activeElement as HTMLElement)
        const go = (index: number) => {
          e.preventDefault()
          items[index]?.focus()
        }
        if (e.key === 'Escape') {
          // Only the menu closes; the zone viewer under it stays open.
          e.stopPropagation()
          menuStore.set(null)
        } else if (e.key === 'ArrowDown') go(wrapIndex(i, 1, items.length))
        else if (e.key === 'ArrowUp') go(wrapIndex(i, -1, items.length))
        else if (e.key === 'Home') go(0)
        else if (e.key === 'End') go(items.length - 1)
        else trapTab(e, ref.current)
      }}>
      <div className="menu-title" aria-hidden="true">{title}</div>
      {groups.map((g, gi) => (
        <div key={gi} className="menu-group" role="group" aria-label={g.title}>
          {g.title && <div className="menu-subtitle" aria-hidden="true">{g.title}</div>}
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
  const ref = useRef<HTMLDivElement>(null)
  useRestoreFocus(!!open)
  useFocusFirst(ref, open)
  if (!open) return null
  const player = view.players[open.seat]
  const ids = zoneIds(view, open.seat, open.zone)
  const label = `${ZONE_LABELS[open.zone]} de ${player?.name}`
  return (
    <div ref={ref} className="zone-viewer" role="dialog" aria-modal="true" aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          closeTopmost()
        } else trapTab(e, ref.current)
      }}>
      <header>
        <h2>{ZONE_LABELS[open.zone]} · {player?.name} <span className="count">{ids.length}</span></h2>
        <button className="btn ghost" onClick={() => zoneViewerStore.set(null)}>Fechar</button>
      </header>
      {ids.length === 0 ? <p className="muted">Nenhuma carta.</p> : (
        <ul className="zone-grid" aria-label={`${ids.length} carta(s)`}>
          {ids.map((id) => {
            const obj = view.objects[id]
            const img = imagesFor(obj?.card ?? null)
            const show = () => obj?.card && previewStore.set(obj.card)
            const hide = () => previewStore.set(null)
            return (
              <li key={id}>
                <button className="zone-card" aria-label={cardLabel(obj)} aria-haspopup="menu"
                  onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}
                  onClick={(e) => menuStore.set({
                    target: { kind: 'object', objectId: id },
                    ...menuAnchor(e, e.currentTarget.getBoundingClientRect()),
                  })}>
                  {img ? <img src={img.small} alt="" /> : <span>{obj?.card?.name}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function Curtain({ name, onReady }: { name: string; onReady: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="curtain" role="dialog" aria-modal="true" aria-labelledby="curtain-title"
      onKeyDown={(e) => trapTab(e, ref.current)}>
      <p className="eyebrow">Modo de mesa compartilhada</p>
      <h2 id="curtain-title">Passe o dispositivo para {name}</h2>
      <p className="muted">A mão de {name} fica escondida até {name} confirmar.</p>
      <button className="btn primary" autoFocus onClick={onReady}>Sou {name}, mostrar</button>
    </div>
  )
}

export function Toasts() {
  const toasts = useStore(toastStore)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.action ? ' has-action' : ''}`}>
          {t.text}
          {t.action && (
            <button className="link" onClick={() => {
              dismissToast(t.id)
              t.action!.run()
            }}>{t.action.label}</button>
          )}
        </div>
      ))}
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
