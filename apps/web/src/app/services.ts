import type { CatalogPort } from '../catalog/catalog'
import type { LegalityPort } from '../catalog/gatheringHall'
import type { CloudSync } from '../account/cloudSync'
import type { DeckRepository } from '../decks/repository'
import type { PresetRepository } from '../presets/repository'

// The adapters screens depend on (ports), created once by the App.
export interface Services {
  catalog: CatalogPort
  legality?: LegalityPort // dated banlists; only with the Gathering Hall server
  decks: DeckRepository
  presets: PresetRepository
  cloud?: CloudSync // while signed in, decks and presets also live in the account
}
