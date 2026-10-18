import { useState } from 'react'
import { createGame, MAX_PLAYERS, type GameState } from '@gathering-hall/engine'
import type { CatalogPort } from '../catalog/catalog'
import { parseDecklist } from '../decks/parseDecklist'
import { SAMPLE_DECKS, sampleDecklist } from '../decks/samples'
import { FanContentNotice } from '../legal/FanContentNotice'
import { buildDeck } from '../session/buildDeck'

interface Seat {
  name: string
  deckId: string // a sample id or 'custom'
  custom: string
}

const DEFAULT_NAMES = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4']

export function SetupScreen({ catalog, onStart, onAbout }: {
  catalog: CatalogPort
  onStart: (game: GameState, notes: string[]) => void
  onAbout: () => void
}) {
  const [count, setCount] = useState(4)
  const [seats, setSeats] = useState<Seat[]>(
    DEFAULT_NAMES.map((name, i) => ({ name, deckId: SAMPLE_DECKS[i % SAMPLE_DECKS.length]!.id, custom: '' })),
  )
  const [life, setLife] = useState(40)
  const [restrict, setRestrict] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const update = (i: number, patch: Partial<Seat>) => setSeats((s) => s.map((seat, k) => (k === i ? { ...seat, ...patch } : seat)))

  async function start() {
    setBusy(true)
    setStatus('Buscando cartas no Scryfall…')
    try {
      const active = seats.slice(0, count)
      const parsed = active.map((s) => parseDecklist(s.deckId === 'custom' ? s.custom : sampleDecklist(s.deckId)))
      const problems = parsed.flatMap((p, i) => p.errors.map((e) => `${active[i]!.name}: ${e}`))
      if (parsed.some((p) => p.cards.length === 0)) {
        setStatus('Cada lugar precisa de um deck com cartas.')
        return
      }
      const names = parsed.flatMap((p) => [...p.commanders, ...p.cards].map((e) => e.name))
      const { found, missing } = await catalog.resolve(names, (done, total) => setStatus(`Buscando cartas no Scryfall… ${done}/${total}`))
      const decks = parsed.map((p) => buildDeck(p, found))
      const notes = [
        ...problems,
        ...decks.flatMap((d, i) => (d.note ? [`${active[i]!.name}: ${d.note}`] : [])),
        ...(missing.length ? [`Não encontradas (entram como cartas genéricas): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`] : []),
      ]
      const game = createGame({
        seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
        ruleset: { startingLife: life, restrictToController: restrict },
        players: active.map((s, i) => ({ id: `p${i + 1}`, name: s.name.trim() || `Jogador ${i + 1}`, deck: decks[i]! })),
      })
      onStart(game, notes)
    } catch (err) {
      setStatus(`Não foi possível carregar as cartas (${err instanceof Error ? err.message : 'erro'}). Verifique a conexão e tente de novo.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="setup">
      <header className="setup-head">
        <p className="eyebrow">Commander · mesa sandbox</p>
        <h1>The Gathering Hall</h1>
        <p className="muted">Monte a mesa, escolha os decks e jogue no mesmo dispositivo. Com 1 lugar, você testa o deck sozinho.</p>
      </header>

      <section className="setup-card">
        <div className="field-row">
          <span className="field-label">Lugares</span>
          <div className="seg" role="group" aria-label="Número de lugares">
            {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map((n) => (
              <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>
            ))}
          </div>
        </div>

        <div className="seats">
          {seats.slice(0, count).map((seat, i) => (
            <fieldset key={i} className="seat">
              <legend>Lugar {i + 1}</legend>
              <label>Nome
                <input value={seat.name} maxLength={24} onChange={(e) => update(i, { name: e.target.value })} />
              </label>
              <label>Deck
                <select value={seat.deckId} onChange={(e) => update(i, { deckId: e.target.value })}>
                  {SAMPLE_DECKS.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                  <option value="custom">Colar minha lista…</option>
                </select>
              </label>
              {seat.deckId === 'custom' && (
                <label>Lista (texto do Moxfield, Archidekt…)
                  <textarea rows={6} value={seat.custom} maxLength={12000} spellCheck={false}
                    placeholder={'Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Sol Ring\n35 Mountain'}
                    onChange={(e) => update(i, { custom: e.target.value })} />
                </label>
              )}
            </fieldset>
          ))}
        </div>

        <details className="house-rules">
          <summary>Regras da casa</summary>
          <label>Vida inicial
            <input type="number" min={1} max={999} value={life} onChange={(e) => setLife(Math.max(1, Math.min(999, Number(e.target.value) || 40)))} />
          </label>
          <label className="check">
            <input type="checkbox" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} />
            Só o controlador mexe nas próprias permanentes
          </label>
        </details>

        <div className="setup-actions">
          <button className="btn primary big" disabled={busy} onClick={start}>{busy ? 'Preparando…' : 'Começar partida'}</button>
          {status && <p className="muted" role="status">{status}</p>}
        </div>
      </section>

      <footer className="setup-foot">
        <button className="link" onClick={onAbout}>Sobre e aviso legal</button>
        <FanContentNotice />
      </footer>
    </main>
  )
}
