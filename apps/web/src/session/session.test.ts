import { createGame, type CardRef } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { GameSession } from './GameSession'

const bear: CardRef = { name: 'Test Bear', typeLine: 'Creature — Bear' }
const deck = { commanders: [{ name: 'Boss', typeLine: 'Legendary Creature' }], cards: Array(40).fill(bear) }

function session(players: number) {
  return new GameSession(createGame({
    seed: 3, startingPlayer: 'p1',
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `J${i + 1}`, deck })),
  }))
}

describe('GameSession', () => {
  it('dispatches as the current seat, logs and undoes exactly', () => {
    const s = session(1)
    const before = s.getState()
    expect(s.dispatch({ type: 'keepHand' })).toBeNull()
    expect(s.getState().status).toBe('playing')
    expect(s.getLog().map((l) => l.text).join(' ')).toContain('manteve a mão')
    expect(s.undo()).toBe(true)
    expect(s.getState()).toBe(before)
  })

  it('returns engine errors without changing state', () => {
    const s = session(1)
    const before = s.getState()
    const error = s.dispatch({ type: 'draw', count: 1 })
    expect(error?.code).toBe('wrongPhase')
    expect(s.getState()).toBe(before)
    expect(s.canUndo()).toBe(false)
  })

  it('in hot-seat, follows the player the engine waits for and shows a curtain on change', () => {
    const s = session(2)
    expect(s.seat()).toBe('p1')
    expect(s.needsCurtain()).toBe(true)
    expect(s.view().viewer).toBeNull() // nothing private shown behind the curtain
    s.confirmSeat()
    expect(s.view().viewer).toBe('p1')
    s.dispatch({ type: 'keepHand' })
    expect(s.seat()).toBe('p2')
    expect(s.needsCurtain()).toBe(true)
  })

  it('goldfish never needs a curtain', () => {
    const s = session(1)
    expect(s.needsCurtain()).toBe(false)
    expect(s.view().viewer).toBe('p1')
  })
})
