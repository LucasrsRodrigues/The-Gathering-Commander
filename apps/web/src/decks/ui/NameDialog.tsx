// Asks for a short name (new or renamed category). Plain text, bounded like the deck format.

import { useEffect, useRef, useState } from 'react'
import { DECK_LIMITS } from '@gathering-hall/formats'
import { Dialog } from '../../ui/Dialog'

export function NameDialog({ title, label, initial = '', confirm, maxLength = DECK_LIMITS.tagLength, onClose, onSubmit }: {
  title: string; label: string; initial?: string; confirm: string; maxLength?: number; onClose: () => void; onSubmit: (name: string) => void
}) {
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // after the dialog's own focus handling
    const t = setTimeout(() => input.current?.select(), 0)
    return () => clearTimeout(t)
  }, [])
  const name = value.trim()
  return (
    <Dialog title={title} onClose={onClose}>
      <form className="name-form" onSubmit={(e) => {
        e.preventDefault()
        if (!name) return
        onSubmit(name)
        onClose()
      }}>
        <label className="field">{label}
          <input ref={input} value={value} maxLength={maxLength} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </label>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={!name}>{confirm}</button>
        </div>
      </form>
    </Dialog>
  )
}
