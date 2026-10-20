// "Minhas partidas" (épico 08, req. 19): the account's finished online games, newest first, a page at a time.

import { useCallback, useEffect, useState } from 'react'
import type { AccountClient, GameSummary } from '../account/client'
import { AppFooter } from '../app/AppNav'
import { LOSS_LABELS } from '../session/describe'
import { useStore } from '../ui/store'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })

function minutes(game: GameSummary) {
  const m = Math.max(1, Math.round((game.endedAt - game.startedAt) / 60_000))
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

function result(game: GameSummary): { label: string; tone: 'win' | 'loss' | 'none' } {
  const me = game.players.find((p) => p.you)
  if (!me) return { label: '—', tone: 'none' }
  if (me.won) return { label: game.players.filter((p) => p.won).length > 1 ? 'Empate' : 'Vitória', tone: 'win' }
  return { label: 'Derrota', tone: 'loss' }
}

export function MatchHistoryScreen({ client }: { client: AccountClient }) {
  const state = useStore(client.state)
  const [games, setGames] = useState<GameSummary[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading')
  const signedIn = state.status === 'signedIn'

  const fetchPage = useCallback((cursor: string | null) => client.games(cursor).then((page) => {
    if (!page) return setStatus('error')
    setGames((g) => (cursor ? [...g, ...page.games] : page.games))
    setNext(page.next)
    setStatus('idle')
  }), [client])
  const load = (cursor: string | null) => {
    setStatus('loading')
    void fetchPage(cursor)
  }

  useEffect(() => {
    if (signedIn) void fetchPage(null)
  }, [signedIn, fetchPage])

  return (
    <main className="page account-page">
      <header className="page-head">
        <div>
          <h1>Minhas partidas</h1>
          <p className="muted">As partidas online que você terminou com a conta.</p>
        </div>
      </header>
      {state.status === 'loading' && <p className="muted">Carregando…</p>}
      {(state.status === 'off' || state.status === 'anonymous') && (
        <p>{state.status === 'off' ? 'As contas não estão ligadas neste servidor.' : 'Entre na conta para guardar o histórico das partidas online.'}</p>
      )}
      {signedIn && (
        <>
          {status === 'error' && <p className="error" role="alert">Não foi possível carregar as partidas. <button className="btn small" onClick={() => load(null)}>Tentar de novo</button></p>}
          {status !== 'loading' && status !== 'error' && games.length === 0 && (
            <p className="muted">Nenhuma partida ainda. Quando uma partida online terminar, ela aparece aqui.</p>
          )}
          <ol className="match-list">
            {games.map((g) => {
              const r = result(g)
              return (
                <li key={g.id} className="setup-card match">
                  <div className="match-head">
                    <span className={`match-result ${r.tone}`}>{r.label}</span>
                    <span className="muted small">{dateFormat.format(g.endedAt)} · {minutes(g)} · {g.preset}</span>
                  </div>
                  <ul className="match-players">
                    {g.players.map((p) => (
                      <li key={p.seat} className={p.you ? 'you' : undefined}>
                        <b>{p.name}{p.you ? ' (você)' : ''}</b>
                        <span className="muted small">{p.commanders.join(' e ') || 'sem comandante'}</span>
                        <span className="small">{p.won ? 'venceu' : (LOSS_LABELS as Record<string, string>)[p.lossReason ?? ''] ?? 'perdeu'}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
          {next && <button className="btn" disabled={status === 'loading'} onClick={() => load(next)}>Mostrar mais</button>}
          {status === 'loading' && <p className="muted">Carregando…</p>}
        </>
      )}
      <AppFooter />
    </main>
  )
}
