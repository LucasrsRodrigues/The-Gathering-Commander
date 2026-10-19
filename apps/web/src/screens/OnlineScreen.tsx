import { useState } from 'react'
import { AppFooter } from '../app/AppNav'
import { ROOM_HASH, SERVER_HTTP } from '../net/config'
import { createRoom, localTokenStore } from '../net/onlineRoom'

export function OnlineScreen({ onEnter }: { onEnter: (roomId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState('')

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const { room, token } = await createRoom(SERVER_HTTP)
      localTokenStore.set(room, token) // the creator is the host of the room
      onEnter(room)
    } catch (err) {
      setError(err instanceof Error && err.message ? `Não foi possível criar a sala: ${err.message}` : 'Servidor fora do ar.')
    } finally {
      setBusy(false)
    }
  }

  function join() {
    const hash = link.trim().slice(link.indexOf('#'))
    const match = ROOM_HASH.exec(hash)
    if (match) onEnter(match[1]!)
    else setError('Esse link não parece ser de uma sala do The Gathering Hall.')
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Jogar online</h1>
          <p className="muted">Crie uma sala e mande o link para o grupo. Cada um joga no seu computador ou tablet, sem conta.</p>
        </div>
      </header>
      <section className="setup-card">
        <div className="row">
          <button className="btn primary big" disabled={busy} onClick={create}>{busy ? 'Criando…' : 'Criar sala'}</button>
        </div>
        <label className="field">Recebeu um link? Cole aqui
          <div className="row">
            <input value={link} maxLength={300} spellCheck={false} placeholder="https://…#/sala/…" onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()} style={{ flex: 1 }} />
            <button className="btn" disabled={!link.trim()} onClick={join}>Entrar</button>
          </div>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <AppFooter />
    </main>
  )
}
