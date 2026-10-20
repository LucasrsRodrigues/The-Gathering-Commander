// Cloud sync on the device (épico 08, req. 11–16). The browser's storage stays the working copy — the app reads and
// writes it with no network — and, while signed in, this engine keeps it in step with the account:
//   pull: what changed on the server since last time (server clock), newer versions replace local ones;
//   push: what changed here, last edit wins on the server; a 409 means another device was newer → adopt it.
// Presets have no edit time of their own, so the device keeps one per preset (PresetTimes).

import { OFFICIAL_PRESET_ID, sanitizeDeck, decodePreset, type Deck, type Preset } from '@gathering-hall/formats'
import type { DeckRepository } from '../decks/repository'
import type { PresetRepository } from '../presets/repository'
import { createStore } from '../ui/store'

type Kind = 'deck' | 'preset'
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

interface Doc {
  id: string
  data: unknown
  updatedAt: number
  deleted: boolean
}

interface Meta {
  since: number // server time of the last pull
  known: Record<Kind, Record<string, number>> // updatedAt of the version the server has, per id
  deleted: Record<Kind, Record<string, number>> // local deletions not sent yet (id → when)
}

const META_KEY = (userId: string) => `gh-cloud-v1:${userId}`
const TIMES_KEY = 'gh-preset-times-v1'
const emptyMeta = (): Meta => ({ since: 0, known: { deck: {}, preset: {} }, deleted: { deck: {}, preset: {} } })

// When each preset was last edited on this device (presets carry no timestamp).
export class PresetTimes {
  private readonly storage: Storage | null
  constructor(storage: Storage | null) {
    this.storage = storage
  }
  private read(): Record<string, number> {
    try {
      const raw: unknown = JSON.parse(this.storage?.getItem(TIMES_KEY) ?? '{}')
      return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {}
    } catch {
      return {}
    }
  }
  get(id: string): number {
    const t = this.read()[id]
    return typeof t === 'number' && Number.isFinite(t) ? t : 1 // unknown = older than any real edit
  }
  set(id: string, at: number) {
    try {
      this.storage?.setItem(TIMES_KEY, JSON.stringify({ ...this.read(), [id]: at }))
    } catch {
      // private mode: times live only for this session
    }
  }
  clear() {
    try {
      this.storage?.removeItem(TIMES_KEY)
    } catch {
      // ignore
    }
  }
}

export interface CloudSyncDeps {
  base: string
  decks: DeckRepository // the local (working) copy
  presets: PresetRepository
  times: PresetTimes
  storage: Storage | null
  fetchFn?: Fetch
  now?: () => number
  notice?: (message: string) => void // "your version was replaced by a newer one", limits…
}

export class CloudSync {
  private readonly d: Required<Omit<CloudSyncDeps, 'notice'>> & { notice: (m: string) => void }
  private userId: string | null = null
  private running: Promise<void> | null = null
  private again = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private applied = false
  // Bumped whenever a sync changed local decks or presets, so open lists can reload.
  readonly version = createStore(0)

  constructor(deps: CloudSyncDeps) {
    this.d = {
      fetchFn: (url, init) => fetch(url, init), now: () => Date.now(), notice: () => {},
      ...deps, base: deps.base.replace(/\/+$/, ''),
    }
  }

  get signedIn() {
    return this.userId !== null
  }

  // Called when the account state changes. Signing in syncs at once (first login uploads this device's decks).
  setUser(userId: string | null) {
    if (userId === this.userId) return
    this.userId = userId
    if (userId) void this.sync()
  }

  // Local edits (through the cloud repositories) ask for a sync shortly after.
  changed() {
    if (!this.userId) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.sync(), 1500)
  }

  deleted(kind: Kind, id: string) {
    if (!this.userId) return
    const meta = this.meta()
    meta.deleted[kind][id] = this.d.now()
    this.saveMeta(meta)
    this.changed()
  }

  // Signing out: keep a copy here, or remove the account's decks and presets from this browser (req. 16).
  async signOut(keepLocal: boolean) {
    const userId = this.userId
    this.userId = null
    if (this.timer) clearTimeout(this.timer)
    if (!userId) return
    try {
      this.d.storage?.removeItem(META_KEY(userId))
    } catch {
      // ignore
    }
    if (keepLocal) return
    for (const deck of await this.d.decks.list()) await this.d.decks.remove(deck.id)
    for (const preset of this.d.presets.list()) if (preset.id !== OFFICIAL_PRESET_ID) this.d.presets.remove(preset.id)
    this.d.times.clear()
  }

  // One sync at a time; a request during a run schedules one more right after.
  sync(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.run().finally(() => {
      this.running = null
      if (this.again) {
        this.again = false
        void this.sync()
      }
    })
    return this.running
  }

  private async run() {
    const userId = this.userId
    if (!userId) return
    const meta = this.meta()
    try {
      await this.pull(meta)
      await this.push(meta)
    } catch {
      // Offline or server error: local edits stay pending and go next time.
    }
    if (this.userId === userId) this.saveMeta(meta)
    if (this.applied) {
      this.applied = false
      this.version.set(this.version.get() + 1)
    }
  }

  private request(path: string, init: RequestInit = {}) {
    return this.d.fetchFn(`${this.d.base}${path}`, {
      ...init, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    })
  }

  private async pull(meta: Meta) {
    const res = await this.request(`/api/sync?since=${meta.since}`)
    if (!res.ok) throw new Error(`sync ${res.status}`)
    const body = (await res.json()) as { decks?: Doc[]; presets?: Doc[]; now?: number }
    for (const doc of body.decks ?? []) await this.applyDeck(meta, doc)
    for (const doc of body.presets ?? []) this.applyPreset(meta, doc)
    if (typeof body.now === 'number') meta.since = body.now
  }

  // A server version replaces the local one when it is newer than the local edit. Replacing an edit this device had
  // not sent yet is a discarded version: say so (req. 13).
  private async applyDeck(meta: Meta, doc: Doc): Promise<void> {
    const local = await this.d.decks.get(doc.id)
    const known = meta.known.deck[doc.id] ?? 0
    const localEdit = Math.max(local?.updatedAt ?? 0, meta.deleted.deck[doc.id] ?? 0)
    meta.known.deck[doc.id] = doc.updatedAt
    if (localEdit > doc.updatedAt) return // ours is newer: the push sends it
    if (local && local.updatedAt > known && local.updatedAt < doc.updatedAt) this.discarded(local.name)
    delete meta.deleted.deck[doc.id]
    this.applied = true
    if (doc.deleted) {
      if (local) await this.d.decks.remove(doc.id)
      return
    }
    const deck = sanitizeDeck(doc.data)
    if (deck) await this.d.decks.save({ ...deck, updatedAt: doc.updatedAt })
  }

  private applyPreset(meta: Meta, doc: Doc) {
    const local = this.d.presets.list().find((p) => p.id === doc.id && p.id !== OFFICIAL_PRESET_ID)
    const known = meta.known.preset[doc.id] ?? 0
    const localTime = local ? this.d.times.get(doc.id) : 0
    const localEdit = Math.max(localTime, meta.deleted.preset[doc.id] ?? 0)
    meta.known.preset[doc.id] = doc.updatedAt
    if (localEdit > doc.updatedAt) return
    if (local && localTime > known && localTime < doc.updatedAt) this.discarded(local.name)
    delete meta.deleted.preset[doc.id]
    this.applied = true
    if (doc.deleted) {
      if (local) this.d.presets.remove(doc.id)
      return
    }
    const decoded = decodePreset(JSON.stringify({ kind: 'gathering-hall/preset', v: 1, preset: doc.data }))
    if (!decoded.ok) return
    this.d.presets.save(decoded.preset)
    this.d.times.set(doc.id, doc.updatedAt)
  }

  private discarded(name: string) {
    this.d.notice(`"${name}" foi editado em outro aparelho depois: ficou a versão mais nova.`)
  }

  private async push(meta: Meta) {
    let limitShown = false
    // Another device was newer: adopt its version (applying it reports the discarded local edit).
    const conflict = (kind: Kind, doc: Doc) => (kind === 'deck' ? this.applyDeck(meta, doc) : Promise.resolve(this.applyPreset(meta, doc)))
    const send = async (kind: Kind, id: string, data: unknown | null, updatedAt: number) => {
      const path = `/api/${kind === 'deck' ? 'decks' : 'presets'}/${encodeURIComponent(id)}`
      const res = await this.request(path, { method: data === null ? 'DELETE' : 'PUT', body: JSON.stringify(data === null ? { updatedAt } : { data, updatedAt }) })
      const body = (await res.json().catch(() => ({}))) as { doc?: Doc; limit?: boolean; error?: string }
      if (res.ok) {
        meta.known[kind][id] = updatedAt
        if (data === null) delete meta.deleted[kind][id]
      } else if (res.status === 409 && body.limit) {
        if (!limitShown) this.d.notice(body.error ?? 'Limite da conta atingido.')
        limitShown = true
      } else if (res.status === 409 && body.doc) {
        if (data === null) delete meta.deleted[kind][id]
        await conflict(kind, body.doc)
      } else if (res.status === 422 || res.status === 413) {
        meta.known[kind][id] = updatedAt // the server will never take it: do not retry forever
      } else {
        throw new Error(`push ${res.status}`)
      }
    }

    for (const deck of await this.d.decks.list()) {
      if ((meta.known.deck[deck.id] ?? 0) < deck.updatedAt) await send('deck', deck.id, deck, deck.updatedAt)
    }
    for (const [id, at] of Object.entries(meta.deleted.deck)) await send('deck', id, null, at)
    for (const preset of this.d.presets.list()) {
      if (preset.id === OFFICIAL_PRESET_ID) continue
      const at = this.d.times.get(preset.id)
      if ((meta.known.preset[preset.id] ?? 0) < at) await send('preset', preset.id, preset, at)
    }
    for (const [id, at] of Object.entries(meta.deleted.preset)) await send('preset', id, null, at)
  }

  private meta(): Meta {
    if (!this.userId) return emptyMeta()
    try {
      const raw = JSON.parse(this.d.storage?.getItem(META_KEY(this.userId)) ?? 'null') as Meta | null
      if (raw && typeof raw.since === 'number' && raw.known && raw.deleted) return raw
    } catch {
      // corrupt: start over (a full sync is safe, last write wins)
    }
    return emptyMeta()
  }

  private saveMeta(meta: Meta) {
    if (!this.userId) return
    try {
      this.d.storage?.setItem(META_KEY(this.userId), JSON.stringify(meta))
    } catch {
      // ignore: the next sync is just a bigger one
    }
  }
}

// The repositories the app uses: local storage as before, plus a note to the sync engine on every change.
export class CloudDeckRepository implements DeckRepository {
  private readonly local: DeckRepository
  private readonly sync: CloudSync
  constructor(local: DeckRepository, sync: CloudSync) {
    this.local = local
    this.sync = sync
  }
  get persistent() {
    return this.local.persistent
  }
  list() {
    return this.local.list()
  }
  get(id: string) {
    return this.local.get(id)
  }
  async save(deck: Deck) {
    await this.local.save(deck)
    this.sync.changed()
  }
  async remove(id: string) {
    await this.local.remove(id)
    this.sync.deleted('deck', id)
  }
}

export class CloudPresetRepository implements PresetRepository {
  private readonly local: PresetRepository
  private readonly sync: CloudSync
  private readonly times: PresetTimes
  private readonly now: () => number
  constructor(local: PresetRepository, sync: CloudSync, times: PresetTimes, now: () => number = () => Date.now()) {
    this.local = local
    this.sync = sync
    this.times = times
    this.now = now
  }
  list() {
    return this.local.list()
  }
  get(id: string | undefined) {
    return this.local.get(id)
  }
  save(preset: Preset) {
    this.local.save(preset)
    this.times.set(preset.id, this.now())
    this.sync.changed()
  }
  remove(id: string) {
    this.local.remove(id)
    this.sync.deleted('preset', id)
  }
}
