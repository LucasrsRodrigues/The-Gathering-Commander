import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { blocks, type Violation } from '@gathering-hall/formats'
import type { LobbySeat } from '@gathering-hall/protocol'
import type { Services } from '../app/services'
import { imagesFor } from '../catalog/catalog'
import type { Deck } from '../decks/model'
import { SAMPLE_DECKS } from '../decks/samples'
import { roomLink, SERVER_WS } from '../net/config'
import { OnlineRoom, type SocketLike } from '../net/onlineRoom'
import { prepareSeatDeck, type SeatDeck } from '../session/prepareGame'
import { Dialog } from '../ui/Dialog'
import { toast } from '../ui/stores'

const GameScreen = lazy(() => import('./GameScreen').then((m) => ({ default: m.GameScreen })))

const noop = () => () => {}
const zero = () => 0

export function RoomScreen({ services, roomId, onLeave }: { services: Services; roomId: string; onLeave: () => void }) {
  // The connection lives in an effect so it is always closed when leaving (and survives StrictMode's double run).
  const [room, setRoom] = useState<OnlineRoom | null>(null)
  useEffect(() => {
    const r = new OnlineRoom(roomId, { url: SERVER_WS, connect: (url) => new WebSocket(url) as unknown as SocketLike })
    // oxlint-disable-next-line react/set-state-in-effect -- the socket is an external system opened on mount
    setRoom(r)
    return () => r.close()
  }, [roomId])
  useSyncExternalStore(room?.subscribe ?? noop, room?.getVersion ?? zero)
  if (!room) return <main className="page"><p className="muted" role="status">Entrando na sala…</p></main>
  return <RoomView room={room} services={services} roomId={roomId} onLeave={onLeave} />
}

function RoomView({ room, services, roomId, onLeave }: { room: OnlineRoom; services: Services; roomId: string; onLeave: () => void }) {
  const snap = room.snapshot()
  const [sitting, setSitting] = useState<LobbySeat | null>(null)

  useEffect(() => {
    // Cards of other players were never resolved on this device: fetch their images once.
    const requested = new Set<string>()
    const onState = (view: Parameters<OnlineRoom['onState']>[0]) => {
      const missing = Object.values(view.objects)
        .flatMap((o) => (o.card?.scryfallId && !imagesFor(o.card) && !requested.has(o.card.scryfallId) ? [o.card.scryfallId] : []))
      if (!missing.length) return
      missing.forEach((id) => requested.add(id))
      services.catalog.resolvePrintings(missing).then(() => room.touch(), () => {})
    }
    room.setHandlers({ onError: (m) => toast(m), onState })
  }, [room, services])

  if (snap.error) {
    return (
      <main className="page">
        <section className="empty">
          <h2>Não deu para entrar</h2>
          <p className="muted">{snap.error}</p>
          <button className="btn primary" onClick={onLeave}>Voltar</button>
        </section>
      </main>
    )
  }

  const lobby = snap.lobby
  const me = snap.welcome
  // A game view means the game is on (or just ended); the lobby only comes back on a rematch.
  if (snap.view) {
    return (
      <Suspense fallback={<div className="loading">Montando a mesa…</div>}>
        <GameScreen session={room} onExit={onLeave} onRematch={me?.host ? () => room.rematch() : undefined} />
      </Suspense>
    )
  }

  if (!lobby || !me) {
    return <main className="page"><p className="muted" role="status">{snap.connection === 'offline' ? 'Sem conexão com o servidor; tentando de novo…' : 'Entrando na sala…'}</p></main>
  }

  const seated = lobby.seats.filter((s) => s.taken).length
  const presets = services.presets.list()

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Sala online · {snap.connection === 'online' ? 'conectado' : 'reconectando…'}</p>
          <h1>Mesa de Commander</h1>
          <p className="muted">Regras: <b>{lobby.preset.name}</b>{me.host ? ' · você é quem organiza a sala' : ''}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigator.clipboard.writeText(roomLink(roomId)).then(() => toast('Link copiado. Mande no grupo!'), () => toast(roomLink(roomId)))}>
            Copiar link de convite
          </button>
          <button className="btn ghost" onClick={onLeave}>Sair</button>
        </div>
      </header>

      <section className="setup-card">
        {me.host && (
          <div className="field-row">
            <label className="field inline" style={{ marginLeft: 0 }}>Regras da partida
              <select value={presets.some((p) => p.id === lobby.preset.id) ? lobby.preset.id : ''}
                onChange={(e) => room.configure(services.presets.get(e.target.value))}>
                {!presets.some((p) => p.id === lobby.preset.id) && <option value="">{lobby.preset.name}</option>}
                {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <ul className="room-seats">
          {lobby.seats.map((s) => {
            const mine = me.seat === s.index
            return (
              <li key={s.index} className={`room-seat${s.taken ? ' taken' : ''}${mine ? ' mine' : ''}`}>
                <span className="muted small">Lugar {s.index + 1}</span>
                {s.taken ? (
                  <>
                    <strong>{s.name}{mine ? ' (você)' : ''}</strong>
                    <span className="muted small">{s.commanders.join(' + ') || 'sem comandante'} · {s.deckSize} cartas</span>
                    <span className={`dot ${s.connected ? 'on' : 'off'}`}>{s.connected ? 'conectado' : 'desconectado'}</span>
                    {mine && <button className="btn ghost tiny" onClick={() => room.stand()}>Sair do lugar</button>}
                  </>
                ) : (
                  <button className="btn" onClick={() => setSitting(s)}>{me.seat === null ? 'Sentar aqui' : 'Mudar para cá'}</button>
                )}
              </li>
            )
          })}
        </ul>
        <div className="setup-actions">
          {me.host ? (
            <button className="btn primary big" disabled={seated < 2} onClick={() => room.start()}>
              {seated < 2 ? 'Esperando jogadores…' : `Começar com ${seated} jogadores`}
            </button>
          ) : (
            <p className="muted">{me.seat === null ? 'Escolha um lugar livre.' : 'Esperando quem organiza a sala começar.'}</p>
          )}
        </div>
      </section>

      {sitting && (
        <SitDialog services={services} seat={sitting} preset={lobby.preset} onClose={() => setSitting(null)}
          onSit={(name, input) => {
            room.sit(sitting.index, name, input)
            setSitting(null)
          }} />
      )}
    </main>
  )
}

function SitDialog({ services, seat, preset, onClose, onSit }: {
  services: Services
  seat: LobbySeat
  preset: Parameters<typeof prepareSeatDeck>[1]
  onClose: () => void
  onSit: (name: string, input: Awaited<ReturnType<typeof prepareSeatDeck>>['input']) => void
}) {
  const [saved, setSaved] = useState<Deck[]>([])
  const [name, setName] = useState(() => localStorage.getItem('gh-nickname') ?? '')
  const [source, setSource] = useState(`sample:${SAMPLE_DECKS[seat.index % SAMPLE_DECKS.length]!.id}`)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<Violation[]>([])

  useEffect(() => {
    services.decks.list().then((d) => {
      setSaved(d)
      if (d[0]) setSource(`saved:${d[0].id}`)
    })
  }, [services])

  async function sit() {
    const choice: SeatDeck | null = source.startsWith('saved:')
      ? (() => { const deck = saved.find((d) => `saved:${d.id}` === source); return deck ? { kind: 'saved' as const, deck } : null })()
      : { kind: 'sample', sampleId: source.slice(7) }
    if (!choice || !name.trim()) return
    setBusy(true)
    try {
      const prepared = await prepareSeatDeck(choice, preset, services.catalog, Date.now(), services.legality)
      if (blocks(prepared.violations)) {
        setProblems(prepared.violations.filter((v) => v.level === 'block'))
        return
      }
      try { localStorage.setItem('gh-nickname', name.trim()) } catch { /* optional */ }
      prepared.violations.forEach((v) => toast(v.message))
      onSit(name.trim().slice(0, 24), prepared.input)
    } catch {
      setProblems([{ rule: 'unknownCard', level: 'block', message: 'Não foi possível carregar as cartas do Scryfall.', cards: [] }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Lugar ${seat.index + 1}`} onClose={onClose}>
      <label className="field">Seu nome na mesa
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
      </label>
      <label className="field">Deck
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          {saved.length > 0 && <optgroup label="Meus decks">{saved.map((d) => <option key={d.id} value={`saved:${d.id}`}>{d.name}</option>)}</optgroup>}
          <optgroup label="Exemplos">{SAMPLE_DECKS.map((d) => <option key={d.id} value={`sample:${d.id}`}>{d.title}</option>)}</optgroup>
        </select>
      </label>
      <p className="muted small">O deck é conferido com as regras "{preset.name}" antes de sentar.</p>
      {problems.length > 0 && (
        <div className="blocked" role="alert"><ul>{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul></div>
      )}
      <div className="row end">
        <button className="btn primary" disabled={busy || !name.trim()} onClick={sit}>{busy ? 'Conferindo o deck…' : 'Sentar'}</button>
      </div>
    </Dialog>
  )
}
