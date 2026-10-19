import { useSyncExternalStore } from 'react'
import type { GameSessionPort } from './port'

// Re-renders when the session changes; components then read view()/getLog() directly.
export function useSessionVersion(session: GameSessionPort): number {
  return useSyncExternalStore(session.subscribe, session.getVersion)
}
