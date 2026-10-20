import type { CardRef, ObjectView, PlayerId } from '@gathering-hall/engine'
import { createStore } from './store'

// Card shown enlarged on hover / long-press.
export const previewStore = createStore<CardRef | null>(null)
// The object on the table behind the preview, for its state (counters, current P/T…). The preview only uses it
// while previewStore holds this object's card, so places without an object (deck editor) never show a stale state.
export const previewObjectStore = createStore<ObjectView | null>(null)
export function showPreview(obj: ObjectView) {
  previewObjectStore.set(obj)
  previewStore.set(obj.card)
}

// Context menu for a card or a pile, positioned at the pointer.
export type MenuTarget =
  | { kind: 'object'; objectId: string }
  | { kind: 'library'; seat: PlayerId }
export const menuStore = createStore<{ target: MenuTarget; x: number; y: number } | null>(null)

// Camera focus: null = overview, otherwise a seat's area.
export const focusStore = createStore<PlayerId | null>(null)

// Zone viewer as an accessible DOM list. It is also the keyboard way into the battlefield,
// which is otherwise only reachable by pointer in the 3D scene.
export type ViewableZone = 'battlefield' | 'graveyard' | 'exile' | 'command'
export const zoneViewerStore = createStore<{ seat: PlayerId; zone: ViewableZone } | null>(null)

// Escape closes only the topmost layer: the card menu (which may sit on top of the zone viewer),
// then the zone viewer, then the camera focus. Returns false when nothing was open.
export function closeTopmost(): boolean {
  if (menuStore.get()) menuStore.set(null)
  else if (zoneViewerStore.get()) zoneViewerStore.set(null)
  else if (focusStore.get()) focusStore.set(null)
  else return false
  return true
}

// Short-lived messages (engine refusals, hints).
export interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void } // e.g. "Desfazer"
}
export const toastStore = createStore<Toast[]>([])
let toastId = 0
export function toast(text: string, action?: Toast['action'], ms = action ? 10_000 : 3200) {
  const id = ++toastId
  toastStore.set([...toastStore.get(), { id, text, ...(action ? { action } : {}) }].slice(-3))
  setTimeout(() => dismissToast(id), ms)
}
export function dismissToast(id: number) {
  toastStore.set(toastStore.get().filter((t) => t.id !== id))
}
