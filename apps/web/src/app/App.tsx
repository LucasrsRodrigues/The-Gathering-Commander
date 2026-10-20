import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AccountNav } from '../account/AccountNav'
import { AccountClient } from '../account/client'
import { CloudDeckRepository, CloudPresetRepository, CloudSync, PresetTimes } from '../account/cloudSync'
import { SignOutDialog } from '../account/SignOutDialog'
import { createStore, useStore } from '../ui/store'
import { GatheringHallCatalog } from '../catalog/gatheringHall'
import { ScryfallCatalog } from '../catalog/scryfall'
import { SERVER_HTTP } from '../net/config'
import type { Deck } from '../decks/model'
import { openDeckRepository, type DeckRepository } from '../decks/repository'
import { CardPreview, Toasts } from '../hud/Overlays'
import { LocalPresetRepository } from '../presets/repository'
import { AboutScreen } from '../screens/AboutScreen'
import { AccountScreen } from '../screens/AccountScreen'
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
  | { kind: 'account'; error: string | null }
  | { kind: 'game'; session: GameSession; back: NavTarget }

// An invite link (#/sala/<id>) opens the room directly.
// An invite link (#/sala/<id>) opens the room directly; the login comes back to #/conta (maybe with ?erro=…).
function screenFromHash(): Screen | null {
  const match = ROOM_HASH.exec(location.hash)
  if (match) return { kind: 'room', roomId: match[1]! }
  const account = /^#\/conta(?:\?erro=([a-z-]{1,40}))?$/.exec(location.hash)
  if (account) return { kind: 'account', error: account[1] ?? null }
  return null
}

export default function App() {
  const catalog = useMemo(() => new GatheringHallCatalog(SERVER_HTTP, new ScryfallCatalog()), [])
  const localPresets = useMemo(() => new LocalPresetRepository(), [])
  const account = useMemo(() => new AccountClient(SERVER_HTTP), [])
  useEffect(() => {
    void account.refresh()
  }, [account])
  const [decks, setDecks] = useState<DeckRepository | null>(null)
  const [cloud, setCloud] = useState<{ sync: CloudSync; presets: CloudPresetRepository } | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const accountState = useStore(account.state)
  const cloudVersion = useStore(cloud?.sync.version ?? NO_CLOUD)
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
      // Decks and presets stay in this browser; with an account the cloud sync keeps them in step (épico 08).
      const storage = safeStorage()
      const times = new PresetTimes(storage)
      const sync = new CloudSync({ base: SERVER_HTTP, decks: repo, presets: localPresets, times, storage, notice: (m) => toast(m) })
      setCloud({ sync, presets: new CloudPresetRepository(localPresets, sync, times) })
      setDecks(new CloudDeckRepository(repo, sync))
      if (!repo.persistent) toast('Este navegador não deixou salvar dados: seus decks valem só até fechar a aba.')
    })
  }, [localPresets])

  // Signed in → sync now, every 2 minutes and when the app gets focus back.
  useEffect(() => {
    if (!cloud) return
    cloud.sync.setUser(accountState.status === 'signedIn' ? accountState.account.id : null)
    if (accountState.status !== 'signedIn') return
    const tick = () => void cloud.sync.sync()
    const timer = setInterval(tick, 2 * 60 * 1000)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', tick)
    }
  }, [cloud, accountState])

  if (!decks || !cloud) return <div className="loading">Carregando…</div>
  const presets = cloud.presets
  const signOut = async (keepLocal: boolean) => {
    await cloud.sync.sync() // send pending edits first
    await cloud.sync.signOut(keepLocal)
    await account.logout()
    toast(keepLocal ? 'Você saiu. Uma cópia dos decks ficou neste navegador.' : 'Você saiu, e os decks da conta saíram deste navegador.')
  }
  const services: Services = { catalog, legality: catalog, decks, presets, cloud: cloud.sync }
  const go = (target: NavTarget) => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    setScreen(target === 'account' ? { kind: 'account', error: null } : { kind: target })
  }
  const accountNav = <AccountNav client={account} onOpenAccount={() => go('account')} onSignOut={() => setSigningOut(true)} />
  const signOutDialog = signingOut && <SignOutDialog onClose={() => setSigningOut(false)} onSignOut={signOut} />

  // Goldfish straight from the editor or library: one seat, never blocked by the deck's rules.
  async function testDeck(deck: Deck) {
    try {
      const preset = presets.get(deck.presetId)
      const result = await prepareGame([{ name: 'Você', deck: { kind: 'saved', deck } }], preset, catalog, randomSeed(), Date.now(), false, catalog)
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
        <AppNav current="online" onNavigate={go} end={accountNav} />
        {signOutDialog}
        <RoomScreen key={screen.roomId} services={services} roomId={screen.roomId} onLeave={() => go('online')} />
        <CardPreview />
        <Toasts />
      </div>
    )
  }

  return (
    <div className="shell">
      <AppNav current={screen.kind === 'editor' ? 'decks' : screen.kind} onNavigate={go}
        end={accountNav} />
      {screen.kind === 'account' && <AccountScreen client={account} error={screen.error} onSignOut={() => setSigningOut(true)} />}
      {signOutDialog}
      {screen.kind === 'about' && <AboutScreen />}
      {screen.kind === 'decks' && (
        <DeckLibraryScreen services={services} onOpen={(deckId) => setScreen({ kind: 'editor', deckId })} onTest={testDeck} />
      )}
      {screen.kind === 'editor' && (
        <DeckEditorScreen services={services} deckId={screen.deckId} onBack={() => go('decks')} onTest={testDeck} />
      )}
      {screen.kind === 'presets' && <PresetsScreen presets={presets} cloudVersion={cloudVersion} />}
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

const NO_CLOUD = createStore(0)

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
