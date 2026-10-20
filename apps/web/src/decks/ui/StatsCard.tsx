// The stats panel (épico 10, req. 11, 12): curve (with or without lands), averages, cost symbols and sources per
// color, types and main categories. Every number is a button: it highlights the cards it counts in the deck.

import { useState, type ReactNode } from 'react'
import type { Color } from '@gathering-hall/formats'
import { TYPE_GROUPS, type DeckStats, type StatFilter, type TypeGroup } from '../model'

const COLOR_LABELS: Record<Color | 'C', string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde', C: 'Incolor' }
const TYPE_LABELS: Record<TypeGroup, string> = { ...Object.fromEntries(TYPE_GROUPS), other: 'Outros' } as Record<TypeGroup, string>
const same = (a: StatFilter | null, b: StatFilter) => !!a && JSON.stringify(a) === JSON.stringify(b)

function Stat({ f, active, onPick, children, className = '' }: {
  f: StatFilter; active: StatFilter | null; onPick: (f: StatFilter) => void; children: ReactNode; className?: string
}) {
  return <button className={`stat-btn ${className}`} aria-pressed={same(active, f)} onClick={() => onPick(f)}>{children}</button>
}

export function StatsCard({ stats, deckSizeTarget, filter, onFilter }: {
  stats: DeckStats
  deckSizeTarget: number
  filter: StatFilter | null
  onFilter: (f: StatFilter | null) => void
}) {
  const [withLands, setWithLands] = useState(false)
  const curve = stats.curve.map((n, mv) => (withLands && mv === 0 ? n + stats.lands : n))
  const peak = Math.max(1, ...curve)
  const pick = (f: StatFilter) => onFilter(same(filter, f) ? null : f)
  const colors = (['W', 'U', 'B', 'R', 'G'] as Color[]).filter((c) => stats.pips[c] || stats.sources[c])

  return (
    <section className="side-card stats-card" aria-labelledby="stats-title">
      <h2 id="stats-title" className="sr-only">Estatísticas</h2>
      <div className="big-count">
        <span className={stats.total === deckSizeTarget ? 'ok' : ''}>{stats.total}</span>/{deckSizeTarget}
      </div>
      <p className="muted small">
        <Stat active={filter} onPick={pick} f={{ kind: 'type', group: 'land' }} className="inline">{stats.lands} terrenos</Stat>
        {' · '}valor de mana médio {withLands ? stats.averageWithLands : stats.averageManaValue}
      </p>
      <table className="curve" aria-label={`Curva de mana${withLands ? ' com terrenos' : ' (cartas que não são terreno)'}`}>
        <tbody>
          <tr>
            {curve.map((n, mv) => (
              <td key={mv}>
                <button className="curve-bar" aria-pressed={same(filter, { kind: 'mv', mv, ...(withLands && mv === 0 ? { withLands: true } : {}) })}
                  onClick={() => pick({ kind: 'mv', mv, ...(withLands && mv === 0 ? { withLands: true } : {}) })}
                  aria-label={`${n} carta(s) de valor ${mv === 7 ? '7 ou mais' : mv}: destacar`}>
                  <span className="bar" style={{ height: `${(n / peak) * 100}%` }} />
                </button>
              </td>
            ))}
          </tr>
          <tr aria-hidden="true">{curve.map((n, mv) => <th key={mv}>{mv === 7 ? '7+' : mv}<small>{n || ''}</small></th>)}</tr>
        </tbody>
      </table>
      <label className="check small">
        <input type="checkbox" checked={withLands} onChange={(e) => setWithLands(e.target.checked)} /> Curva com terrenos
      </label>

      {colors.length > 0 && (
        <table className="color-table">
          <thead><tr><th scope="col">Cor</th><th scope="col">Símbolos no custo</th><th scope="col">Fontes</th></tr></thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c}>
                <th scope="row"><span className={`pip pip-${c}`}>{COLOR_LABELS[c]}</span></th>
                <td><Stat active={filter} onPick={pick} f={{ kind: 'pip', color: c }}>{stats.pips[c]}</Stat></td>
                <td><Stat active={filter} onPick={pick} f={{ kind: 'source', color: c }} className={stats.pips[c] && !stats.sources[c] ? 'warn' : ''}>{stats.sources[c]}</Stat></td>
              </tr>
            ))}
            {stats.sources.C > 0 && (
              <tr><th scope="row"><span className="pip pip-C">Incolor</span></th><td>—</td><td><Stat active={filter} onPick={pick} f={{ kind: 'source', color: 'C' }}>{stats.sources.C}</Stat></td></tr>
            )}
          </tbody>
        </table>
      )}

      <ul className="stat-list" aria-label="Cartas por tipo">
        {(Object.keys(stats.types) as TypeGroup[]).map((g) => (
          <li key={g}><Stat active={filter} onPick={pick} f={{ kind: 'type', group: g }}>{TYPE_LABELS[g]} <b>{stats.types[g]}</b></Stat></li>
        ))}
      </ul>
      {stats.categories.length > 0 && (
        <ul className="stat-list" aria-label="Cartas por categoria principal">
          {stats.categories.map((c) => (
            <li key={c.name}><Stat active={filter} onPick={pick} f={{ kind: 'category', name: c.name }}>{c.name} <b>{c.count}</b></Stat></li>
          ))}
        </ul>
      )}
      {filter && <button className="btn ghost tiny" onClick={() => onFilter(null)}>Tirar o destaque</button>}
    </section>
  )
}
