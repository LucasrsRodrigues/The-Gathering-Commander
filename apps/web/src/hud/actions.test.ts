import type { ObjectView } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { isLandCard, menuFor, needsX, playFromHand } from './actions'
import { describeIntent } from './labels'

const obj = (card: ObjectView['card'], zone: ObjectView['zone'] = 'hand'): ObjectView => ({
  id: 'o1', owner: 'p1', controller: 'p1', zone, card, tapped: false, faceDown: false, counters: {}, isToken: false,
  isCommander: zone === 'command', commanderTax: 0,
})

describe('playing from hand', () => {
  it('lands are played, everything else is cast (Dryad Arbor is a land)', () => {
    expect(playFromHand(obj({ name: 'Forest', typeLine: 'Basic Land — Forest' }))).toEqual({ type: 'playLand', objectId: 'o1' })
    expect(playFromHand(obj({ name: 'Dryad Arbor', typeLine: 'Land Creature — Forest Dryad' }))).toEqual({ type: 'playLand', objectId: 'o1' })
    expect(playFromHand(obj({ name: 'Bear', typeLine: 'Creature — Bear' }))).toEqual({ type: 'castSpell', objectId: 'o1' })
    expect(isLandCard(obj({ name: 'Delver', typeLine: 'Creature — Human // Land' }))).toBe(false) // front face decides
  })

  it('the commander is cast from the command zone; X spells ask for X', () => {
    const items = menuFor(obj({ name: 'Boss', typeLine: 'Legendary Creature' }, 'command')).flatMap((g) => g.items)
    expect(items[0]).toMatchObject({ label: 'Lançar', action: { type: 'castSpell', objectId: 'o1' } })
    const fireball = obj({ name: 'Fireball', typeLine: 'Sorcery', rules: { types: ['sorcery'], supertypes: [], subtypes: [], cost: { generic: 0, colored: { R: 1 }, hybrid: [], twoBrid: [], phyrexian: [], x: 1 }, power: null, toughness: null, loyalty: null, keywords: [], manaAbilities: [], colorIdentity: ['R'] } })
    expect(needsX(fireball)).toBe(true)
  })

  it('describes what an exception asks for', () => {
    expect(describeIntent({ type: 'playLand', objectId: 'o1' }, { name: 'Forest' })).toBe('jogar o terreno Forest')
    expect(describeIntent({ type: 'castSpell', objectId: 'o1', x: 3 }, { name: 'Fireball' })).toBe('lançar Fireball com X = 3')
    expect(describeIntent({ type: 'moveObject', objectId: 'o1', to: 'battlefield' }, null)).toBe('pôr uma carta no campo de batalha')
  })
})
