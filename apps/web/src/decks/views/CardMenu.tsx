// The card menu in the editor (épico 10, req. 7): right click, long press or the "⋯" button. Every drag has its
// menu twin here, so nothing needs a pointer. Keyboard: arrows, Home/End, Escape, Tab stays inside.

import { useLayoutEffect, useRef, useState } from 'react'
import { focusables, trapTab, useFocusFirst, useRestoreFocus, wrapIndex } from '../../hud/a11y'

export interface MenuItem {
  label: string
  run: () => void
  danger?: boolean
}

export interface MenuSection {
  title?: string
  items: MenuItem[]
}

export function CardMenu({ title, x, y, sections, onClose }: { title: string; x: number; y: number; sections: MenuSection[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)) })
  }, [x, y])
  useRestoreFocus(true)
  useFocusFirst(ref, title)

  useLayoutEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [onClose])

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
          e.stopPropagation()
          onClose()
        } else if (e.key === 'ArrowDown') go(wrapIndex(i, 1, items.length))
        else if (e.key === 'ArrowUp') go(wrapIndex(i, -1, items.length))
        else if (e.key === 'Home') go(0)
        else if (e.key === 'End') go(items.length - 1)
        else trapTab(e, ref.current)
      }}>
      <div className="menu-title" aria-hidden="true">{title}</div>
      {sections.filter((s) => s.items.length).map((s, si) => (
        <div key={si} className="menu-group" role="group" aria-label={s.title}>
          {s.title && <div className="menu-subtitle" aria-hidden="true">{s.title}</div>}
          {s.items.map((item) => (
            <button key={item.label} role="menuitem" className={item.danger ? 'danger-text' : undefined}
              onClick={() => {
                onClose()
                item.run()
              }}>{item.label}</button>
          ))}
        </div>
      ))}
    </div>
  )
}
