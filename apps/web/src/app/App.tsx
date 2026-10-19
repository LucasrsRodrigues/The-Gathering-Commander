import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ScryfallCatalog } from '../catalog/scryfall'
import type { Deck } from '../decks/model'
import { openDeckRepository, type DeckRepository } from '../decks/repository'
import { CardPreview, Toasts } from '../hud/Overlays'
import { LocalPresetRepository } from '../presets/repository'
import { AboutScreen } from '../screens/AboutScreen'
import { DeckEditorScreen } from '../screens/DeckEditorScreen'
import { DeckLibraryScreen } from '../screens/DeckLibraryScreen'
import { OnlineScreen } from '../screens/OnlineScreen'
import { RoomScreen } from '../screens/RoomScreen'
import { ROOM_HASH } from '../net/config'
import { PresetsScreen } from '../screens/PresetsScreen'
import { SetupScreen } from '../screens/SetupScreen'
import { GameSession } from '../session/GameSession'
import { prepareGame, randomSeed } from '../session/prepareGame'
import { toast } from '../ui/stores'
import { AppNav, type NavTarget } from './AppNav'
import type { Services } from './services'

// The 3D table (three.js) loads only when a game starts, keeping the other screens light.
const GameScreen = lazy(() => import('../screens/GameScreen').then((m) => ({ default: m.GameScreen })))

type Screen =
  | { kind: 'setup' }
  | { kind: 'about' }
  | { kind: 'decks' }
  | { kind: 'editor'; deckId: string }
  | { kind: 'presets' }
  | { kind: 'online' }
  | { kind: 'room'; roomId: string }
  | { kind: 'game'; session: GameSession; back: NavTarget }

// An invite link (#/sala/<id>) opens the room directly.
function screenFromHash(): Screen | null {
  const match = ROOM_HASH.exec(location.hash)
  return match ? { kind: 'room', roomId: match[1]! } : null
}

export default function App() {
  const catalog = useMemo(() => new ScryfallCatalog(), [])
  const presets = useMemo(() => new LocalPresetRepository(), [])
  const [decks, setDecks] = useState<DeckRepository | null>(null)
  const [screen, setScreen] = useState<Screen>(() => screenFromHash() ?? { kind: 'setup' })

  useEffect(() => {
    const onHash = () => {
      const next = screenFromHash()
      if (next) setScreen(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    openDeckRepository().then((repo) => {
      setDecks(repo)
      if (!repo.persistent) toast('Este navegador não deixou salvar dados: seus decks valem só até fechar a aba.')
    })
  }, [])

  if (!decks) return <div className="loading">Carregando…</div>
  const services: Services = { catalog, decks, presets }
  const go = (target: NavTarget) => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    setScreen({ kind: target })
  }

  // Goldfish straight from the editor or library: one seat, never blocked by the deck's rules.
  async function testDeck(deck: Deck) {
    try {
      const preset = presets.get(deck.presetId)
      const result = await prepareGame([{ name: 'Você', deck: { kind: 'saved', deck } }], preset, catalog, randomSeed(), Date.now(), false)
      if (!result.ok) return
      const problems = result.reports.flatMap((r) => r.violations)
      if (problems.length) toast(`Testando mesmo com ${problems.length} problema(s) nas regras "${preset.name}".`)
      setScreen({ kind: 'game', session: new GameSession(result.game), back: 'decks' })
    } catch {
      toast('Não foi possível carregar as cartas. Verifique a conexão.')
    }
  }

  if (screen.kind === 'game') {
    return (
      <Suspense fallback={<div className="loading">Montando a mesa…</div>}>
        <GameScreen session={screen.session} onExit={() => go(screen.back)} />
      </Suspense>
    )
  }

  if (screen.kind === 'room') {
    return (
      <div className="shell">
        <AppNav current="online" onNavigate={go} />
        <RoomScreen key={screen.roomId} services={services} roomId={screen.roomId} onLeave={() => go('online')} />
        <CardPreview />
        <Toasts />
      </div>
    )
  }

  return (
    <div className="shell">
      <AppNav current={screen.kind === 'editor' ? 'decks' : screen.kind} onNavigate={go} />
      {screen.kind === 'about' && <AboutScreen />}
      {screen.kind === 'decks' && (
        <DeckLibraryScreen services={services} onOpen={(deckId) => setScreen({ kind: 'editor', deckId })} onTest={testDeck} />
      )}
      {screen.kind === 'editor' && (
        <DeckEditorScreen services={services} deckId={screen.deckId} onBack={() => go('decks')} onTest={testDeck} />
      )}
      {screen.kind === 'presets' && <PresetsScreen presets={presets} />}
      {screen.kind === 'online' && <OnlineScreen onEnter={(roomId) => { location.hash = `#/sala/${roomId}` }} />}
      {screen.kind === 'setup' && (
        <SetupScreen services={services} onManagePresets={() => go('presets')}
          onStart={(game, notes) => {
            setScreen({ kind: 'game', session: new GameSession(game), back: 'setup' })
            notes.forEach((n) => toast(n))
          }} />
      )}
      <CardPreview />
      <Toasts />
    </div>
  )
}
