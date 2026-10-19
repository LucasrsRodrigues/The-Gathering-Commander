import type { CatalogPort } from '../catalog/catalog'
import type { DeckRepository } from '../decks/repository'
import type { PresetRepository } from '../presets/repository'

// The adapters screens depend on (ports), created once by the App.
export interface Services {
  catalog: CatalogPort
  decks: DeckRepository
  presets: PresetRepository
}
