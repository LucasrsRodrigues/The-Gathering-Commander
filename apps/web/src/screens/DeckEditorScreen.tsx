import { useEffect, useMemo, useRef, useState } from 'react'
import { commanderIdentity, OFFICIAL_PRESET_ID, resolvePreset, suggestBracket, validateDeck } from '@gathering-hall/formats'
import type { Services } from '../app/services'
import type { CatalogCard } from '../catalog/catalog'
import { factsForDate, type DatedFacts } from '../catalog/legality'
import { emptyCardData, indexCards, loadDeckCards, type DeckCardData } from '../decks/cardData'
import { exportDecklist } from '../decks/importExport'
import { isEligibleAlone } from '@gathering-hall/formats'
import {
  addCard, addCategory, categoriesOf, deckStats, deleteCategory, moveCard, moveCategory, moveEntry, removeCard, removeEntry,
  renameCategory, renameDeck, setMainCategory, setPrinting, toggleCategory, toValidation, type Deck, type DeckCard, type DeckZone,
} from '../decks/model'
import { suggestionsFor } from '../decks/tags'
import { CategoryPanel } from '../decks/ui/CategoryPanel'
import { NameDialog } from '../decks/ui/NameDialog'
import { CardMenu, type MenuSection } from '../decks/views/CardMenu'
import { DeckView, type DeckCardActions } from '../decks/views/DeckView'
import { DragGhost } from '../decks/views/DragGhost'
import {
  cardKey, GROUP_BY_LABELS, groupCards, SORT_BY_LABELS, VIEW_LABELS, type DeckViewMode, type GroupBy, type SortBy,
} from '../decks/views/grouping'
import { useEditorPrefs, useMediaQuery } from '../decks/views/prefs'
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
  const [prefs, setPrefs] = useEditorPrefs()
  const phone = useMediaQuery('(max-width: 699px)')
  const [pane, setPane] = useState<'deck' | 'stats'>('deck') // tablet and phone: one of the two at a time
  const view: DeckViewMode = phone ? 'list' : prefs.view
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [selecting, setSelecting] = useState(false) // "Selecionar" mode (touch): taps select
  const [menu, setMenu] = useState<{ card: DeckCard; zone: DeckZone; x: number; y: number } | null>(null)
  type Target = { zone: DeckZone; oracleId: string }
  const [naming, setNaming] = useState<{ kind: 'new'; targets: Target[] } | { kind: 'rename'; from: string } | null>(null)
  const [shownCategory, setShownCategory] = useState<string | null>(null) // highlights its cards
  const [searchToMaybe, setSearchToMaybe] = useState(false)

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
  const asOf = deckRules.banlist.asOf
  const [dated, setDated] = useState<DatedFacts | null>(null)
  useEffect(() => {
    let live = true
    factsForDate(data.facts, asOf, services.legality).then((d) => {
      if (!live) return
      setDated(d)
      if (d.note) toast(d.note)
    })
    return () => { live = false }
  }, [data.facts, asOf, services])
  const facts = dated?.facts ?? data.facts
  const derived = useMemo(() => {
    if (!deck) return null
    const validation = toValidation(deck)
    const commanders = deck.commanders.flatMap((c) => facts.get(c.oracleId) ?? [])
    return {
      violations: validateDeck(validation, facts, deckRules),
      bracket: suggestBracket(validation, facts),
      stats: deckStats(deck, data.info),
      identity: commanders.length ? [...commanderIdentity(commanders)] : null,
    }
  }, [deck, data, facts, deckRules])
  const groups = useMemo(
    () => (deck ? groupCards(deck.cards, data.info, prefs.groupBy, prefs.sortBy, deck.tagOrder) : []),
    [deck, data.info, prefs.groupBy, prefs.sortBy],
  )

  if (missing) return <main className="page"><p>Esse deck não existe mais.</p><button className="btn" onClick={onBack}>Voltar</button></main>
  if (!deck || !derived) return <main className="page"><p className="muted">Carregando deck…</p></main>

  const update = (fn: (d: Deck, now: number) => Deck) => setDeck((d) => (d ? fn(d, Date.now()) : d))
  const commanderMode = deck.commanders.length === 0
  const countOf = (oracleId: string) => [...deck.commanders, ...deck.cards].filter((c) => c.oracleId === oracleId).reduce((n, c) => n + c.count, 0)
  const categories = categoriesOf(deck)
  const suggestions = suggestionsFor(
    (['commanders', 'cards', 'maybe'] as const).flatMap((zone) => deck[zone].map((card) => ({ zone, card }))), data.facts,
  )
  const highlight = new Set([
    ...(selectedViolation !== null ? (derived.violations[selectedViolation]?.cards ?? []) : []),
    ...(shownCategory ? (['commanders', 'cards', 'maybe'] as const).flatMap((z) => deck[z])
      .filter((c) => c.tags?.some((t) => t.toLowerCase() === shownCategory.toLowerCase())).map((c) => c.name) : []),
  ])

  function addFromSearch(card: CatalogCard, maybe: boolean) {
    const oracleId = card.facts?.oracleId
    if (!oracleId) return
    setData((d) => withCards(d, [card]))
    const zone: DeckZone = commanderMode ? 'commanders' : maybe ? 'maybe' : 'cards'
    update((d, now) => addCard(d, { oracleId, name: card.ref.name }, zone, now))
    toast(commanderMode ? `${card.ref.name} é o comandante.` : maybe ? `+1 ${card.ref.name} no Talvez` : `+1 ${card.ref.name}`)
  }

  // The cards an action applies to: the selection when the card is part of it, otherwise just the card.
  const selectedTargets = () => [...selected].map((k) => {
    const i = k.indexOf(':')
    return { zone: k.slice(0, i) as DeckZone, oracleId: k.slice(i + 1) }
  })
  const targetsOf = (card: DeckCard, zone: DeckZone): { zone: DeckZone; oracleId: string }[] =>
    selected.has(cardKey(zone, card.oracleId)) ? selectedTargets() : [{ zone, oracleId: card.oracleId }]
  const clearSelection = () => setSelected(new Set())
  const moveAll = (targets: { zone: DeckZone; oracleId: string }[], to: DeckZone) => {
    update((d, now) => targets.reduce((acc, t) => moveEntry(acc, t.oracleId, t.zone, to, now), d))
    clearSelection()
  }
  const removeAll = (targets: { zone: DeckZone; oracleId: string }[]) => {
    update((d, now) => targets.reduce((acc, t) => removeEntry(acc, t.oracleId, t.zone, now), d))
    clearSelection()
  }

  // Categories on several cards at once (they may be in different lists).
  const tagAll = (targets: Target[], tag: string, on: boolean) => update((d, now) => {
    const zones = [...new Set(targets.map((t) => t.zone))]
    return zones.reduce((acc, z) => toggleCategory(acc, z, targets.filter((t) => t.zone === z).map((t) => t.oracleId), tag, on, now), d)
  })
  const mainAll = (targets: Target[], tag: string) => update((d, now) => {
    const zones = [...new Set(targets.map((t) => t.zone))]
    return zones.reduce((acc, z) => setMainCategory(acc, z, targets.filter((t) => t.zone === z).map((t) => t.oracleId), tag, now), d)
  })
  function removeCategory(name: string) {
    const before = deck!
    update((d, now) => deleteCategory(d, name, now))
    if (shownCategory === name) setShownCategory(null)
    toast(`Categoria "${name}" excluída. As cartas continuam no deck.`, { label: 'Desfazer', run: () => setDeck({ ...before, updatedAt: Date.now() }) })
  }

  // Drop on a category group (main category), "no category", the deck or the Talvez list.
  function drop(card: DeckCard, zone: DeckZone, target: string) {
    const targets = targetsOf(card, zone)
    if (target === 'zone:maybe') return moveAll(targets.filter((t) => t.zone !== 'maybe'), 'maybe')
    if (target === 'zone:cards') return moveAll(targets.filter((t) => t.zone !== 'cards'), 'cards')
    if (target.startsWith('tag:')) {
      const tag = target.slice(4) || null
      update((d, now) => {
        const moved = targets.reduce((acc, t) => (t.zone === 'cards' ? acc : moveEntry(acc, t.oracleId, t.zone, 'cards', now)), d)
        return setMainCategory(moved, 'cards', targets.map((t) => t.oracleId), tag, now)
      })
      clearSelection()
    }
  }

  const actions: DeckCardActions = {
    add: (c, zone) => update((d, now) => addCard(d, c, zone, now)),
    remove: (c, zone) => update((d, now) => removeCard(d, c.oracleId, zone, now)),
    move: (c, from) => update((d, now) => moveCard(d, c.oracleId, from, now)),
    pickArt: (c) => setArtFor(c),
    select: (c, zone) => setSelected((s) => {
      const next = new Set(s)
      const key = cardKey(zone, c.oracleId)
      if (!next.delete(key)) next.add(key)
      return next
    }),
    menu: (card, zone, x, y) => setMenu({ card, zone, x, y }),
    moveTo: (card, from, to) => moveAll([{ zone: from, oracleId: card.oracleId }], to),
    drop,
  }

  function menuSections(card: DeckCard, zone: DeckZone): MenuSection[] {
    const facts = data.facts.get(card.oracleId)
    const one = [{ zone, oracleId: card.oracleId }]
    const isSelected = selected.has(cardKey(zone, card.oracleId))
    const sections: MenuSection[] = [{
      items: [
        ...(zone !== 'commanders' ? [{ label: '+1 cópia', run: () => actions.add(card, zone) }] : []),
        { label: '−1 cópia', run: () => actions.remove(card, zone) },
        ...(zone === 'cards' ? [{ label: 'Mover para o Talvez', run: () => moveAll(one, 'maybe') }] : []),
        ...(zone === 'maybe' ? [{ label: 'Mover para o deck', run: () => moveAll(one, 'cards') }] : []),
        ...(zone === 'commanders' ? [{ label: 'Voltar ao deck', run: () => actions.move(card, zone) }] : []),
        ...(zone === 'cards' && facts && isEligibleAlone(facts) ? [{ label: 'Tornar comandante', run: () => actions.move(card, zone) }] : []),
        { label: 'Trocar arte', run: () => setArtFor(card) },
        { label: isSelected ? 'Tirar da seleção' : 'Selecionar', run: () => actions.select(card, zone) },
        { label: zone === 'maybe' ? 'Tirar do Talvez' : 'Remover do deck', run: () => removeAll(one), danger: true },
      ],
    }]
    const targets = targetsOf(card, zone)
    const plural = targets.length > 1 ? ` (${targets.length} cartas)` : ''
    const has = (name: string) => !!card.tags?.some((t) => t.toLowerCase() === name.toLowerCase())
    sections.push({
      title: `Categorias${plural}`,
      items: [
        ...categories.map((c) => ({
          label: `${has(c.name) ? '✓' : '○'} ${c.name}${card.tags?.[0]?.toLowerCase() === c.name.toLowerCase() ? ' (principal)' : ''}`,
          run: () => tagAll(targets, c.name, !has(c.name)),
        })),
        ...(card.tags ?? []).slice(1).map((t) => ({ label: `Tornar principal: ${t}`, run: () => mainAll(targets, t) })),
        { label: 'Nova categoria…', run: () => setNaming({ kind: 'new', targets }) },
      ],
    })
    if (isSelected && selected.size > 1) {
      const all = targetsOf(card, zone)
      sections.push({
        title: `${selected.size} selecionadas`,
        items: [
          { label: 'Mover todas para o Talvez', run: () => moveAll(all.filter((t) => t.zone !== 'maybe'), 'maybe') },
          { label: 'Mover todas para o deck', run: () => moveAll(all.filter((t) => t.zone !== 'cards'), 'cards') },
          { label: 'Remover todas', run: () => removeAll(all), danger: true },
          { label: 'Limpar seleção', run: clearSelection },
        ],
      })
    }
    return sections
  }

  return (
    <main className="editor" data-pane={pane} onKeyDown={(e) => {
      if (e.key === 'Escape' && selected.size && !menu) clearSelection()
    }}>
      <header className="editor-head">
        <button className="btn ghost" onClick={onBack}>← Decks</button>
        <input className="deck-name" aria-label="Nome do deck" value={deck.name} maxLength={60}
          onChange={(e) => update((d, now) => renameDeck(d, e.target.value, now))} />
        <div className="row">
          <button className="btn" onClick={() => setExporting(true)}>Exportar lista</button>
          <button className="btn primary" onClick={() => onTest(deck)}>Testar (goldfish)</button>
        </div>
      </header>
      <div className="editor-tools" role="toolbar" aria-label="Como ver o deck">
        <div className="seg pane-tabs" role="tablist" aria-label="Painel">
          <button role="tab" aria-selected={pane === 'deck'} onClick={() => setPane('deck')}>Deck</button>
          <button role="tab" aria-selected={pane === 'stats'} onClick={() => setPane('stats')}>Estatísticas</button>
        </div>
        {!phone && (
          <div className="seg" role="group" aria-label="Visualização">
            {(Object.keys(VIEW_LABELS) as DeckViewMode[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setPrefs({ view: v })}>{VIEW_LABELS[v]}</button>
            ))}
          </div>
        )}
        <label className="inline-field">Agrupar
          <select value={prefs.groupBy} onChange={(e) => setPrefs({ groupBy: e.target.value as GroupBy })}>
            {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((g) => <option key={g} value={g}>{GROUP_BY_LABELS[g]}</option>)}
          </select>
        </label>
        <button className={`btn small${selecting ? ' primary' : ''}`} aria-pressed={selecting}
          onClick={() => setSelecting((v) => !v)}>Selecionar</button>
        <label className="inline-field">Ordenar
          <select value={prefs.sortBy} onChange={(e) => setPrefs({ sortBy: e.target.value as SortBy })}>
            {(Object.keys(SORT_BY_LABELS) as SortBy[]).map((o) => <option key={o} value={o}>{SORT_BY_LABELS[o]}</option>)}
          </select>
        </label>
      </div>

      <SearchPanel catalog={services.catalog} commanderMode={commanderMode} identity={derived.identity}
        countOf={countOf} maybeCountOf={(id) => deck.maybe.find((c) => c.oracleId === id)?.count ?? 0}
        toMaybe={searchToMaybe} onToMaybe={setSearchToMaybe} onAdd={addFromSearch} />
      <div className="deck-main">
        {selected.size > 0 && (
          <div className="selection-bar" role="region" aria-label="Seleção">
            <b>{selected.size} selecionada{selected.size > 1 ? 's' : ''}</b>
            <button className="btn small" onClick={() => moveAll(selectedTargets().filter((t) => t.zone !== 'maybe'), 'maybe')}>Mover para o Talvez</button>
            <button className="btn small" onClick={() => moveAll(selectedTargets().filter((t) => t.zone !== 'cards'), 'cards')}>Mover para o deck</button>
            <label className="inline-field">Categoria
              <select value="" onChange={(e) => {
                const v = e.target.value
                if (v === '__new') setNaming({ kind: 'new', targets: selectedTargets() })
                else if (v) tagAll(selectedTargets(), v, true)
              }}>
                <option value="">aplicar…</option>
                {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                <option value="__new">Nova categoria…</option>
              </select>
            </label>
            <button className="btn small danger" onClick={() => removeAll(selectedTargets())}>Remover</button>
            <button className="btn ghost small" onClick={clearSelection}>Limpar</button>
          </div>
        )}
        <DeckView mode={view} groupBy={prefs.groupBy} commanders={deck.commanders} groups={groups} maybe={deck.maybe} data={data}
          actions={actions} highlight={highlight} selected={selected} selecting={selecting}
          maybeOpen={prefs.maybeOpen} onToggleMaybe={() => setPrefs({ maybeOpen: !prefs.maybeOpen })} />
      </div>
      <DragGhost />
      {menu && <CardMenu title={menu.card.name} x={menu.x} y={menu.y} sections={menuSections(menu.card, menu.zone)} onClose={() => setMenu(null)} />}
      <DeckSidebar stats={derived.stats} deckSizeTarget={deckRules.deckSize} violations={derived.violations}
        bracket={derived.bracket} presets={presets} presetId={preset.id}
        onPreset={(id) => update((d, now) => ({ ...d, presetId: id === OFFICIAL_PRESET_ID ? undefined : id, updatedAt: now }))}
        selected={selectedViolation} onSelectViolation={setSelectedViolation}>
        <CategoryPanel categories={categories} suggestions={suggestions}
          onNew={() => setNaming({ kind: 'new', targets: [] })}
          onRename={(from) => setNaming({ kind: 'rename', from })}
          onDelete={removeCategory}
          onMove={(name, delta) => update((d, now) => moveCategory(d, name, delta, now))}
          onAccept={(sg, tag) => update((d, now) => toggleCategory(d, sg.zone, [sg.oracleId], tag, true, now))}
          onAcceptAll={() => {
            update((d, now) => suggestions.reduce((acc, sg) => sg.tags.reduce((a, t) => toggleCategory(a, sg.zone, [sg.oracleId], t, true, now), acc), d))
            toast('Sugestões aceitas. Agrupe por "Categoria" para ver o deck por função.')
          }}
          onShow={(name) => setShownCategory((c) => (c === name ? null : name))} />
      </DeckSidebar>
      {naming && (
        <NameDialog title={naming.kind === 'new' ? 'Nova categoria' : `Renomear "${naming.from}"`} label="Nome"
          initial={naming.kind === 'rename' ? naming.from : ''} confirm={naming.kind === 'new' ? 'Criar' : 'Renomear'}
          onClose={() => setNaming(null)}
          onSubmit={(name) => {
            if (naming.kind === 'rename') return update((d, now) => renameCategory(d, naming.from, name, now))
            if (naming.targets.length) {
              tagAll(naming.targets, name, true)
              clearSelection()
            } else update((d, now) => addCategory(d, name, now))
          }} />
      )}

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
