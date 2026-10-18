// Copy-on-write transaction over an immutable GameState.
// Every sub-structure is copied at most once per action, so untouched parts are shared
// with the previous state (cheap undo history) and the input is never mutated.

import type {
  GameEvent, GameObject, GameState, ObjectId, PlayerId, PlayerState, PlayerZoneKind, StackItem,
} from './types'

export class Tx {
  readonly s: GameState
  readonly events: GameEvent[] = []
  private objectsRoot = false
  private readonly objectsCopied = new Set<ObjectId>()
  private playersRoot = false
  private readonly playersCopied = new Set<PlayerId>()
  private zonesRoot = false
  private readonly zonesCopied = new Set<string>()
  private battlefieldCopied = false
  private stackCopied = false

  constructor(base: GameState) {
    this.s = { ...base }
  }

  emit(event: GameEvent) {
    this.events.push(event)
  }

  newId(prefix: string): string {
    const id = `${prefix}${this.s.nextId}`
    this.s.nextId += 1
    return id
  }

  tick(): number {
    this.s.timestamp += 1
    return this.s.timestamp
  }

  // ---- reads (no copy) ----
  peekObject(id: ObjectId): GameObject | undefined {
    return this.s.objects[id]
  }

  peekPlayer(id: PlayerId): PlayerState | undefined {
    return this.s.players[id]
  }

  // ---- writable access (copy on first touch) ----
  object(id: ObjectId): GameObject {
    if (!this.objectsRoot) {
      this.s.objects = { ...this.s.objects }
      this.objectsRoot = true
    }
    const current = this.s.objects[id]
    if (!current) throw new Error(`unknown object ${id}`)
    if (!this.objectsCopied.has(id)) {
      const copy = { ...current, counters: { ...current.counters } }
      this.s.objects[id] = copy
      this.objectsCopied.add(id)
      return copy
    }
    return current
  }

  addObject(obj: GameObject) {
    if (!this.objectsRoot) {
      this.s.objects = { ...this.s.objects }
      this.objectsRoot = true
    }
    this.s.objects[obj.id] = obj
    this.objectsCopied.add(obj.id)
  }

  deleteObject(id: ObjectId) {
    if (!this.objectsRoot) {
      this.s.objects = { ...this.s.objects }
      this.objectsRoot = true
    }
    delete this.s.objects[id]
  }

  player(id: PlayerId): PlayerState {
    if (!this.playersRoot) {
      this.s.players = { ...this.s.players }
      this.playersRoot = true
    }
    const current = this.s.players[id]
    if (!current) throw new Error(`unknown player ${id}`)
    if (!this.playersCopied.has(id)) {
      const copy = { ...current, commanderDamage: { ...current.commanderDamage } }
      this.s.players[id] = copy
      this.playersCopied.add(id)
      return copy
    }
    return current
  }

  zone(owner: PlayerId, kind: PlayerZoneKind): ObjectId[] {
    if (!this.zonesRoot) {
      this.s.zones = { ...this.s.zones }
      this.zonesRoot = true
    }
    const key = `${owner}/${kind}`
    if (!this.zonesCopied.has(key)) {
      if (!this.zonesCopied.has(owner)) {
        const zones = this.s.zones[owner]
        if (!zones) throw new Error(`unknown player ${owner}`)
        this.s.zones[owner] = { ...zones }
        this.zonesCopied.add(owner)
      }
      const zones = this.s.zones[owner]!
      zones[kind] = zones[kind].slice()
      this.zonesCopied.add(key)
    }
    return this.s.zones[owner]![kind]
  }

  battlefield(): ObjectId[] {
    if (!this.battlefieldCopied) {
      this.s.battlefield = this.s.battlefield.slice()
      this.battlefieldCopied = true
    }
    return this.s.battlefield
  }

  stack(): StackItem[] {
    if (!this.stackCopied) {
      this.s.stack = this.s.stack.slice()
      this.stackCopied = true
    }
    return this.s.stack
  }
}
