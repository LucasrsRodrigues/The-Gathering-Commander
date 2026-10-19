// Accessible modal dialog: focus moves in, Tab stays inside, Escape closes, focus returns to the opener.

import { useEffect, useRef, type ReactNode } from 'react'
import { focusables, trapTab, useRestoreFocus } from '../hud/a11y'

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useRestoreFocus(true)
  useEffect(() => {
    focusables(ref.current)[0]?.focus()
  }, [])
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          trapTab(e, ref.current)
        }}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="btn ghost" onClick={onClose}>Fechar</button>
        </header>
        {children}
      </div>
    </div>
  )
}
