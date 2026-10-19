import { useEffect, useMemo, useRef, useState } from 'react'
import { commanderIdentity, OFFICIAL_PRESET_ID, resolvePreset, suggestBracket, validateDeck } from '@gathering-hall/formats'
import type { Services } from '../app/services'
import type { CatalogCard } from '../catalog/catalog'
import { emptyCardData, indexCards, loadDeckCards, type DeckCardData } from '../decks/cardData'
import { exportDecklist } from '../decks/importExport'
import { addCard, deckStats, moveCard, removeCard, renameDeck, setPrinting, toValidation, type Deck, type DeckCard } from '../decks/model'
import { DeckList, type DeckListActions } from '../decks/ui/DeckList'
import { DeckSidebar } from '../decks/ui/DeckSidebar'
import { SearchPanel } from '../decks/ui/SearchPanel'
import { Dialog } from '../ui/Dialog'
import { toast } from '../ui/stores'

const SAVE_DELAY_MS = 400

function withCards(data: DeckCardData, cards: CatalogCard[]): DeckCardData {
  const copy: DeckCardData = {
    byOracle: new Map(data.byOracle), printings: new Map(data.printings), facts: new Map(data.facts), info: new Map(data.info),
  }
  return indexCards(cards, copy)
}

export function DeckEditorScreen({ services, deckId, onBack, onTest }: {
  services: Services
  deckId: string
  onBack: () => void
  onTest: (deck: Deck) => void
}) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [data, setData] = useState<DeckCardData>(emptyCardData)
  const [missing, setMissing] = useState(false)
  const [artFor, setArtFor] = useState<DeckCard | null>(null)
  const [exporting, setExporting] = useState(false)
  const [selectedViolation, setSelectedViolation] = useState<number | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    services.decks.get(deckId).then(async (d) => {
      if (!d) return setMissing(true)
      setDeck(d)
      loaded.current = true
      try {
        setData(await loadDeckCards(d, services.catalog))
      } catch {
        toast('Sem conexão com o Scryfall: estatísticas e validação aparecem quando a conexão voltar.')
      }
    })
  }, [deckId, services])

  // Autosave every change (debounced).
  useEffect(() => {
    if (!deck || !loaded.current) return
    const t = setTimeout(() => services.decks.save(deck), SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [deck, services])

  const presets = services.presets.list()
  const preset = services.presets.get(deck?.presetId)
  const { deckRules } = useMemo(() => resolvePreset(preset), [preset])
  const derived = useMemo(() => {
    if (!deck) return null
    const validation = toValidation(deck)
    const commanders = deck.commanders.flatMap((c) => data.facts.get(c.oracleId) ?? [])
    return {
      violations: validateDeck(validation, data.facts, deckRules),
      bracket: suggestBracket(validation, data.facts),
      stats: deckStats(deck, data.info),
      identity: commanders.length ? [...commanderIdentity(commanders)] : null,
    }
  }, [deck, data, deckRules])

  if (missing) return <main className="page"><p>Esse deck não existe mais.</p><button className="btn" onClick={onBack}>Voltar</button></main>
  if (!deck || !derived) return <main className="page"><p className="muted">Carregando deck…</p></main>

  const update = (fn: (d: Deck, now: number) => Deck) => setDeck((d) => (d ? fn(d, Date.now()) : d))
  const commanderMode = deck.commanders.length === 0
  const countOf = (oracleId: string) => [...deck.commanders, ...deck.cards].filter((c) => c.oracleId === oracleId).reduce((n, c) => n + c.count, 0)
  const highlight = new Set(selectedViolation !== null ? (derived.violations[selectedViolation]?.cards ?? []) : [])

  function addFromSearch(card: CatalogCard) {
    const oracleId = card.facts?.oracleId
    if (!oracleId) return
    setData((d) => withCards(d, [card]))
    update((d, now) => addCard(d, { oracleId, name: card.ref.name }, commanderMode ? 'commanders' : 'cards', now))
    toast(commanderMode ? `${card.ref.name} é o comandante.` : `+1 ${card.ref.name}`)
  }

  const actions: DeckListActions = {
    add: (c, zone) => update((d, now) => addCard(d, c, zone, now)),
    remove: (c, zone) => update((d, now) => removeCard(d, c.oracleId, zone, now)),
    move: (c, from) => update((d, now) => moveCard(d, c.oracleId, from, now)),
    pickArt: (c) => setArtFor(c),
  }

  return (
    <main className="editor">
      <header className="editor-head">
        <button className="btn ghost" onClick={onBack}>← Decks</button>
        <input className="deck-name" aria-label="Nome do deck" value={deck.name} maxLength={60}
          onChange={(e) => update((d, now) => renameDeck(d, e.target.value, now))} />
        <div className="row">
          <button className="btn" onClick={() => setExporting(true)}>Exportar lista</button>
          <button className="btn primary" onClick={() => onTest(deck)}>Testar (goldfish)</button>
        </div>
      </header>

      <SearchPanel catalog={services.catalog} commanderMode={commanderMode} identity={derived.identity}
        countOf={countOf} onAdd={addFromSearch} />
      <DeckList deck={deck} data={data} actions={actions} highlight={highlight} />
      <DeckSidebar stats={derived.stats} deckSizeTarget={deckRules.deckSize} violations={derived.violations}
        bracket={derived.bracket} presets={presets} presetId={preset.id}
        onPreset={(id) => update((d, now) => ({ ...d, presetId: id === OFFICIAL_PRESET_ID ? undefined : id, updatedAt: now }))}
        selected={selectedViolation} onSelectViolation={setSelectedViolation} />

      {artFor && (
        <ArtPicker services={services} card={artFor} onClose={() => setArtFor(null)}
          onPick={(printing) => {
            const id = printing.ref.scryfallId
            if (!id) return
            setData((d) => ({ ...d, printings: new Map(d.printings).set(id, printing) }))
            update((d, now) => setPrinting(d, artFor.oracleId, id, now))
            setArtFor(null)
          }} />
      )}
      {exporting && <ExportDialog text={exportDecklist(deck)} onClose={() => setExporting(false)} />}
    </main>
  )
}

function ArtPicker({ services, card, onClose, onPick }: {
  services: Services; card: DeckCard; onClose: () => void; onPick: (printing: CatalogCard) => void
}) {
  const [printings, setPrintings] = useState<CatalogCard[] | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    services.catalog.printings(card.oracleId, { signal: ctrl.signal }).then(setPrintings).catch(() => setPrintings([]))
    return () => ctrl.abort()
  }, [card.oracleId, services])
  return (
    <Dialog title={`Arte de ${card.name}`} onClose={onClose} wide>
      {printings === null ? <p className="muted">Carregando impressões…</p> : printings.length === 0 ? <p className="muted">Nenhuma impressão encontrada.</p> : (
        <ul className="results art">
          {printings.map((p) => (
            <li key={p.ref.scryfallId}>
              <button className={`result${p.ref.scryfallId === card.scryfallId ? ' chosen' : ''}`} onClick={() => onPick(p)}
                aria-label={`Impressão ${p.ref.scryfallId}`} aria-pressed={p.ref.scryfallId === card.scryfallId}>
                {p.images ? <img src={p.images.small} alt="" loading="lazy" /> : <span>{p.ref.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

function ExportDialog({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Dialog title="Exportar lista" onClose={onClose}>
      <p className="muted small">Texto no formato aceito por Moxfield, Archidekt e Arena. Só a lista: nada de imagens para impressão.</p>
      <textarea className="export" rows={14} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
      <div className="row end">
        <button className="btn primary" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Lista copiada.'), () => toast('Não deu para copiar; selecione o texto.'))}>
          Copiar
        </button>
      </div>
    </Dialog>
  )
}
