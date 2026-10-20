// "Histórico" (épico 10, req. 16–18): the deck's changes by day. Picking one shows the deck as it was right after it,
// read-only, with what restoring would change; restoring is a new change (and the toast can undo it).

import { useMemo, useState } from 'react'
import { deckDiff, versionAt } from '@gathering-hall/formats'
import { Dialog } from '../../ui/Dialog'
import type { DeckCardData } from '../cardData'
import { historyByDay, summarize } from '../historyView'
import { deckSize, type Deck } from '../model'
import { groupCards } from '../views/grouping'

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })

export function HistoryDialog({ deck, data, onRestore, onClose }: {
  deck: Deck
  data: DeckCardData
  onRestore: (index: number) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const [now] = useState(() => Date.now()) // "Hoje" / "Ontem" as of opening
  const days = useMemo(() => historyByDay(deck.history, now, (t) => dayFormat.format(t)), [deck.history, now])
  const version = picked === null ? null : versionAt(deck, picked)
  const change = version ? summarize(deckDiff(deck, version)) : []
  const groups = version ? groupCards(version.cards, data.info, 'type', 'name') : []

  return (
    <Dialog title="Histórico do deck" onClose={onClose} wide>
      {deck.history.length === 0 ? <p className="muted">Nenhuma mudança registrada ainda. Cada carta que entra ou sai aparece aqui.</p> : (
        <div className="history-layout">
          <nav className="history-list" aria-label="Mudanças">
            {days.map((d) => (
              <section key={d.day}>
                <h3>{d.label}</h3>
                <ul>
                  {d.items.map((item) => (
                    <li key={item.index}>
                      <button className="history-item" aria-pressed={picked === item.index} onClick={() => setPicked(item.index)}>
                        <span className="muted small">{timeFormat.format(item.at)}{item.index === deck.history.length - 1 ? ' · atual' : ''}</span>
                        {item.lines.map((l) => <span key={l} className="history-line">{l}</span>)}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <button className="history-item" aria-pressed={picked === -1} onClick={() => setPicked(-1)}>
              <span className="history-line">Antes da primeira mudança guardada</span>
            </button>
          </nav>
          <section className="history-preview" aria-live="polite" aria-label="Deck nesse ponto">
            {!version ? <p className="muted">Escolha uma mudança para ver o deck como estava logo depois dela.</p> : (
              <>
                <p><b>{deckSize(version)}</b> cartas no deck{version.maybe.length ? ` · ${version.maybe.reduce((n, c) => n + c.count, 0)} no Talvez` : ''}</p>
                {change.length === 0 ? <p className="muted small">Igual ao deck atual.</p> : (
                  <div className="history-diff">
                    <p className="muted small">Restaurar esta versão faz:</p>
                    {change.map((l) => <p key={l} className="small">{l}</p>)}
                  </div>
                )}
                <div className="row">
                  <button className="btn primary" disabled={change.length === 0} onClick={() => {
                    onRestore(picked!)
                    onClose()
                  }}>Restaurar esta versão</button>
                </div>
                {version.commanders.length > 0 && <p className="small"><b>Comandante:</b> {version.commanders.map((c) => c.name).join(' e ')}</p>}
                <div className="history-cards">
                  {groups.map((g) => (
                    <div key={g.key}>
                      <h4>{g.label} <span className="count">{g.count}</span></h4>
                      <ul>{g.cards.map((c) => <li key={c.oracleId}>{c.count} {c.name}</li>)}</ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </Dialog>
  )
}
