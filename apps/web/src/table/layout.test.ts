import { createGame, reduce, viewFor, type Action, type CardRef, type GameState } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { layoutTable, seatOrder } from './layout'

const bear: CardRef = { name: 'Bear', typeLine: 'Creature — Bear' }
const land: CardRef = { name: 'Forest', typeLine: 'Basic Land — Forest' }

function game(players: number): GameState {
  let s = createGame({
    seed: 5, startingPlayer: 'p1',
    players: Array.from({ length: players }, (_, i) => ({
      id: `p${i + 1}`, name: `J${i + 1}`,
      deck: { commanders: [{ name: 'Boss', typeLine: 'Legendary Creature' }], cards: [...Array(20).fill(bear), ...Array(20).fill(land)] },
    })),
  })
  while (s.pending) s = must(s, { type: 'keepHand', player: s.pending.player })
  for (const p of s.seats) for (const id of s.zones[p]!.hand.slice(0, 3)) s = must(s, { type: 'moveObject', player: p, objectId: id, to: 'battlefield' })
  return s
}

function must(s: GameState, a: Action): GameState {
  const r = reduce(s, a)
  if (!r.ok) throw new Error(r.error.message)
  return r.state
}

describe('layoutTable', () => {
  it('puts the viewer in front and opponents behind, in turn order', () => {
    const s = game(4)
    const view = viewFor(s, 'p3')
    expect(seatOrder(view, 'p3')).toEqual(['p3', 'p4', 'p1', 'p2'])
    const layout = layoutTable(view, 'p3')
    for (const id of s.battlefield) {
      const at = layout.cards.get(id)!
      expect(at.z > 0).toBe(s.objects[id]!.controller === 'p3')
    }
    const xs = layout.areas.filter((a) => !a.local).map((a) => a.x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
  })

  it('places every battlefield and command-zone object, honouring manual arrangement', () => {
    let s = game(2)
    const id = s.battlefield[0]!
    s = must(s, { type: 'setArrangement', player: s.objects[id]!.controller, objectId: id, arrangement: { x: 3, z: 1 } })
    const layout = layoutTable(viewFor(s, 'p1'), 'p1')
    for (const obj of s.battlefield) expect(layout.cards.has(obj)).toBe(true)
    for (const p of s.seats) expect(layout.cards.has(s.zones[p]!.command[0]!)).toBe(true)
    expect(layout.cards.get(id)).toMatchObject({ x: 3, z: 1 })
  })

  it('floats stack objects above the middle of the table', () => {
    let s = game(2)
    const card = s.zones.p1!.hand[0]!
    s = must(s, { type: 'moveObject', player: 'p1', objectId: card, to: 'stack' })
    expect(layoutTable(viewFor(s, 'p1'), 'p1').cards.get(card)).toMatchObject({ floating: true, z: 0 })
  })

  it('keeps cards inside the table even with a crowded board', () => {
    let s = game(4)
    for (let i = 0; i < 25; i++) s = must(s, { type: 'createToken', player: 'p2', card: { name: 'Goblin', typeLine: 'Token Creature — Goblin' } })
    const layout = layoutTable(viewFor(s, 'p1'), 'p1')
    for (const at of layout.cards.values()) {
      expect(Math.abs(at.x)).toBeLessThanOrEqual(13)
      expect(Math.abs(at.z)).toBeLessThanOrEqual(8)
    }
  })
})
