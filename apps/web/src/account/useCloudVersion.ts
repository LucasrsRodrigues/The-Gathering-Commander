import { createStore, useStore } from '../ui/store'
import type { Services } from '../app/services'

const none = createStore(0)

// Changes whenever the cloud sync brought decks or presets from another device (0 without an account).
export function useCloudVersion(services: Services): number {
  return useStore(services.cloud?.version ?? none)
}
