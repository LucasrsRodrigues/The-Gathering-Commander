import { useEffect, useRef, useState } from 'react'
import type { Color } from '@gathering-hall/formats'
import type { CatalogCard, CatalogPort } from '../../catalog/catalog'
import { previewStore } from '../../ui/stores'
import { effectiveQuery } from '../searchQuery'

const DEBOUNCE_MS = 350

// Results go to the deck or to the Talvez list (épico 10, req. 9); Shift+Enter or Shift+click sends to the other one.
export function SearchPanel({ catalog, commanderMode, identity, countOf, maybeCountOf, toMaybe, onToMaybe, onAdd }: {
  catalog: CatalogPort
  commanderMode: boolean
  identity: Color[] | null
  countOf: (oracleId: string) => number
  maybeCountOf: (oracleId: string) => number
  toMaybe: boolean
  onToMaybe: (v: boolean) => void
  onAdd: (card: CatalogCard, toMaybe: boolean) => void
}) {
  const [text, setText] = useState('')
  const [sameIdentity, setSameIdentity] = useState(true)
  const [results, setResults] = useState<CatalogCard[]>([])
  const [status, setStatus] = useState('')
  const controller = useRef<AbortController | null>(null)
  const query = effectiveQuery(text, commanderMode, identity, sameIdentity)

  useEffect(() => {
    controller.current?.abort()
    if (!query) return
    const ctrl = new AbortController()
    controller.current = ctrl
    const timer = setTimeout(async () => {
      setStatus('Buscando…')
      try {
        const page = await catalog.search(query, { signal: ctrl.signal })
        if (ctrl.signal.aborted) return
        setResults(page.cards)
        setStatus(page.total ? `${page.total} resultado(s)${page.total > page.cards.length ? `, mostrando ${page.cards.length}` : ''}` : 'Nenhuma carta encontrada.')
      } catch {
        if (!ctrl.signal.aborted) setStatus('Sem conexão com o Scryfall. Seus decks continuam abertos; a busca volta quando a conexão voltar.')
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query, catalog])

  return (
    <section className="search-panel" aria-label="Buscar cartas">
      <label className="field">
        {commanderMode ? 'Escolha o comandante' : 'Adicionar cartas'}
        <input type="search" value={text} maxLength={300} spellCheck={false}
          placeholder={commanderMode ? 'Nome do comandante…' : 'Nome ou busca do Scryfall (ex.: t:creature mv<=2)'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query && results[0]) {
              e.preventDefault()
              onAdd(results[0], !commanderMode && toMaybe !== e.shiftKey)
            }
          }} />
      </label>
      {!commanderMode && (
        <div className="seg add-target" role="group" aria-label="Adicionar ao">
          <button aria-pressed={!toMaybe} onClick={() => onToMaybe(false)}>Ao deck</button>
          <button aria-pressed={toMaybe} onClick={() => onToMaybe(true)}>Ao Talvez</button>
        </div>
      )}
      {!commanderMode && identity && (
        <label className="check">
          <input type="checkbox" checked={sameIdentity} onChange={(e) => setSameIdentity(e.target.checked)} />
          Só cartas na identidade de cor do comandante
        </label>
      )}
      <p className="muted small" role="status">
        {(query && status) || (commanderMode ? 'Enter escolhe o primeiro resultado.' : `Enter adiciona o primeiro resultado ${toMaybe ? 'ao Talvez' : 'ao deck'}; com Shift, ${toMaybe ? 'ao deck' : 'ao Talvez'}.`)}
      </p>
      <ul className="results">
        {(query ? results : []).map((card) => {
          const oracleId = card.facts?.oracleId
          const count = oracleId ? countOf(oracleId) : 0
          const maybe = oracleId ? maybeCountOf(oracleId) : 0
          return (
            <li key={card.ref.scryfallId}>
              <button className="result" disabled={!oracleId}
                aria-label={`${card.ref.name}${commanderMode ? ', escolher como comandante' : toMaybe ? ', adicionar ao Talvez' : ', adicionar ao deck'}${count ? ` (${count} no deck)` : ''}${maybe ? ` (${maybe} no Talvez)` : ''}`}
                onPointerEnter={() => previewStore.set(card.ref)} onPointerLeave={() => previewStore.set(null)}
                onFocus={() => previewStore.set(card.ref)} onBlur={() => previewStore.set(null)}
                onClick={(e) => onAdd(card, !commanderMode && toMaybe !== e.shiftKey)}>
                {card.images ? <img src={card.images.small} alt="" loading="lazy" /> : <span>{card.ref.name}</span>}
                {count > 0 && <span className="badge gold">{count}</span>}
                {maybe > 0 && <span className="badge maybe-badge" title="no Talvez">T{maybe > 1 ? maybe : ''}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
