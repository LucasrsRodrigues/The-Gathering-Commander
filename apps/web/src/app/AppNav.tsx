import type { ReactNode } from 'react'
import { FanContentNotice } from '../legal/FanContentNotice'

export type NavTarget = 'setup' | 'online' | 'decks' | 'presets' | 'about' | 'account'

const ITEMS: { target: NavTarget; label: string }[] = [
  { target: 'setup', label: 'Jogar' },
  { target: 'online', label: 'Online' },
  { target: 'decks', label: 'Decks' },
  { target: 'presets', label: 'Regras da casa' },
  { target: 'about', label: 'Sobre' },
]

export function AppNav({ current, onNavigate, end }: { current: string; onNavigate: (t: NavTarget) => void; end?: ReactNode }) {
  return (
    <header className="app-nav">
      <span className="brand">The Gathering Hall</span>
      <nav aria-label="Principal">
        {ITEMS.map((item) => (
          <button key={item.target} className="nav-link" aria-current={current === item.target ? 'page' : undefined}
            onClick={() => onNavigate(item.target)}>
            {item.label}
          </button>
        ))}
      </nav>
      {end}
    </header>
  )
}

export function AppFooter() {
  return (
    <footer className="app-foot">
      <FanContentNotice />
    </footer>
  )
}
