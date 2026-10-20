// The account corner of the top bar (épico 08): "Entrar" when the server has login, the avatar and a menu when signed
// in, nothing at all when accounts are off. Never in the way of playing.

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../ui/store'
import { PROVIDER_LABELS, type AccountClient } from './client'

export function AccountNav({ client, onOpenAccount, onOpenGames, onSignOut }: {
  client: AccountClient; onOpenAccount: () => void; onOpenGames: () => void; onSignOut: () => void
}) {
  const state = useStore(client.state)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  if (state.status === 'loading' || state.status === 'off') return null
  return (
    <div className="account-nav" ref={ref}>
      {state.status === 'anonymous' ? (
        <button className="btn ghost small" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Entrar</button>
      ) : (
        <button className="account-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          {state.account.avatarUrl ? <img src={state.account.avatarUrl} alt="" width={24} height={24} referrerPolicy="no-referrer" /> : <span className="avatar-fallback" aria-hidden="true">{state.account.name[0]}</span>}
          <span>{state.account.name}</span>
        </button>
      )}
      {open && (
        <div className="account-menu" role="menu">
          {state.status === 'anonymous' ? (
            <>
              <p className="muted small">Opcional: guarda seus decks na nuvem. Para jogar, não precisa.</p>
              {state.providers.map((p) => (
                <a key={p} role="menuitem" className="btn" href={client.startUrl(p)}>Entrar com {PROVIDER_LABELS[p]}</a>
              ))}
            </>
          ) : (
            <>
              <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); onOpenAccount() }}>Minha conta</button>
              <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); onOpenGames() }}>Minhas partidas</button>
              <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); onSignOut() }}>Sair</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
