// The public page of a deck (épico 10, req. 25–27): #/d/<slug>, read-only, for anyone (no account). The deck is the
// owner's current cloud version; only the display name of who shared it shows. "Copiar para meus decks" makes an
// independent copy in this browser (and in the visitor's cloud, if signed in).

import { useEffect, useMemo, useState } from 'react'
import { commanderIdentity, sanitizeDeck } from '@gathering-hall/formats'
import type { Services } from '../app/services'
import { AppFooter } from '../app/AppNav'
import { emptyCardData, loadDeckCards, type DeckCardData } from '../decks/cardData'
import { exportDecklist } from '../decks/importExport'
import { cardsMatching, deckStats, type Deck, type StatFilter } from '../decks/model'
import type { ShareClient } from '../decks/shareClient'
import { ExportDialog } from '../decks/ui/ExportDialog'
import { StatsCard } from '../decks/ui/StatsCard'
import { DeckView, type DeckCardActions } from '../decks/views/DeckView'
import { GROUP_BY_LABELS, groupCards, VIEW_LABELS, type DeckViewMode, type GroupBy } from '../decks/views/grouping'
import { useMediaQuery } from '../decks/views/prefs'
import { toast } from '../ui/stores'

const NOOP: DeckCardActions = { add() {}, remove() {}, move() {}, pickArt() {}, select() {}, menu() {}, moveTo() {}, drop() {} }

export function PublicDeckScreen({ slug, services, shares, onCopied }: {
  slug: string
  services: Services
  shares: ShareClient
  onCopied: (deckId: string) => void
}) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ok'; deck: Deck; owner: string }>({ status: 'loading' })
  const [data, setData] = useState<DeckCardData>(emptyCardData)
  const phone = useMediaQuery('(max-width: 699px)')
  const [mode, setMode] = useState<DeckViewMode>('stacks')
  const [groupBy, setGroupBy] = useState<GroupBy | null>(null) // null: category when the deck has them, else type
  const [filter, setFilter] = useState<StatFilter | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let live = true
    shares.read(slug).then(async (raw) => {
      if (!live) return
      if (!raw) return setState({ status: 'missing' })
      // Untrusted: rebuilt through the deck validator, like anything read from the network.
      const deck = sanitizeDeck({ ...raw, schemaVersion: 2, id: `public-${slug}`, history: [], createdAt: 0 })
      if (!deck) return setState({ status: 'error' })
      setState({ status: 'ok', deck, owner: typeof raw.owner === 'string' ? raw.owner.slice(0, 64) : 'alguém' })
      setData(await loadDeckCards(deck, services.catalog).catch(() => emptyCardData()))
    }, () => live && setState({ status: 'error' }))
    return () => { live = false }
  }, [slug, shares, services])

  const deck = state.status === 'ok' ? state.deck : null
  const hasTags = !!deck && [...deck.cards, ...deck.commanders].some((c) => c.tags?.length)
  const by: GroupBy = groupBy ?? (hasTags ? 'category' : 'type')
  const groups = useMemo(() => (deck ? groupCards(deck.cards, data.info, by, 'mv', deck.tagOrder) : []), [deck, data.info, by])
  const identity = useMemo(() => {
    const commanders = deck?.commanders.flatMap((c) => data.facts.get(c.oracleId) ?? []) ?? []
    return commanders.length ? [...commanderIdentity(commanders)] : undefined
  }, [deck, data.facts])
  const stats = useMemo(() => (deck ? deckStats(deck, data.info, identity) : null), [deck, data.info, identity])

  if (state.status === 'loading') return <main className="page"><p className="muted">Carregando o deck…</p></main>
  if (state.status === 'missing') {
    return <main className="page"><h1>Deck não encontrado</h1><p className="muted">Esse link não existe ou foi desligado por quem compartilhou.</p><AppFooter /></main>
  }
  if (state.status === 'error' || !deck || !stats) {
    return <main className="page"><h1>Não deu para abrir o deck</h1><p className="muted">O servidor não respondeu. Tente de novo em instantes.</p><AppFooter /></main>
  }

  async function copy() {
    const now = Date.now()
    const { id: _id, ...rest } = deck!
    const mine: Deck = { ...rest, id: crypto.randomUUID(), history: [], createdAt: now, updatedAt: now }
    await services.decks.save(mine)
    toast(`"${mine.name}" foi para os seus decks.`)
    onCopied(mine.id)
  }

  const view: DeckViewMode = phone ? 'list' : mode
  const highlight = new Set(filter ? cardsMatching(deck, data.info, filter, identity) : [])
  return (
    <main className="page public-deck">
      <header className="page-head">
        <div>
          <h1>{deck.name}</h1>
          <p className="muted">Compartilhado por {state.owner} · só para ver</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setExporting(true)}>Exportar texto</button>
          <button className="btn primary" onClick={() => void copy()}>Copiar para meus decks</button>
        </div>
      </header>
      {deck.description && <p className="deck-description">{deck.description}</p>}
      <div className="editor-tools" role="toolbar" aria-label="Como ver o deck">
        {!phone && (
          <div className="seg" role="group" aria-label="Visualização">
            {(Object.keys(VIEW_LABELS) as DeckViewMode[]).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setMode(v)}>{VIEW_LABELS[v]}</button>)}
          </div>
        )}
        <label className="inline-field">Agrupar
          <select value={by} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((g) => <option key={g} value={g}>{GROUP_BY_LABELS[g]}</option>)}
          </select>
        </label>
      </div>
      <div className="public-layout">
        <DeckView mode={view} groupBy={by} commanders={deck.commanders} groups={groups} maybe={deck.maybe} data={data} actions={NOOP}
          highlight={highlight} selected={new Set()} selecting={false} maybeOpen onToggleMaybe={() => {}} readOnly />
        <aside className="deck-side">
          <StatsCard stats={stats} deckSizeTarget={100} filter={filter} onFilter={setFilter} />
        </aside>
      </div>
      {exporting && <ExportDialog text={exportDecklist(deck)} onClose={() => setExporting(false)} />}
      <AppFooter />
    </main>
  )
}
