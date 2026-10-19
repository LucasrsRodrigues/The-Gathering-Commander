import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, reduce, replay, type Action, type CardRef, type GameState } from '../src'

const bolt: CardRef = { name: 'Bolt', typeLine: 'Instant', rules: deriveCardRules({ name: 'Bolt', typeLine: 'Instant', manaCost: '', oracleText: '', keywords: [], colorIdentity: [] }) }
const bear: CardRef = { name: 'Bear', typeLine: 'Creature — Bear', rules: deriveCardRules({ name: 'Bear', typeLine: 'Creature — Bear', manaCost: '{1}', oracleText: '', power: '2', toughness: '2', keywords: [], colorIdentity: [] }) }

// Default (Arena-style) stops, every turn rule on but mana off, so spells can be cast freely.
function game(timingRules: 'block' | 'off' = 'block'): { state: GameState; log: Action[] } {
  const deck = { commanders: [bear], cards: [...Array(10).fill(bolt), ...Array(50).fill(bear)] }
  let state = createGame({ seed: 8, startingPlayer: 'p1', ruleset: { timingRules, manaRules: 'off' }, players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }] })
  const log: Action[] = []
  while (state.pending?.kind === 'mulligan') {
    const a: Action = { type: 'keepHand', player: state.pending.player }
    log.push(a)
    state = mustDo(state, a)
  }
  return { state, log }
}
function mustDo(s: GameState, a: Action): GameState {
  const r = reduce(s, a)
  if (!r.ok) throw new Error(`${a.type}: ${r.error.message}`)
  return r.state
}
const pass = (s: GameState) => mustDo(s, { type: 'passPriority', player: s.priority!.player })
const handCard = (s: GameState, p: string, name: string) => s.zones[p]!.hand.find((id) => s.objects[id]!.card.name === name)

describe('automatic passing (Arena-style stops)', () => {
  it('the turn starts in the first main phase: upkeep and draw pass by themselves', () => {
    const { state } = game()
    expect(state.turn).toMatchObject({ number: 1, active: 'p1', step: 'main1' })
    expect(state.priority?.player).toBe('p1')
  })

  it('a turn with nothing to do takes two clicks', () => {
    let { state } = game()
    state = pass(state) // main 1 → (combat skipped) → main 2
    expect(state.turn.step).toBe('main2')
    state = pass(state) // main 2 → end → cleanup → next turn
    expect(state.turn).toMatchObject({ active: 'p2', step: 'main1' })
  })

  it('casting your own spell passes; the others get a chance to respond', () => {
    let { state } = game()
    const id = handCard(state, 'p1', 'Bolt') ?? handCard(state, 'p1', 'Bear')!
    state = mustDo(state, { type: 'castSpell', player: 'p1', objectId: id })
    expect(state.priority?.player).toBe('p2')
    expect(state.stack).toHaveLength(1)
  })

  it('"pass until end of turn" runs to the next turn; "until my turn" stops when someone casts', () => {
    let { state } = game()
    state = mustDo(state, { type: 'passUntil', player: 'p1', until: 'endOfTurn' })
    expect(state.turn.active).toBe('p2')
    expect(state.players.p1!.passUntil).toBeNull()
    state = mustDo(state, { type: 'passUntil', player: 'p1', until: 'myTurn' })
    const id = handCard(state, 'p2', 'Bolt') ?? handCard(state, 'p2', 'Bear')!
    state = mustDo(state, { type: 'castSpell', player: 'p2', objectId: id })
    expect(state.priority?.player).toBe('p1') // a spell from someone else ends the shortcut
    expect(state.players.p1!.passUntil).toBeNull()
  })

  it('your own stops are yours to change', () => {
    let { state } = game()
    state = mustDo(state, { type: 'setStops', player: 'p2', stops: { own: ['main1'], others: ['end'], passAfterOwnSpell: false } })
    state = pass(state) // p1 → main 2
    state = pass(state) // p1 passes main 2 → end step: p2 asked to stop there
    expect(state.turn).toMatchObject({ active: 'p1', step: 'end' })
    expect(state.priority?.player).toBe('p2')
  })

  it('the sandbox (turn rules off) keeps stopping at every step', () => {
    const { state } = game('off')
    expect(state.turn.step).toBe('upkeep')
  })
})

describe('stops never stall the game (fitness function)', () => {
  it('pressing "pass" (or answering what the game asks) always reaches the next turn, and replays the same', () => {
    let { state, log } = game()
    const initial = createGame({ seed: 8, startingPlayer: 'p1', ruleset: { timingRules: 'block', manaRules: 'off' }, players: [{ id: 'p1', name: 'Ana', deck: { commanders: [bear], cards: [...Array(10).fill(bolt), ...Array(50).fill(bear)] } }, { id: 'p2', name: 'Bia', deck: { commanders: [bear], cards: [...Array(10).fill(bolt), ...Array(50).fill(bear)] } }] })
    for (let turn = 0; turn < 8; turn++) {
      const start = state.turn.number
      let actions = 0
      while (state.turn.number === start && state.status === 'playing') {
        const p = state.pending
        const action: Action = p?.kind === 'declareAttackers' ? { type: 'declareAttackers', player: p.player, attacks: [] }
          : p?.kind === 'discard' ? { type: 'discard', player: p.player, objectIds: state.zones[p.player]!.hand.slice(0, p.count) }
          : state.turn.step === 'main1' && state.priority?.player === state.turn.active && state.zones[state.turn.active]!.hand.length > 3
            ? { type: 'castSpell', player: state.turn.active, objectId: state.zones[state.turn.active]!.hand.find((id) => state.objects[id]!.card.name === 'Bear') ?? state.zones[state.turn.active]!.hand[0]! }
            : { type: 'passPriority', player: state.priority!.player }
        log.push(action)
        state = mustDo(state, action)
        expect(++actions).toBeLessThan(40)
      }
    }
    const again = replay(initial, log)
    expect(again.ok && again.state).toEqual(state)
  })
})
