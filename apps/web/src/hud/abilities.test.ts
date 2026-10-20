import { deriveCardRules, type ObjectView, type PlayerView } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { abilityItems, costChoiceFor } from './abilities'
import { paymentFor } from './mana'
import { castTargeting } from './targeting'

const facts = (name: string, typeLine: string, oracleText: string, pt?: [string, string]) =>
  deriveCardRules({ name, typeLine, manaCost: '{1}', oracleText, keywords: [], colorIdentity: [], ...(pt ? { power: pt[0], toughness: pt[1] } : {}) })
const obj = (id: string, zone: ObjectView['zone'], name: string, rules: ReturnType<typeof deriveCardRules>, controller = 'p1'): ObjectView => ({
  id, owner: controller, controller, zone, card: { name, typeLine: '', rules }, tapped: false, faceDown: false, counters: {}, isToken: false,
  isCommander: false, commanderTax: 0, summoningSick: false, power: null, toughness: null, damage: 0,
  types: rules.types, subtypes: rules.subtypes, keywords: rules.keywords, colors: [],
})
const BOMBARDMENT = facts('Goblin Bombardment', 'Enchantment', 'Sacrifice a creature: Goblin Bombardment deals 1 damage to any target.')
const STONE = facts('Mind Stone', 'Artifact', '{T}: Add {C}.\n{1}, {T}, Sacrifice Mind Stone: Draw a card.')
const FOREST = deriveCardRules({ name: 'Forest', typeLine: 'Basic Land — Forest', manaCost: '', oracleText: '', keywords: [], colorIdentity: ['G'] })
const BEAR = facts('Bear', 'Creature — Bear', '', ['2', '2'])
function view(manaRules: 'off' | 'block' = 'block'): PlayerView {
  const objects = {
    bomb: obj('bomb', 'battlefield', 'Goblin Bombardment', BOMBARDMENT),
    stone: obj('stone', 'battlefield', 'Mind Stone', STONE),
    forest: obj('forest', 'battlefield', 'Forest', FOREST),
    bear: obj('bear', 'battlefield', 'Bear', BEAR),
    theirs: obj('theirs', 'battlefield', 'Bear', BEAR, 'p2'),
  }
  return {
    viewer: 'p1', status: 'playing', seats: ['p1', 'p2'], battlefield: Object.keys(objects), stack: [], objects, pending: null,
    ruleset: { manaRules }, players: { p1: { name: 'Ana', lost: false, hand: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } }, p2: { name: 'Bia', lost: false, hand: [] } },
  } as unknown as PlayerView
}

describe('activated abilities on the table (épico 11, T11.10)', () => {
  it('the card menu lists them for the controller, with the card name in the text', () => {
    const v = view()
    expect(abilityItems('p1', v.objects.stone!)).toEqual([{ label: 'Ativar: {1}, {T}, Sacrifice Mind Stone: Draw a card.', action: { type: 'activateAbility', objectId: 'stone', index: 0 } }])
    expect(abilityItems('p2', v.objects.stone!)).toEqual([])
  })

  it('asks in order: targets, then the creature to sacrifice (only mine), then the mana', () => {
    const v = view()
    const action = { type: 'activateAbility' as const, objectId: 'bomb', index: 0 }
    expect(castTargeting(v, action)).toMatchObject({ kind: 'cast', title: 'Goblin Bombardment', action })
    const choice = costChoiceFor(v, 'p1', { ...action, targets: [{ player: 'p2' }] })!
    expect(choice).toMatchObject({ kind: 'sacrifice', count: 1 })
    expect(choice.options.map((o) => o.id)).toEqual(['bear'])
    expect(costChoiceFor(v, 'p1', { ...action, targets: [{ player: 'p2' }], sacrifice: ['bear'] })).toBeNull()
    expect(paymentFor(v, 'p1', { type: 'activateAbility', objectId: 'stone', index: 0 })).toEqual({
      action: { type: 'activateAbility', objectId: 'stone', index: 0 }, plan: [{ objectId: 'forest', abilityIndex: 0 }], // never the Stone itself
    })
    expect(paymentFor(view('off'), 'p1', { type: 'activateAbility', objectId: 'stone', index: 0 })).toBeNull()
  })
})
