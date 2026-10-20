import { useCloudVersion } from '../account/useCloudVersion'
import { useEffect, useState } from 'react'
import type { Services } from '../app/services'
import { AppFooter } from '../app/AppNav'
import { importDecklist } from '../decks/importExport'
import { importFromLink } from '../decks/importLink'
import { SERVER_HTTP } from '../net/config'
import { DECK_LIMITS, type Color } from '@gathering-hall/formats'
import {
  cleanFolder, foldersOf, inFolder, LIBRARY_SORT_LABELS, matchesQuery, setFolder, sortDecks, type FolderFilter, type LibrarySort,
} from '../decks/library'
import { deckSize, newDeck, type Deck } from '../decks/model'
import { NameDialog } from '../decks/ui/NameDialog'
import { useDeckSummaries, type DeckSummary } from '../decks/useDeckSummaries'
import { DragGhost } from '../decks/views/DragGhost'
import { useCardGestures } from '../decks/views/gestures'
import { Dialog } from '../ui/Dialog'
import { toast } from '../ui/stores'

const FOLDERS_KEY = 'gh-deck-folders-v1' // folders with no deck yet (this browser only)

function readFolders(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === 'string').slice(0, 100) : []
  } catch {
    return []
  }
}
function writeFolders(list: string[]) {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(list))
  } catch {
    // only a convenience
  }
}

const COLOR_NAMES: Record<Color, string> = { W: 'branco', U: 'azul', B: 'preto', R: 'vermelho', G: 'verde' }

export function DeckLibraryScreen({ services, onOpen, onTest }: {
  services: Services
  onOpen: (deckId: string) => void
  onTest: (deck: Deck) => void
}) {
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [filter, setFilter] = useState<FolderFilter>({ kind: 'all' })
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<LibrarySort>('updated')
  const [emptyFolders, setEmptyFolders] = useState<string[]>(readFolders)
  const [naming, setNaming] = useState<{ kind: 'new' } | { kind: 'rename'; from: string } | null>(null)
  const reload = () => services.decks.list().then(setDecks)
  const summaries = useDeckSummaries(decks, services)

  const cloudVersion = useCloudVersion(services)
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudVersion])

  const saveFolders = (list: string[]) => {
    setEmptyFolders(list)
    writeFolders(list)
  }
  const folders = foldersOf(decks ?? [], emptyFolders)

  async function create() {
    const base = newDeck(crypto.randomUUID(), 'Deck novo', Date.now())
    const deck = filter.kind === 'folder' ? setFolder(base, filter.name, base.updatedAt) : base
    await services.decks.save(deck)
    onOpen(deck.id)
  }

  async function duplicate(deck: Deck) {
    const now = Date.now()
    await services.decks.save({ ...deck, id: crypto.randomUUID(), name: `${deck.name} (cópia)`.slice(0, 60), history: [], createdAt: now, updatedAt: now })
    reload()
  }

  async function remove(deck: Deck) {
    await services.decks.remove(deck.id)
    reload()
    toast(`"${deck.name}" excluído.`, {
      label: 'Desfazer',
      run: () => services.decks.save(deck).then(reload),
    })
  }

  async function moveTo(list: Deck[], folder: string | null) {
    const now = Date.now()
    for (const d of list) await services.decks.save(setFolder(d, folder, now))
    if (folder) saveFolders(emptyFolders.filter((f) => f.toLowerCase() !== folder.toLowerCase()))
    reload()
  }

  async function renameFolder(from: string, to: string) {
    const name = cleanFolder(to)
    if (!name) return
    await moveTo((decks ?? []).filter((d) => inFolder(d, { kind: 'folder', name: from })), name)
    saveFolders(emptyFolders.map((f) => (f.toLowerCase() === from.toLowerCase() ? name : f)))
    if (filter.kind === 'folder' && filter.name.toLowerCase() === from.toLowerCase()) setFilter({ kind: 'folder', name })
  }

  async function deleteFolder(name: string) {
    const inside = (decks ?? []).filter((d) => inFolder(d, { kind: 'folder', name }))
    await moveTo(inside, null)
    saveFolders(emptyFolders.filter((f) => f.toLowerCase() !== name.toLowerCase()))
    if (filter.kind === 'folder') setFilter({ kind: 'all' })
    toast(`Pasta "${name}" excluída. ${inside.length ? `Os ${inside.length} deck(s) dela continuam, sem pasta.` : ''}`, inside.length ? {
      label: 'Desfazer', run: () => void moveTo(inside, name),
    } : undefined)
  }

  const shown = decks
    ? sortDecks(decks.filter((d) => inFolder(d, filter) && matchesQuery(d, query)), sortBy, (d) => summaries.get(d.id)?.identity ?? undefined)
    : []
  const isActive = (f: FolderFilter) => JSON.stringify(f) === JSON.stringify(filter)

  return (
    <main className="page library">
      <header className="page-head">
        <div>
          <h1>Decks</h1>
          <p className="muted">Seus decks ficam salvos neste navegador{services.cloud ? ' e, com conta, na nuvem' : ''}.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)}>Importar lista</button>
          <button className="btn primary" onClick={create}>Novo deck</button>
        </div>
      </header>

      {decks === null ? <p className="muted">Carregando…</p> : decks.length === 0 ? (
        <section className="empty">
          <h2>Nenhum deck ainda</h2>
          <p className="muted">Crie um do zero escolhendo o comandante, ou cole uma lista do Moxfield ou do Archidekt.</p>
          <div className="row">
            <button className="btn primary" onClick={create}>Criar o primeiro deck</button>
            <button className="btn" onClick={() => setImporting(true)}>Importar lista</button>
          </div>
        </section>
      ) : (
        <div className="library-layout">
          <nav className="folder-list" aria-label="Pastas">
            <ul>
              <li data-drop="folder:*"><button className="folder-btn" aria-pressed={isActive({ kind: 'all' })} onClick={() => setFilter({ kind: 'all' })}>
                Todas <span className="count">{decks.length}</span></button></li>
              <li data-drop="folder:"><button className="folder-btn" aria-pressed={isActive({ kind: 'none' })} onClick={() => setFilter({ kind: 'none' })}>
                Sem pasta <span className="count">{decks.filter((d) => !d.folder).length}</span></button></li>
              {folders.map((f) => (
                <li key={f.name} data-drop={`folder:${f.name}`}>
                  <button className="folder-btn" aria-pressed={isActive({ kind: 'folder', name: f.name })} onClick={() => setFilter({ kind: 'folder', name: f.name })}>
                    {f.name} <span className="count">{f.count}</span>
                  </button>
                  <span className="row-actions">
                    <button className="btn ghost tiny" onClick={() => setNaming({ kind: 'rename', from: f.name })}>Renomear</button>
                    <button className="btn ghost tiny danger-text" aria-label={`Excluir a pasta ${f.name}`} onClick={() => void deleteFolder(f.name)}>Excluir</button>
                  </span>
                </li>
              ))}
            </ul>
            <button className="btn small" onClick={() => setNaming({ kind: 'new' })}>Nova pasta</button>
          </nav>

          <section className="library-main" aria-label="Decks">
            <div className="library-tools">
              <label className="field search-field">Buscar
                <input type="search" value={query} placeholder="Nome do deck ou do comandante" onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label className="inline-field">Ordenar
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as LibrarySort)}>
                  {(Object.keys(LIBRARY_SORT_LABELS) as LibrarySort[]).map((k) => <option key={k} value={k}>{LIBRARY_SORT_LABELS[k]}</option>)}
                </select>
              </label>
            </div>
            {shown.length === 0 ? <p className="muted">Nenhum deck aqui{query ? ' com essa busca' : ''}.</p> : (
              <ul className="deck-grid">
                {shown.map((deck) => (
                  <DeckTile key={deck.id} deck={deck} summary={summaries.get(deck.id)} folders={folders.map((f) => f.name)}
                    onOpen={() => onOpen(deck.id)} onTest={() => onTest(deck)} onDuplicate={() => void duplicate(deck)}
                    onRemove={() => void remove(deck)} onMove={(folder) => void moveTo([deck], folder)} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <DragGhost />
      {naming && (
        <NameDialog title={naming.kind === 'new' ? 'Nova pasta' : `Renomear "${naming.from}"`} label="Nome da pasta" maxLength={DECK_LIMITS.folder}
          initial={naming.kind === 'rename' ? naming.from : ''} confirm={naming.kind === 'new' ? 'Criar' : 'Renomear'}
          onClose={() => setNaming(null)}
          onSubmit={(name) => {
            const clean = cleanFolder(name)
            if (!clean) return
            if (naming.kind === 'rename') return void renameFolder(naming.from, clean)
            if (!folders.some((f) => f.name.toLowerCase() === clean.toLowerCase())) saveFolders([...emptyFolders, clean])
            setFilter({ kind: 'folder', name: clean })
          }} />
      )}
      {importing && (
        <ImportDialog services={services} onClose={() => setImporting(false)} onImported={(id) => onOpen(id)} />
      )}
      <AppFooter />
    </main>
  )
}

function DeckTile({ deck, summary, folders, onOpen, onTest, onDuplicate, onRemove, onMove }: {
  deck: Deck; summary: DeckSummary | undefined; folders: string[]
  onOpen: () => void; onTest: () => void; onDuplicate: () => void; onRemove: () => void; onMove: (folder: string | null) => void
}) {
  const gestures = useCardGestures({
    onMenu: () => {},
    onDragStart: () => ({ label: deck.name, image: summary?.art ?? null, count: 1 }),
    onDrop: (target) => {
      if (!target.startsWith('folder:') || target === 'folder:*') return
      onMove(target.slice(7) || null)
    },
  })
  const { consumeClick, onContextMenu: _menu, ...pointer } = gestures
  const size = deckSize(deck)
  const status = !summary ? 'verificando…'
    : summary.status === 'ok' ? `✓ válido para ${summary.presetName}`
      : summary.status === 'warn' ? `✓ válido para ${summary.presetName}, com avisos`
        : summary.status === 'blocked' ? `✗ ${summary.problems} problema(s) em ${summary.presetName}` : 'sem conexão para validar'
  return (
    <li className="deck-tile">
      <button className="deck-open" {...pointer} onClick={() => !consumeClick() && onOpen()}>
        <span className="deck-art" aria-hidden="true">{summary?.art ? <img src={summary.art} alt="" loading="lazy" draggable={false} /> : null}</span>
        <strong>{deck.name}</strong>
        <span className="muted">{deck.commanders.map((c) => c.name).join(' + ') || 'Sem comandante'}</span>
        <span className="deck-meta">
          {summary?.identity && (
            <span className="identity" aria-label={`Cores: ${summary.identity.length ? summary.identity.map((c) => COLOR_NAMES[c]).join(', ') : 'incolor'}`}>
              {summary.identity.length ? summary.identity.map((c) => <span key={c} className={`mana-dot dot-${c}`} />) : <span className="mana-dot dot-C" />}
            </span>
          )}
          <span className={size === 100 ? 'count ok' : 'count'}>{size} cartas</span>
          <span className={`small deck-status${summary ? ` status-${summary.status}` : ''}`}>{status}</span>
        </span>
        {deck.folder && <span className="tag-chip">{deck.folder}</span>}
      </button>
      <div className="deck-actions">
        <button className="btn ghost" onClick={onTest}>Testar</button>
        <button className="btn ghost" onClick={onDuplicate}>Duplicar</button>
        <label className="inline-field small">Pasta
          <select value={deck.folder ?? ''} onChange={(e) => onMove(e.target.value || null)} aria-label={`Pasta de ${deck.name}`}>
            <option value="">Sem pasta</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <button className="btn ghost danger" onClick={onRemove}>Excluir</button>
      </div>
    </li>
  )
}

function ImportDialog({ services, onClose, onImported }: { services: Services; onClose: () => void; onImported: (id: string) => void }) {
  const [mode, setMode] = useState<'text' | 'link'>('text')
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; offerText: boolean } | null>(null)

  async function runText() {
    setBusy(true)
    setError(null)
    try {
      const result = await importDecklist(text, services.catalog, crypto.randomUUID(), Date.now())
      if (!result.deck.cards.length && !result.deck.commanders.length) {
        setError({ message: result.errors[0] ?? 'Nenhuma carta reconhecida na lista.', offerText: false })
        return
      }
      await services.decks.save(result.deck)
      if (result.missing.length) toast(`Não encontradas: ${result.missing.slice(0, 6).join(', ')}${result.missing.length > 6 ? '…' : ''}`)
      onImported(result.deck.id)
    } catch {
      setError({ message: 'Não foi possível falar com o Scryfall. Verifique a conexão.', offerText: false })
    } finally {
      setBusy(false)
    }
  }

  async function runLink() {
    setBusy(true)
    setError(null)
    try {
      const out = await importFromLink(link, SERVER_HTTP, services.catalog, crypto.randomUUID(), Date.now())
      if (!out.ok) return setError(out)
      await services.decks.save(out.result.deck)
      const missing = out.result.missing
      toast(`Deck importado do ${out.source}.${missing.length ? ` Não encontradas: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` : ''}`)
      onImported(out.result.deck.id)
    } catch {
      setError({ message: 'Não foi possível falar com o Scryfall para conferir as cartas. Verifique a conexão.', offerText: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Importar deck" onClose={onClose}>
      <div className="seg" role="tablist" aria-label="Como importar">
        <button role="tab" aria-selected={mode === 'text'} onClick={() => { setMode('text'); setError(null) }}>Colar texto</button>
        <button role="tab" aria-selected={mode === 'link'} onClick={() => { setMode('link'); setError(null) }}>Colar link</button>
      </div>
      {mode === 'text' ? (
        <label className="field">Cole a lista (Moxfield, Archidekt ou "1 Nome" por linha)
          <textarea rows={12} value={text} maxLength={12000} spellCheck={false} onChange={(e) => setText(e.target.value)}
            placeholder={'Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Sol Ring\n35 Mountain'} />
        </label>
      ) : (
        <>
          <label className="field">Link do deck no Archidekt ou no Moxfield
            <input type="url" value={link} maxLength={300} spellCheck={false} placeholder="https://archidekt.com/decks/…"
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && link.trim() && !busy) void runLink() }} />
          </label>
          <p className="muted small">O deck precisa ser público. Vêm comandante, cartas, categorias e o Talvez (maybeboard). O Moxfield
            às vezes não deixa ler; aí, use "Exportar → Texto" lá e cole na outra aba.</p>
        </>
      )}
      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          {error.offerText && mode === 'link' && <button className="btn small" onClick={() => { setMode('text'); setError(null) }}>Colar o texto</button>}
        </div>
      )}
      <div className="row end">
        {mode === 'text'
          ? <button className="btn primary" disabled={busy || !text.trim()} onClick={runText}>{busy ? 'Importando…' : 'Importar'}</button>
          : <button className="btn primary" disabled={busy || !link.trim()} onClick={runLink}>{busy ? 'Buscando…' : 'Importar do link'}</button>}
      </div>
    </Dialog>
  )
}
