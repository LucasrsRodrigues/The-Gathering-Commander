import type { CardRef, PlayerId } from '@gathering-hall/engine'
import { createStore } from './store'

// Card shown enlarged on hover / long-press.
export const previewStore = createStore<CardRef | null>(null)

// Context menu for a card or a pile, positioned at the pointer.
export type MenuTarget =
  | { kind: 'object'; objectId: string }
  | { kind: 'library'; seat: PlayerId }
export const menuStore = createStore<{ target: MenuTarget; x: number; y: number } | null>(null)

// Camera focus: null = overview, otherwise a seat's area.
export const focusStore = createStore<PlayerId | null>(null)

// Zone viewer (graveyard, exile, command) as an accessible DOM list.
export const zoneViewerStore = createStore<{ seat: PlayerId; zone: 'graveyard' | 'exile' | 'command' } | null>(null)

// Short-lived messages (engine refusals, hints).
export interface Toast {
  id: number
  text: string
}
export const toastStore = createStore<Toast[]>([])
let toastId = 0
export function toast(text: string) {
  const id = ++toastId
  toastStore.set([...toastStore.get(), { id, text }].slice(-3))
  setTimeout(() => toastStore.set(toastStore.get().filter((t) => t.id !== id)), 3200)
}
