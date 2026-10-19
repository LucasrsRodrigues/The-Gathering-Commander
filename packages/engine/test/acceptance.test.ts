// Épico 09 acceptance: a two-player game with every turn rule on goes from turn 1 to a player dying from combat
// damage, with no manual life change — lands, mana, casting, attacks, damage and cleanup all through the rules.

import { describe, expect, it } from 'vitest'
import { createGame, deriveCardRules, planPayment, reduce, type Action, type CardRef, type GameState } from '../src'

const forest: CardRef = { name: 'Forest', typeLine: 'Basic Land — Forest', rules: deriveCardRules({ name: 'Forest', typeLine: 'Basic Land — Forest', manaCost: '', oracleText: '({T}: Add {G}.)', keywords: [], colorIdentity: ['G'] }) }
const bear: CardRef = { name: 'Bear', typeLine: 'Creature — Bear', rules: deriveCardRules({ name: 'Bear', typeLine: 'Creature — Bear', manaCost: '{1}{G}', oracleText: '', power: '2', toughness: '2', keywords: [], colorIdentity: ['G'] }) }
const boss: CardRef = { name: 'Boss', typeLine: 'Legendary Creature — Elf', rules: deriveCardRules({ name: 'Boss', typeLine: 'Legendary Creature — Elf', manaCost: '{4}{G}', oracleText: '', power: '3', toughness: '3', keywords: [], colorIdentity: ['G'] }) }

function must(s: GameState, a: Action): GameState {
  const r = reduce(s, a)
  if (!r.ok) throw new Error(`${a.type}: ${r.error.message}`)
  if (r.events.some((e) => e.type === 'ruleBent' || e.type === 'judgeAction')) throw new Error(`${a.type} bent a rule`)
  return r.state
}

// One sensible move for whoever the game waits on.
function move(s: GameState): Action {
  const p = s.pending
  if (p?.kind === 'mulligan') return { type: 'keepHand', player: p.player }
  if (p?.kind === 'declareAttackers') {
    const ready = s.battlefield.filter((id) => {
      const o = s.objects[id]!
      return o.controller === p.player && !o.tapped && o.card.rules?.types.includes('creature') && o.controlledSince < s.turn.number
    })
    const foe = s.seats.find((x) => x !== p.player)!
    return { type: 'declareAttackers', player: p.player, attacks: ready.map((attacker) => ({ attacker, target: foe })) }
  }
  if (p?.kind === 'declareBlockers') return { type: 'declareBlockers', player: p.player, blocks: [] }
  if (p?.kind === 'confirmDamage') return { type: 'assignDamage', player: p.player, assignments: p.proposal.assignments }
  if (p?.kind === 'discard') return { type: 'discard', player: p.player, objectIds: s.zones[p.player]!.hand.slice(0, p.count) }
  const me = s.turn.active
  if (s.turn.step === 'main1' && s.priority?.player === me && !s.stack.length) {
    const land = s.zones[me]!.hand.find((id) => s.objects[id]!.card.name === 'Forest')
    if (land && s.players[me]!.landsPlayed < 1) return { type: 'playLand', player: me, objectId: land }
    for (const id of s.zones[me]!.hand) {
      const plan = s.objects[id]!.card.name === 'Bear' ? planPayment(s, me, id) : null
      if (plan) return { type: 'castSpell', player: me, objectId: id, payWith: plan }
    }
  }
  return { type: 'passPriority', player: s.priority!.player }
}

describe('épico 09 acceptance', () => {
  it('a game ends by combat damage with every rule enforced and no manual life change', () => {
    const deck = { commanders: [boss], cards: Array.from({ length: 60 }, (_, i) => (i % 2 ? forest : bear)) }
    let s = createGame({ seed: 11, startingPlayer: 'p1', ruleset: { startingLife: 10 }, players: [{ id: 'p1', name: 'Ana', deck }, { id: 'p2', name: 'Bia', deck }] })
    expect(s.ruleset).toMatchObject({ timingRules: 'block', manaRules: 'block', combatRules: 'block' })
    let combatDamage = 0
    for (let i = 0; i < 3000 && s.status !== 'ended'; i++) {
      const action = move(s)
      if (action.type === 'assignDamage') combatDamage++
      expect(action.type).not.toBe('adjustLife')
      s = must(s, action)
    }
    expect(s.status).toBe('ended')
    expect(combatDamage).toBeGreaterThan(0)
    const loser = s.seats.find((id) => s.players[id]!.lost)!
    expect(s.players[loser]!.lossReason).toBe('life')
  })
})
