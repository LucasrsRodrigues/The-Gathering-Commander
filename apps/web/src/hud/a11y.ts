// Keyboard and focus helpers shared by the HUD overlays (menu, zone viewer, curtain).

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'

// Index after moving `delta` steps through a ring of `length` items. From "nothing focused" (-1),
// forward lands on the first item and backward on the last.
export function wrapIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1
  if (current < 0) return delta >= 0 ? 0 : length - 1
  return (((current + delta) % length) + length) % length
}

export function focusables(container: HTMLElement | null): HTMLElement[] {
  return container ? [...container.querySelectorAll<HTMLElement>(FOCUSABLE)] : []
}

// Keeps Tab / Shift+Tab inside `container` (focus trap for modal overlays).
export function trapTab(e: KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== 'Tab') return
  const items = focusables(container)
  if (!items.length) return
  e.preventDefault()
  const i = items.indexOf(document.activeElement as HTMLElement)
  items[wrapIndex(i, e.shiftKey ? -1 : 1, items.length)]?.focus()
}

// While `active`, remembers what had focus before and gives it back on close, so keyboard users
// return to the card or button that opened the overlay.
export function useRestoreFocus(active: boolean) {
  const previous = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!active) return
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const el = previous.current
      // The opener may be gone (the card left the zone): fall back to the open modal, if any.
      if (el?.isConnected) el.focus()
      else focusables(document.querySelector<HTMLElement>('[aria-modal="true"]'))[0]?.focus()
    }
  }, [active])
}

// Moves focus into a container once it opens.
export function useFocusFirst(container: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    if (key) focusables(container.current)[0]?.focus()
  }, [container, key])
}

// Where to open a context menu. Mouse/touch use the pointer; a keyboard "click" (detail 0) or the
// context-menu key reports (0, 0), so the menu opens next to the element instead of the corner.
export function menuAnchor(
  event: { clientX: number; clientY: number; detail: number },
  rect: { left: number; right: number; top: number; bottom: number },
): { x: number; y: number } {
  const fromKeyboard = event.detail === 0 || (event.clientX === 0 && event.clientY === 0)
  return fromKeyboard ? { x: rect.right, y: rect.top } : { x: event.clientX, y: event.clientY }
}

// Global shortcuts (space = primary action) must not fire while the user operates a control.
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest('button, a[href], input, textarea, select, summary, [role="menuitem"], [contenteditable="true"]')
}
