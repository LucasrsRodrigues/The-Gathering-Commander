// "Compartilhar" (épico 10, req. 25, 28): a public, read-only link to the deck. It needs an account (the page reads the
// deck from the cloud) and can be turned off at any time; turning it on again makes a new link.

import { useEffect, useState } from 'react'
import type { AccountClient } from '../../account/client'
import type { CloudSync } from '../../account/cloudSync'
import { Dialog } from '../../ui/Dialog'
import { useStore } from '../../ui/store'
import { toast } from '../../ui/stores'
import { publicDeckUrl, type ShareClient } from '../shareClient'

export function ShareDialog({ deckId, account, cloud, shares, onOpenAccount, onClose }: {
  deckId: string
  account: AccountClient
  cloud: CloudSync | undefined
  shares: ShareClient
  onOpenAccount: () => void
  onClose: () => void
}) {
  const state = useStore(account.state)
  const [slug, setSlug] = useState<string | null | undefined>(undefined) // undefined = loading
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signedIn = state.status === 'signedIn'

  useEffect(() => {
    if (!signedIn) return
    let live = true
    shares.linkOf(deckId).then((s) => live && setSlug(s), () => live && setSlug(null))
    return () => { live = false }
  }, [signedIn, deckId, shares])

  async function turnOn() {
    setBusy(true)
    setError(null)
    try {
      await cloud?.sync() // the page reads the cloud: send this deck first
      const r = await shares.share(deckId)
      if (r.ok) setSlug(r.slug)
      else setError(r.message)
    } catch {
      setError('Sem conexão com o servidor. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    const ok = await shares.unshare(deckId).catch(() => false)
    setBusy(false)
    if (ok) {
      setSlug(null)
      toast('Link desligado. Quem tinha o link não vê mais o deck.')
    } else setError('Não deu para desligar agora. Tente de novo.')
  }

  const url = slug ? publicDeckUrl(slug) : ''
  return (
    <Dialog title="Compartilhar deck" onClose={onClose}>
      {state.status === 'off' && <p>Os links públicos precisam das contas, que não estão ligadas neste servidor. Dá para mandar a lista pelo "Exportar lista".</p>}
      {state.status === 'loading' && <p className="muted">Carregando…</p>}
      {state.status === 'anonymous' && (
        <>
          <p>Para criar um link público, entre na conta: a página do link lê o deck da nuvem. Sem conta, use "Exportar lista" e mande o texto.</p>
          <div className="row end"><button className="btn primary" onClick={() => { onClose(); onOpenAccount() }}>Entrar</button></div>
        </>
      )}
      {signedIn && (
        slug === undefined ? <p className="muted">Carregando…</p> : slug ? (
          <>
            <p>Qualquer pessoa com o link vê o deck (só para ler) e pode copiar para os próprios decks. A página mostra sempre a versão
              atual e o seu nome de exibição.</p>
            <label className="field">Link público
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <div className="row">
              <button className="btn primary" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copiado.'), () => toast('Não deu para copiar; selecione o link.'))}>Copiar link</button>
              <a className="btn" href={url} target="_blank" rel="noreferrer">Abrir</a>
              <button className="btn danger" disabled={busy} onClick={() => void turnOff()}>Desligar link</button>
            </div>
          </>
        ) : (
          <>
            <p>Crie um link para mostrar o deck a outras pessoas. Elas não precisam de conta. A página mostra o comandante, as cartas por
              categoria, as estatísticas, a descrição e o seu nome de exibição, mas não as pastas nem o histórico.</p>
            <div className="row end"><button className="btn primary" disabled={busy} onClick={() => void turnOn()}>{busy ? 'Criando…' : 'Criar link público'}</button></div>
          </>
        )
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Dialog>
  )
}
