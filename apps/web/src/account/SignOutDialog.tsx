// Signing out (épico 08, req. 16): the account's decks can stay in this browser as a local copy, or go.

import { useState } from 'react'
import { Dialog } from '../ui/Dialog'

export function SignOutDialog({ onClose, onSignOut }: { onClose: () => void; onSignOut: (keepLocal: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const go = async (keep: boolean) => {
    setBusy(true)
    await onSignOut(keep)
    onClose()
  }
  return (
    <Dialog title="Sair da conta" onClose={onClose}>
      <p>Seus decks e regras da casa continuam na conta. E neste navegador?</p>
      <div className="row end">
        <button className="btn" disabled={busy} onClick={() => void go(false)}>Apagar deste navegador</button>
        <button className="btn primary" disabled={busy} autoFocus onClick={() => void go(true)}>Manter uma cópia aqui</button>
      </div>
      <p className="muted small">Num computador que não é seu, prefira apagar.</p>
    </Dialog>
  )
}
