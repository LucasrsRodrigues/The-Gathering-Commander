import { describe, expect, it } from 'vitest'
import { reduce, type CardRules, type GameState, type RuleLevel, type Step } from '../src'
import { act, keepAll, newGame } from './helpers'

function game(timingRules: RuleLevel = 'block', landsPerTurn = 1) {
  return keepAll(newGame(2, { ruleset: { timingRules, landsPerTurn } }))
}

// The active player walks the turn forward (relaxed priority) until `step`.
function toStep(state: GameState, step: Step): GameState {
  let s = state
  for (let i = 0; i < 20 && s.turn.step !== step; i++) s = act(s, { type: 'advanceStep', player: s.turn.active }).state
  return s
}

function nextTurn(state: GameState): GameState {
  let s = state
  const active = s.turn.active
  for (let i = 0; i < 20 && s.turn.active === active; i++) {
    s = s.pending?.kind === 'discard'
      ? act(s, { type: 'discard', player: s.pending.player, objectIds: s.zones[s.pending.player]!.hand.slice(0, s.pending.count) }).state
      : act(s, { type: 'advanceStep', player: s.turn.active }).state
  }
  return s
}

// Puts a card of the given kind from the library into the player's hand (a free manual move).
function give(state: GameState, player: string, kind: 'Land' | 'Creature' | 'Instant'): [GameState, string] {
  const id = state.zones[player]!.library.find((o) => state.objects[o]!.card.typeLine?.includes(kind))!
  return [act(state, { type: 'moveObject', player, objectId: id, to: 'hand' }).state, id]
}

function withRules(state: GameState, id: string, rules: Partial<CardRules>): GameState {
  const s = structuredClone(state)
  const base: CardRules = { types: [], supertypes: [], subtypes: [], cost: null, power: null, toughness: null, loyalty: null, keywords: [], manaAbilities: [], colorIdentity: [] }
  s.objects[id]!.card.rules = { ...base, ...rules }
  return s
}

const codeOf = (state: GameState, action: Parameters<typeof reduce>[1]) => {
  const r = reduce(state, action)
  return r.ok ? 'ok' : (r.error.findings?.[0]?.code ?? r.error.code)
}

describe('playing lands (CR 305)', () => {
  it('one land per turn, in a main phase of your own turn', () => {
    let [s, land] = give(game(), 'p1', 'Land')
    let land2: string
    ;[s, land2] = give(s, 'p1', 'Land')
    expect(codeOf(s, { type: 'playLand', player: 'p1', objectId: land })).toBe('notMainPhase')
    s = toStep(s, 'main1')
    s = act(s, { type: 'playLand', player: 'p1', objectId: land }).state
    expect(s.objects[land]!.zone).toBe('battlefield')
    expect(s.players.p1!.landsPlayed).toBe(1)
    expect(codeOf(s, { type: 'playLand', player: 'p1', objectId: land2 })).toBe('landLimit')
  })

  it('house rules may allow more lands; the count resets each turn', () => {
    let s = game('block', 2)
    const lands: string[] = []
    for (let i = 0; i < 3; i++) {
      const [next, id] = give(s, 'p1', 'Land')
      s = next
      lands.push(id)
    }
    s = toStep(s, 'main1')
    s = act(s, { type: 'playLand', player: 'p1', objectId: lands[0]! }).state
    s = act(s, { type: 'playLand', player: 'p1', objectId: lands[1]! }).state
    expect(codeOf(s, { type: 'playLand', player: 'p1', objectId: lands[2]! })).toBe('landLimit')
    s = nextTurn(nextTurn(s)) // p2's turn, then p1's again
    expect(s.turn.active).toBe('p1')
    expect(s.players.p1!.landsPlayed).toBe(0)
    s = act(toStep(s, 'main1'), { type: 'playLand', player: 'p1', objectId: lands[2]! }).state
    expect(s.objects[lands[2]!]!.zone).toBe('battlefield')
  })

  it('not on another player\'s turn', () => {
    let [s, land] = give(game(), 'p2', 'Land')
    s = toStep(s, 'main1')
    expect(codeOf(s, { type: 'playLand', player: 'p2', objectId: land })).toBe('notYourTurn')
  })

  it('lands that enter tapped do', () => {
    let [s, land] = give(game(), 'p1', 'Land')
    s = withRules(toStep(s, 'main1'), land, { types: ['land'], entersTapped: true })
    expect(act(s, { type: 'playLand', player: 'p1', objectId: land }).state.objects[land]!.tapped).toBe(true)
  })
})

describe('casting spells (CR 307, 117)', () => {
  it('sorcery-speed spells only in your main phase with an empty stack', () => {
    let [s, bear] = give(game(), 'p1', 'Creature')
    let bolt: string
    ;[s, bolt] = give(s, 'p1', 'Instant')
    expect(codeOf(s, { type: 'castSpell', player: 'p1', objectId: bear })).toBe('notMainPhase')
    s = toStep(s, 'main1')
    s = act(s, { type: 'castSpell', player: 'p1', objectId: bolt }).state // instant first, so the stack is not empty
    let bear2: string
    ;[s, bear2] = give(s, 'p1', 'Creature')
    expect(codeOf(s, { type: 'castSpell', player: 'p1', objectId: bear2 })).toBe('stackNotEmpty')
    expect(codeOf(s, { type: 'castSpell', player: 'p1', objectId: bear })).toBe('stackNotEmpty')
  })

  it('instants and Flash need only priority, even on another turn', () => {
    let [s, bolt] = give(game(), 'p2', 'Instant')
    let flash: string
    ;[s, flash] = give(s, 'p2', 'Creature')
    s = toStep(s, 'main1')
    expect(codeOf(s, { type: 'castSpell', player: 'p2', objectId: bolt })).toBe('noPriority')
    s = act(s, { type: 'passPriority', player: 'p1' }).state // p2 now has priority
    s = withRules(s, flash, { types: ['creature'], keywords: ['flash'] })
    s = act(s, { type: 'castSpell', player: 'p2', objectId: bolt }).state
    s = act(s, { type: 'castSpell', player: 'p2', objectId: flash }).state
    expect(s.stack.map((i) => i.objectId)).toEqual([bolt, flash])
  })

  it('the commander follows its type and counts the cast', () => {
    let s = game()
    const commander = s.zones.p1!.command[0]!
    expect(codeOf(s, { type: 'castSpell', player: 'p1', objectId: commander })).toBe('notMainPhase')
    s = act(toStep(s, 'main1'), { type: 'castSpell', player: 'p1', objectId: commander }).state
    expect(s.objects[commander]).toMatchObject({ zone: 'stack', commanderCasts: 1 })
  })

  it('records X on the stack', () => {
    let [s, bear] = give(game(), 'p1', 'Creature')
    s = act(toStep(s, 'main1'), { type: 'castSpell', player: 'p1', objectId: bear, x: 4 }).state
    expect(s.stack.at(-1)).toMatchObject({ objectId: bear, x: 4 })
  })

  it('warn lets an out-of-time spell through and logs it', () => {
    const [s, bear] = give(game('warn'), 'p1', 'Creature')
    const { state, events } = act(s, { type: 'castSpell', player: 'p1', objectId: bear })
    expect(state.objects[bear]!.zone).toBe('stack')
    expect(events).toContainEqual(expect.objectContaining({ type: 'ruleBent', code: 'notMainPhase' }))
  })
})

describe('playLand / castSpell are not free moves', () => {
  it('rejects the wrong kind of card and cards that are not yours to play', () => {
    let [s, land] = give(game('off'), 'p1', 'Land')
    let bear: string
    ;[s, bear] = give(s, 'p1', 'Creature')
    expect(codeOf(s, { type: 'castSpell', player: 'p1', objectId: land })).toBe('invalidAction')
    expect(codeOf(s, { type: 'playLand', player: 'p1', objectId: bear })).toBe('invalidAction')
    expect(codeOf(s, { type: 'castSpell', player: 'p2', objectId: bear })).toBe('unknownObject') // never reveals p1's hand
    expect(codeOf(s, { type: 'castSpell', player: 'p1', objectId: bear, x: 1.5 })).toBe('invalidAmount')
  })
})
