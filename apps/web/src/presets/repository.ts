// House-rule presets saved in the browser. Stored through the same codec used for sharing, so anything
// read back (localStorage is writable by the whole origin) is validated exactly like an imported preset.

import { decodePreset, encodePreset, OFFICIAL_PRESET_ID, officialPreset, type Preset } from '@gathering-hall/formats'

const KEY = 'gh-presets-v1'
const MAX_PRESETS = 50

export interface PresetRepository {
  list(): Preset[] // the official preset first, then the group's presets
  get(id: string | undefined): Preset
  save(preset: Preset): void
  remove(id: string): void
}

export class LocalPresetRepository implements PresetRepository {
  private readonly storage: Storage | null

  constructor(storage: Storage | null = safeLocalStorage()) {
    this.storage = storage
  }

  list(): Preset[] {
    return [officialPreset(), ...this.custom()]
  }

  get(id: string | undefined): Preset {
    return this.custom().find((p) => p.id === id) ?? officialPreset()
  }

  save(preset: Preset) {
    if (preset.id === OFFICIAL_PRESET_ID) return
    const others = this.custom().filter((p) => p.id !== preset.id)
    this.write([...others, preset].slice(-MAX_PRESETS))
  }

  remove(id: string) {
    this.write(this.custom().filter((p) => p.id !== id))
  }

  private custom(): Preset[] {
    try {
      const raw: unknown = JSON.parse(this.storage?.getItem(KEY) ?? '[]')
      if (!Array.isArray(raw)) return []
      return raw.slice(0, MAX_PRESETS).flatMap((text) => {
        const decoded = typeof text === 'string' ? decodePreset(text) : null
        return decoded?.ok && decoded.preset.id !== OFFICIAL_PRESET_ID ? [decoded.preset] : []
      })
    } catch {
      return []
    }
  }

  private write(presets: Preset[]) {
    try {
      this.storage?.setItem(KEY, JSON.stringify(presets.map(encodePreset)))
    } catch {
      // Quota or private mode: presets live only for this session.
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
