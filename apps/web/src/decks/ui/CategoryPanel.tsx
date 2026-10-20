// Categories in the editor's side panel (épico 10, req. 7, 8): the deck's categories (order, rename, delete, new) and
// the suggestions read from the Oracle text, accepted one by one or all at once. Nothing changes without a click.

import { useState } from 'react'
import type { Suggestion } from '../tags'

export function CategoryPanel({ categories, suggestions, onNew, onRename, onDelete, onMove, onAccept, onAcceptAll, onShow }: {
  categories: { name: string; count: number }[]
  suggestions: Suggestion[]
  onNew: () => void
  onRename: (name: string) => void
  onDelete: (name: string) => void
  onMove: (name: string, delta: -1 | 1) => void
  onAccept: (s: Suggestion, tag: string) => void
  onAcceptAll: () => void
  onShow: (name: string) => void // highlight the cards of a category
}) {
  const [open, setOpen] = useState(false)
  const total = suggestions.reduce((n, s) => n + s.tags.length, 0)
  return (
    <section className="side-card categories" aria-labelledby="categories-title">
      <h2 id="categories-title">Categorias</h2>
      {categories.length === 0
        ? <p className="muted small">Nenhuma ainda. Crie uma, aceite as sugestões abaixo ou use o menu da carta (⋯).</p>
        : (
          <ul className="category-list">
            {categories.map((c, i) => (
              <li key={c.name}>
                <button className="link category-name" onClick={() => onShow(c.name)} aria-label={`${c.name}: destacar as cartas`}>{c.name}</button>
                <span className="count">{c.count}</span>
                <span className="row-actions">
                  <button className="step-btn" aria-label={`Subir ${c.name}`} disabled={i === 0} onClick={() => onMove(c.name, -1)}>↑</button>
                  <button className="step-btn" aria-label={`Descer ${c.name}`} disabled={i === categories.length - 1} onClick={() => onMove(c.name, 1)}>↓</button>
                  <button className="btn ghost tiny" onClick={() => onRename(c.name)}>Renomear</button>
                  <button className="btn ghost tiny danger-text" aria-label={`Excluir a categoria ${c.name}`} onClick={() => onDelete(c.name)}>Excluir</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      <div className="row">
        <button className="btn small" onClick={onNew}>Nova categoria</button>
      </div>

      {total > 0 && (
        <div className="suggestions">
          <div className="row">
            <button className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? '▾' : '▸'} {total} sugest{total > 1 ? 'ões' : 'ão'} pelo texto das cartas
            </button>
            <button className="btn small" onClick={onAcceptAll}>Aceitar todas</button>
          </div>
          {open && (
            <ul className="suggestion-list">
              {suggestions.map((s) => (
                <li key={`${s.zone}:${s.oracleId}`}>
                  <span>{s.name}</span>
                  <span className="row-actions">
                    {s.tags.map((t) => <button key={t} className="btn ghost tiny" onClick={() => onAccept(s, t)} aria-label={`${s.name}: aceitar ${t}`}>+ {t}</button>)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
