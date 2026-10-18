import { lazy, Suspense, useMemo, useState } from 'react'
import { ScryfallCatalog } from '../catalog/scryfall'
import { AboutScreen } from '../screens/AboutScreen'
import { SetupScreen } from '../screens/SetupScreen'
import { GameSession } from '../session/GameSession'
import { toast } from '../ui/stores'

// The 3D table (three.js) loads only when a game starts, keeping the setup screen light.
const GameScreen = lazy(() => import('../screens/GameScreen').then((m) => ({ default: m.GameScreen })))

type Screen = { kind: 'setup' } | { kind: 'about' } | { kind: 'game'; session: GameSession }

export default function App() {
  const catalog = useMemo(() => new ScryfallCatalog(), [])
  const [screen, setScreen] = useState<Screen>({ kind: 'setup' })

  if (screen.kind === 'about') return <AboutScreen onBack={() => setScreen({ kind: 'setup' })} />
  if (screen.kind === 'game') {
    return (
      <Suspense fallback={<div className="loading">Montando a mesa…</div>}>
        <GameScreen session={screen.session} onExit={() => setScreen({ kind: 'setup' })} />
      </Suspense>
    )
  }
  return (
    <SetupScreen
      catalog={catalog}
      onAbout={() => setScreen({ kind: 'about' })}
      onStart={(game, notes) => {
        setScreen({ kind: 'game', session: new GameSession(game) })
        notes.forEach(toast)
      }}
    />
  )
}
