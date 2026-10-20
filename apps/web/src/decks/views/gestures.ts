// Card gestures in the editor (épico 10, req. 7): one set of pointer handlers for mouse and touch.
//   mouse: right click → menu; press and move a few pixels → drag.
//   touch: long press → menu; long press and then move → drag; moving before the long press is just scrolling.
// The click that follows a drag or a long press is swallowed, so it never opens the art picker by accident.

import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createStore } from '../../ui/store'

export const LONG_PRESS_MS = 450
const MOVE_TOLERANCE = 6 // px before a mouse press becomes a drag (or a touch stops being a long press)

export interface DragState {
  label: string
  image: string | null
  count: number // cards being dragged (selection)
  x: number
  y: number
  over: string | null // data-drop of the target under the pointer
}
export const dragStore = createStore<DragState | null>(null)

// The drop target under a point: the closest element with data-drop (the ghost ignores pointer events).
export function dropTargetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)
  return el?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
}

export interface GestureHandlers {
  onMenu: (x: number, y: number) => void
  onDragStart: () => { label: string; image: string | null; count: number } | null // null: this card cannot be dragged
  onDrop: (target: string) => void
}

export function useCardGestures(handlers: GestureHandlers) {
  const state = useRef<{
    id: number; type: string; x: number; y: number; timer: number | null; long: boolean; dragging: boolean
  } | null>(null)
  const swallow = useRef(false)

  const stopTouchScroll = (e: TouchEvent) => {
    if (state.current?.long || state.current?.dragging) e.preventDefault()
  }
  const cleanup = () => {
    const s = state.current
    if (s?.timer) clearTimeout(s.timer)
    document.removeEventListener('touchmove', stopTouchScroll)
    state.current = null
  }
  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const info = handlers.onDragStart()
    if (!info || !state.current) return false
    state.current.dragging = true
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStore.set({ ...info, x: e.clientX, y: e.clientY, over: dropTargetAt(e.clientX, e.clientY) })
    return true
  }

  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      cleanup()
      state.current = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, timer: null, long: false, dragging: false }
      if (e.pointerType !== 'mouse') {
        document.addEventListener('touchmove', stopTouchScroll, { passive: false })
        state.current.timer = window.setTimeout(() => {
          if (state.current) {
            state.current.long = true
            navigator.vibrate?.(10)
          }
        }, LONG_PRESS_MS)
      }
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const s = state.current
      if (!s || s.id !== e.pointerId) return
      if (s.dragging) {
        dragStore.set({ ...dragStore.get()!, x: e.clientX, y: e.clientY, over: dropTargetAt(e.clientX, e.clientY) })
        return
      }
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE
      if (!moved) return
      if (s.type === 'mouse' || s.long) {
        if (!startDrag(e)) cleanup()
      } else {
        cleanup() // the finger moved first: it is a scroll, not a press
      }
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const s = state.current
      if (!s || s.id !== e.pointerId) return
      if (s.dragging) {
        const target = dropTargetAt(e.clientX, e.clientY)
        dragStore.set(null)
        swallow.current = true
        if (target) handlers.onDrop(target)
      } else if (s.long) {
        swallow.current = true
        handlers.onMenu(e.clientX, e.clientY)
      }
      cleanup()
    },
    onPointerCancel() {
      if (state.current?.dragging) dragStore.set(null)
      cleanup()
    },
    // Right click (and the context-menu key); on touch the long press already opened the menu.
    onContextMenu(e: ReactMouseEvent<HTMLElement>) {
      e.preventDefault()
      if (state.current && state.current.type !== 'mouse') return
      const r = e.currentTarget.getBoundingClientRect()
      const fromKeyboard = e.clientX === 0 && e.clientY === 0
      handlers.onMenu(fromKeyboard ? r.right : e.clientX, fromKeyboard ? r.top : e.clientY)
    },
    // Call first in onClick: true when the click must be ignored (it ended a drag or a long press).
    consumeClick(): boolean {
      const was = swallow.current
      swallow.current = false
      return was
    },
  }
}
