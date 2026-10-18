import { useSyncExternalStore } from 'react'
import type { GameSession } from './GameSession'

// Re-renders when the session changes; components then read view()/getLog() directly.
export function useSessionVersion(session: GameSession): number {
  return useSyncExternalStore(session.subscribe, session.getVersion)
}
