import type { CardRules, Keyword, ObjectView, PlayerView } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { attackOptions, blockOptions, damagePreview } from './combatOptions'

const rules = (power: number, toughness: number, keywords: Keyword[] = [], types: CardRules['types'] = ['creature']): CardRules =>
  ({ types, supertypes: [], subtypes: [], cost: null, power, toughness, loyalty: null, keywords, manaAbilities: [], colorIdentity: [] })
const obj = (id: string, controller: string, name: string, r: CardRules, extra: Partial<ObjectView> = {}): ObjectView => ({
  id, owner: controller, controller, zone: 'battlefield', card: { name, rules: r }, tapped: false, faceDown: false, counters: {},
  isToken: false, isCommander: false, commanderTax: 0, summoningSick: false, power: r.power, toughness: r.toughness, damage: 0, ...extra,
})
const player = (id: string, name: string) => ({
  id, name, life: 40, poison: 0, commanderDamage: {}, mulligans: 0, hasKept: true, lost: false,
  manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, landsPlayed: 0, handCount: 0, libraryCount: 0, hand: [], graveyard: [], exile: [], command: [],
})

function view(objects: ObjectView[], combat: PlayerView['turn']['combat'] = null): PlayerView {
  return {
    viewer: 'p1', status: 'playing', seats: ['p1', 'p2', 'p3'], turn: { number: 3, active: 'p1', step: 'declareAttackers', combat },
    priority: null, pending: null, winners: null, ruleset: {} as PlayerView['ruleset'],
    players: { p1: player('p1', 'Ana'), p2: player('p2', 'Bia'), p3: { ...player('p3', 'Caio'), lost: true } },
    objects: Object.fromEntries(objects.map((o) => [o.id, o])), battlefield: objects.map((o) => o.id), stack: [],
  }
}

describe('combat choices on the table', () => {
  it('attack with untapped creatures at living opponents and their planeswalkers', () => {
    const v = view([
      obj('a', 'p1', 'Bear', rules(2, 2)), obj('b', 'p1', 'Tapped', rules(1, 1), { tapped: true }),
      obj('w', 'p2', 'Ajani', rules(0, 0, [], ['planeswalker'])), obj('x', 'p2', 'Pup', rules(1, 1)),
    ])
    const { creatures, targets } = attackOptions(v, 'p1')
    expect(creatures.map((c) => c.id)).toEqual(['a'])
    expect(targets).toEqual([{ id: 'p2', label: 'Bia' }, { id: 'w', label: 'Ajani (de Bia)' }])
  })

  it('block only what attacks you, and say what is special about it', () => {
    const v = view(
      [obj('a', 'p1', 'Angel', rules(4, 4, ['flying'])), obj('m', 'p1', 'Brute', rules(3, 3, ['menace'])), obj('x', 'p2', 'Pup', rules(1, 1))],
      { attacks: [{ attacker: 'a', target: 'p2' }, { attacker: 'm', target: 'p3' }], blocks: [], damageOrder: {}, firstStrikeDealt: false, regularDealt: false },
    )
    const { attackers, blockers } = blockOptions(v, 'p2')
    expect(attackers).toEqual([{ id: 'a', label: 'Angel 4/4 · Flying' }])
    expect(blockers.map((b) => b.id)).toEqual(['x'])
  })

  it('previews deaths, life and commander damage', () => {
    const v = view([
      obj('a', 'p1', 'Boss', rules(3, 3, ['lifelink']), { isCommander: true }), obj('d', 'p1', 'Viper', rules(1, 1, ['deathtouch'])),
      obj('x', 'p2', 'Wall', rules(0, 5)), obj('i', 'p2', 'Golem', rules(1, 1, ['indestructible'])),
    ])
    const preview = damagePreview(v, [
      { source: 'a', to: 'p2', amount: 3 }, { source: 'd', to: 'x', amount: 1 }, { source: 'x', to: 'd', amount: 0 }, { source: 'd', to: 'i', amount: 0 },
    ])
    expect(preview.dies).toEqual(['Wall'])
    expect(preview.life).toEqual([{ player: 'p2', name: 'Bia', delta: -3 }, { player: 'p1', name: 'Ana', delta: 3 }])
    expect(preview.commander).toEqual([{ player: 'p2', name: 'Bia', source: 'Boss', total: 3 }])
  })
})
