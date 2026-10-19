import { useEffect, useState } from 'react'
import { MAX_PLAYERS, type GameState } from '@gathering-hall/engine'
import { OFFICIAL_PRESET_ID } from '@gathering-hall/formats'
import { AppFooter } from '../app/AppNav'
import type { Services } from '../app/services'
import type { Deck } from '../decks/model'
import { SAMPLE_DECKS } from '../decks/samples'
import { prepareGame, randomSeed, type SeatChoice, type SeatReport } from '../session/prepareGame'

interface Seat {
  name: string
  source: string // 'saved:<id>' | 'sample:<id>' | 'text'
  text: string
}

const DEFAULT_NAMES = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4']

export function SetupScreen({ services, onStart, onManagePresets }: {
  services: Services
  onStart: (game: GameState, notes: string[]) => void
  onManagePresets: () => void
}) {
  const [saved, setSaved] = useState<Deck[]>([])
  const [count, setCount] = useState(4)
  const [seats, setSeats] = useState<Seat[]>(
    DEFAULT_NAMES.map((name, i) => ({ name, source: `sample:${SAMPLE_DECKS[i % SAMPLE_DECKS.length]!.id}`, text: '' })),
  )
  const presets = services.presets.list()
  const [presetId, setPresetId] = useState(OFFICIAL_PRESET_ID)
  const [status, setStatus] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<SeatReport[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    services.decks.list().then((decks) => {
      setSaved(decks)
      // With saved decks, the first seat defaults to the most recent one.
      if (decks[0]) setSeats((s) => s.map((seat, i) => (i === 0 ? { ...seat, source: `saved:${decks[0]!.id}` } : seat)))
    })
  }, [services])

  const update = (i: number, patch: Partial<Seat>) => setSeats((s) => s.map((seat, k) => (k === i ? { ...seat, ...patch } : seat)))

  function choiceFor(seat: Seat): SeatChoice | null {
    const name = seat.name.trim() || 'Jogador'
    if (seat.source.startsWith('saved:')) {
      const deck = saved.find((d) => `saved:${d.id}` === seat.source)
      return deck ? { name, deck: { kind: 'saved', deck } } : null
    }
    if (seat.source.startsWith('sample:')) return { name, deck: { kind: 'sample', sampleId: seat.source.slice(7) } }
    return seat.text.trim() ? { name, deck: { kind: 'text', text: seat.text } } : null
  }

  async function start() {
    const choices = seats.slice(0, count).map(choiceFor)
    if (choices.some((c) => !c)) {
      setStatus('Cada lugar precisa de um deck.')
      return
    }
    setBusy(true)
    setBlocked([])
    setStatus('Buscando cartas no Scryfall e conferindo os decks…')
    try {
      const preset = services.presets.get(presetId)
      const result = await prepareGame(choices as SeatChoice[], preset, services.catalog, randomSeed(), Date.now(), true, services.legality)
      if (!result.ok) {
        setBlocked(result.reports.filter((r) => r.violations.some((v) => v.level === 'block')))
        setStatus(`Algum deck não passa nas regras "${preset.name}".`)
        return
      }
      const notes = result.reports.flatMap((r) => [...r.notes, ...r.violations.map((v) => v.message)].map((n) => `${r.name}: ${n}`))
      onStart(result.game, notes)
    } catch {
      setStatus('Não foi possível carregar as cartas. Verifique a conexão e tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page setup">
      <header className="setup-head">
        <p className="eyebrow">Commander · mesa sandbox</p>
        <h1>Montar a mesa</h1>
        <p className="muted">Escolha os decks e jogue no mesmo dispositivo. Com 1 lugar, você testa o deck sozinho.</p>
      </header>

      <section className="setup-card">
        <div className="field-row">
          <span className="field-label">Lugares</span>
          <div className="seg" role="group" aria-label="Número de lugares">
            {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map((n) => (
              <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>
            ))}
          </div>
          <label className="field inline">Regras
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button className="link" onClick={onManagePresets}>Gerenciar regras</button>
        </div>

        <div className="seats">
          {seats.slice(0, count).map((seat, i) => (
            <fieldset key={i} className="seat">
              <legend>Lugar {i + 1}</legend>
              <label>Nome
                <input value={seat.name} maxLength={24} onChange={(e) => update(i, { name: e.target.value })} />
              </label>
              <label>Deck
                <select value={seat.source} onChange={(e) => update(i, { source: e.target.value })}>
                  {saved.length > 0 && (
                    <optgroup label="Meus decks">
                      {saved.map((d) => <option key={d.id} value={`saved:${d.id}`}>{d.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Exemplos">
                    {SAMPLE_DECKS.map((d) => <option key={d.id} value={`sample:${d.id}`}>{d.title}</option>)}
                  </optgroup>
                  <option value="text">Colar uma lista…</option>
                </select>
              </label>
              {seat.source === 'text' && (
                <label>Lista (Moxfield, Archidekt…)
                  <textarea rows={6} value={seat.text} maxLength={12000} spellCheck={false}
                    placeholder={'Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Sol Ring\n35 Mountain'}
                    onChange={(e) => update(i, { text: e.target.value })} />
                </label>
              )}
            </fieldset>
          ))}
        </div>

        {blocked.length > 0 && (
          <div className="blocked" role="alert">
            {blocked.map((r) => (
              <div key={r.name}>
                <strong>{r.name}</strong>
                <ul>{r.violations.filter((v) => v.level === 'block').map((v, k) => <li key={k}>{v.message}</li>)}</ul>
              </div>
            ))}
          </div>
        )}

        <div className="setup-actions">
          <button className="btn primary big" disabled={busy} onClick={start}>{busy ? 'Preparando…' : 'Começar partida'}</button>
          {status && <p className="muted" role="status">{status}</p>}
        </div>
      </section>
      <AppFooter />
    </main>
  )
}
