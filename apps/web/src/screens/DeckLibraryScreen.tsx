import { useCloudVersion } from '../account/useCloudVersion'
import { useEffect, useState } from 'react'
import type { Services } from '../app/services'
import { AppFooter } from '../app/AppNav'
import { importDecklist } from '../decks/importExport'
import { deckSize, newDeck, type Deck } from '../decks/model'
import { Dialog } from '../ui/Dialog'
import { toast } from '../ui/stores'

export function DeckLibraryScreen({ services, onOpen, onTest }: {
  services: Services
  onOpen: (deckId: string) => void
  onTest: (deck: Deck) => void
}) {
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [importing, setImporting] = useState(false)
  const reload = () => services.decks.list().then(setDecks)

  const cloudVersion = useCloudVersion(services)
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudVersion])

  async function create() {
    const deck = newDeck(crypto.randomUUID(), 'Deck novo', Date.now())
    await services.decks.save(deck)
    onOpen(deck.id)
  }

  async function duplicate(deck: Deck) {
    const now = Date.now()
    await services.decks.save({ ...deck, id: crypto.randomUUID(), name: `${deck.name} (cópia)`.slice(0, 60), createdAt: now, updatedAt: now })
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

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Decks</h1>
          <p className="muted">Seus decks ficam salvos neste navegador.</p>
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
        <ul className="deck-grid">
          {decks.map((deck) => (
            <li key={deck.id} className="deck-tile">
              <button className="deck-open" onClick={() => onOpen(deck.id)}>
                <strong>{deck.name}</strong>
                <span className="muted">{deck.commanders.map((c) => c.name).join(' + ') || 'Sem comandante'}</span>
                <span className={deckSize(deck) === 100 ? 'count ok' : 'count'}>{deckSize(deck)}/100</span>
              </button>
              <div className="deck-actions">
                <button className="btn ghost" onClick={() => onTest(deck)}>Testar</button>
                <button className="btn ghost" onClick={() => duplicate(deck)}>Duplicar</button>
                <button className="btn ghost danger" onClick={() => remove(deck)}>Excluir</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {importing && (
        <ImportDialog services={services} onClose={() => setImporting(false)} onImported={(id) => onOpen(id)} />
      )}
      <AppFooter />
    </main>
  )
}

function ImportDialog({ services, onClose, onImported }: { services: Services; onClose: () => void; onImported: (id: string) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const result = await importDecklist(text, services.catalog, crypto.randomUUID(), Date.now())
      if (!result.deck.cards.length && !result.deck.commanders.length) {
        setError(result.errors[0] ?? 'Nenhuma carta reconhecida na lista.')
        return
      }
      await services.decks.save(result.deck)
      if (result.missing.length) toast(`Não encontradas: ${result.missing.slice(0, 6).join(', ')}${result.missing.length > 6 ? '…' : ''}`)
      onImported(result.deck.id)
    } catch {
      setError('Não foi possível falar com o Scryfall. Verifique a conexão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Importar lista" onClose={onClose}>
      <label className="field">Cole a lista (Moxfield, Archidekt ou "1 Nome" por linha)
        <textarea rows={12} value={text} maxLength={12000} spellCheck={false} onChange={(e) => setText(e.target.value)}
          placeholder={'Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Sol Ring\n35 Mountain'} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end">
        <button className="btn primary" disabled={busy || !text.trim()} onClick={run}>{busy ? 'Importando…' : 'Importar'}</button>
      </div>
    </Dialog>
  )
}
