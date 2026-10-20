import { describe, expect, it } from 'vitest'
import type { ObjectView, PlayerView } from '@gathering-hall/engine'
import { closeTopmost, focusStore, menuStore, zoneViewerStore } from '../ui/stores'
import { menuAnchor, wrapIndex } from './a11y'
import { cardLabel, zoneIds } from './labels'

describe('wrapIndex (menu arrows and focus trap)', () => {
  it('cycles in both directions', () => {
    expect(wrapIndex(2, 1, 3)).toBe(0)
    expect(wrapIndex(0, -1, 3)).toBe(2)
    expect(wrapIndex(1, 1, 3)).toBe(2)
  })

  it('enters the ring from outside at the first or last item', () => {
    expect(wrapIndex(-1, 1, 4)).toBe(0)
    expect(wrapIndex(-1, -1, 4)).toBe(3)
    expect(wrapIndex(-1, 1, 0)).toBe(-1)
  })
})

describe('menuAnchor', () => {
  const rect = { left: 100, right: 180, top: 300, bottom: 412 }

  it('uses the pointer for mouse and touch', () => {
    expect(menuAnchor({ clientX: 120, clientY: 330, detail: 1 }, rect)).toEqual({ x: 120, y: 330 })
  })

  it('opens beside the element for keyboard activation', () => {
    expect(menuAnchor({ clientX: 0, clientY: 0, detail: 0 }, rect)).toEqual({ x: 180, y: 300 })
    expect(menuAnchor({ clientX: 0, clientY: 0, detail: 1 }, rect)).toEqual({ x: 180, y: 300 })
  })
})

describe('closeTopmost (Escape)', () => {
  it('closes one layer at a time: menu, then zone viewer, then camera focus', () => {
    menuStore.set({ target: { kind: 'library', seat: 'p1' }, x: 0, y: 0 })
    zoneViewerStore.set({ seat: 'p1', zone: 'graveyard' })
    focusStore.set('p2')
    expect(closeTopmost()).toBe(true)
    expect([menuStore.get(), zoneViewerStore.get(), focusStore.get()]).toEqual([null, { seat: 'p1', zone: 'graveyard' }, 'p2'])
    closeTopmost()
    expect(zoneViewerStore.get()).toBeNull()
    expect(focusStore.get()).toBe('p2')
    closeTopmost()
    expect(focusStore.get()).toBeNull()
    expect(closeTopmost()).toBe(false)
  })
})

describe('text alternatives', () => {
  const obj = (patch: Partial<ObjectView>): ObjectView => ({
    id: 'o1', owner: 'p1', controller: 'p1', zone: 'battlefield', card: { name: 'Llanowar Elves' }, tapped: false,
    faceDown: false, counters: {}, isToken: false, isCommander: false, commanderTax: 0, summoningSick: false, power: null, toughness: null, damage: 0,
    types: ['creature'], subtypes: ['Elf'], keywords: [], colors: ['G'], ...patch,
  })

  it('describes name, tapped state and counters', () => {
    expect(cardLabel(obj({}))).toBe('Llanowar Elves')
    expect(cardLabel(obj({ tapped: true, counters: { '+1/+1': 2 } }))).toBe('Llanowar Elves, virada, 2 marcador(es) +1/+1')
    expect(cardLabel(obj({ card: null }))).toBe('Carta virada para baixo')
    expect(cardLabel(undefined)).toBe('Carta')
  })

  it('lists the battlefield by controller and player zones top first', () => {
    const view = {
      battlefield: ['a', 'b', 'c'],
      objects: { a: obj({ id: 'a' }), b: obj({ id: 'b', controller: 'p2' }), c: obj({ id: 'c' }) },
      players: { p1: { graveyard: ['g1', 'g2'], exile: [], command: ['cmd'] } },
    } as unknown as PlayerView
    expect(zoneIds(view, 'p1', 'battlefield')).toEqual(['a', 'c'])
    expect(zoneIds(view, 'p1', 'graveyard')).toEqual(['g2', 'g1'])
    expect(zoneIds(view, 'p9', 'exile')).toEqual([])
  })
})
