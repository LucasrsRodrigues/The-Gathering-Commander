import type { BracketSuggestion, Preset, Violation } from '@gathering-hall/formats'
import type { DeckStats } from '../model'

const COLOR_LABELS = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde', C: 'Incolor' } as const

export function DeckSidebar({ stats, deckSizeTarget, violations, bracket, presets, presetId, onPreset, selected, onSelectViolation }: {
  stats: DeckStats
  deckSizeTarget: number
  violations: Violation[]
  bracket: BracketSuggestion
  presets: Preset[]
  presetId: string
  onPreset: (id: string) => void
  selected: number | null
  onSelectViolation: (i: number | null) => void
}) {
  const peak = Math.max(1, ...stats.curve)
  const blocking = violations.filter((v) => v.level === 'block').length
  return (
    <aside className="deck-side">
      <section className="side-card">
        <div className="big-count">
          <span className={stats.total === deckSizeTarget ? 'ok' : ''}>{stats.total}</span>/{deckSizeTarget}
        </div>
        <p className="muted small">{stats.lands} terrenos · valor de mana médio {stats.averageManaValue}</p>
        <table className="curve" aria-label="Curva de mana (cartas que não são terreno)">
          <tbody>
            <tr>
              {stats.curve.map((n, mv) => (
                <td key={mv}>
                  <div className="bar" style={{ height: `${(n / peak) * 100}%` }} />
                  <span className="sr-only">{n} carta(s) de valor {mv === 7 ? '7 ou mais' : mv}</span>
                </td>
              ))}
            </tr>
            <tr aria-hidden="true">{stats.curve.map((n, mv) => <th key={mv}>{mv === 7 ? '7+' : mv}<small>{n || ''}</small></th>)}</tr>
          </tbody>
        </table>
        <ul className="color-counts" aria-label="Cartas por cor">
          {(Object.keys(COLOR_LABELS) as (keyof typeof COLOR_LABELS)[]).filter((c) => stats.colors[c]).map((c) => (
            <li key={c} className={`pip pip-${c}`}>{COLOR_LABELS[c]} <b>{stats.colors[c]}</b></li>
          ))}
        </ul>
      </section>

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
    </aside>
  )
}
