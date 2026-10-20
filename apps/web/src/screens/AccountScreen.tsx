// "Minha conta" (épico 08, req. 5, 9, 10): who you are, which providers are linked, your data, and the way out.

import { useState } from 'react'
import { LOGIN_ERRORS, PROVIDER_LABELS, type AccountClient } from '../account/client'
import { AppFooter } from '../app/AppNav'
import { useStore } from '../ui/store'
import { toast } from '../ui/stores'

const CONFIRM = 'excluir minha conta'

export function AccountScreen({ client, error, onSignOut }: { client: AccountClient; error: string | null; onSignOut: () => void }) {
  const state = useStore(client.state)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const errorText = error ? (LOGIN_ERRORS[error] ?? 'Não foi possível entrar. Tente de novo.') : null

  async function remove() {
    setBusy(true)
    const result = await client.deleteAccount(confirm.trim())
    setBusy(false)
    if (result.ok) toast('Conta excluída. Seus decks neste navegador continuam aqui.')
    else toast(result.error)
  }

  return (
    <main className="page account-page">
      <header className="page-head">
        <div>
          <h1>Minha conta</h1>
          <p className="muted">Opcional. Tudo no jogo funciona sem conta.</p>
        </div>
      </header>
      {errorText && <p className="error" role="alert">{errorText}</p>}
      {state.status === 'loading' && <p className="muted">Carregando…</p>}
      {state.status === 'off' && <p>As contas não estão ligadas neste servidor. Dá para jogar e salvar decks neste navegador normalmente.</p>}
      {state.status === 'anonymous' && (
        <section className="setup-card">
          <p>Você joga e salva decks neste navegador sem conta. Entrando, seus decks e regras da casa ficam disponíveis em
            qualquer aparelho, e as partidas online ficam no seu histórico.</p>
          <div className="row">
            {state.providers.map((p) => <a key={p} className="btn primary" href={client.startUrl(p)}>Entrar com {PROVIDER_LABELS[p]}</a>)}
          </div>
          <p className="muted small">Guardamos só o id da conta no provedor, o nome e a foto. Nada de e-mail nem senha.</p>
        </section>
      )}
      {state.status === 'signedIn' && (
        <>
          <section className="setup-card account-who">
            {state.account.avatarUrl && <img src={state.account.avatarUrl} alt="" width={56} height={56} referrerPolicy="no-referrer" />}
            <div>
              <h2>{state.account.name}</h2>
              <p className="muted small">Entra com {state.account.providers.map((p) => PROVIDER_LABELS[p]).join(' e ')}.</p>
            </div>
          </section>
          {state.providers.some((p) => !state.account.providers.includes(p)) && (
            <section className="setup-card">
              <h2>Outras formas de entrar</h2>
              <div className="row">
                {state.providers.filter((p) => !state.account.providers.includes(p)).map((p) => (
                  <a key={p} className="btn" href={client.startUrl(p)}>Ligar {PROVIDER_LABELS[p]}</a>
                ))}
              </div>
            </section>
          )}
          <section className="setup-card">
            <h2>Seus dados</h2>
            <p className="muted small">Guardamos só o id da conta em cada provedor, o nome, a foto e as sessões abertas.</p>
            <div className="row">
              <a className="btn" href={client.exportUrl()} download>Baixar meus dados</a>
              <button className="btn" onClick={onSignOut}>Sair</button>
            </div>
          </section>
          <section className="setup-card danger">
            <h2>Excluir conta</h2>
            <p>Apaga a conta e tudo o que ela guarda no servidor, e sai de todos os aparelhos. Os decks salvos neste navegador
              continuam aqui. Não dá para desfazer.</p>
            <label className="field">Para confirmar, digite <b>{CONFIRM}</b>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </label>
            <div className="row">
              <button className="btn danger" disabled={busy || confirm.trim() !== CONFIRM} onClick={() => void remove()}>Excluir minha conta</button>
            </div>
          </section>
        </>
      )}
      <AppFooter />
    </main>
  )
}
