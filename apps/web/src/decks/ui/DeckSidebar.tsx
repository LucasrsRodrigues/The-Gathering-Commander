import type { ReactNode } from 'react'
import type { BracketSuggestion, Preset, Violation } from '@gathering-hall/formats'
import type { DeckStats, StatFilter } from '../model'
import { StatsCard } from './StatsCard'

export function DeckSidebar({ stats, deckSizeTarget, violations, bracket, presets, presetId, onPreset, selected, onSelectViolation, statFilter, onStatFilter, children }: {
  stats: DeckStats
  deckSizeTarget: number
  violations: Violation[]
  bracket: BracketSuggestion
  presets: Preset[]
  presetId: string
  onPreset: (id: string) => void
  selected: number | null
  onSelectViolation: (i: number | null) => void
  statFilter: StatFilter | null
  onStatFilter: (f: StatFilter | null) => void
  children?: ReactNode // more cards at the end (categories)
}) {
  const blocking = violations.filter((v) => v.level === 'block').length
  return (
    <aside className="deck-side">
      <StatsCard stats={stats} deckSizeTarget={deckSizeTarget} filter={statFilter} onFilter={onStatFilter} />

      <section className="side-card">
        <label className="field">Validar com as regras
          <select value={presetId} onChange={(e) => onPreset(e.target.value)}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {violations.length === 0 ? <p className="ok-text">✓ Deck válido para essas regras.</p> : (
          <>
            <p className={blocking ? 'error' : 'muted'}>
              {blocking ? `${blocking} problema(s) impedem jogar com essas regras.` : 'Só avisos: dá para jogar.'}
            </p>
            <ul className="violations">
              {violations.map((v, i) => (
                <li key={i}>
                  <button className={`violation ${v.level}${selected === i ? ' selected' : ''}`} aria-pressed={selected === i}
                    onClick={() => onSelectViolation(selected === i ? null : i)}>
                    <span className="badge">{v.level === 'block' ? 'bloqueia' : 'aviso'}</span> {v.message}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="side-card">
        <h2>Bracket sugerido <span className="bracket">{bracket.bracket}</span></h2>
        <ul className="reasons">{bracket.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </section>
      {children}
    </aside>
  )
}
