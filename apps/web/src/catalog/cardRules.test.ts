import { describe, expect, it } from 'vitest'
import { toCatalogCard } from './scryfall'

const id = '00000000-0000-4000-8000-000000000001'

describe('engine card rules from the catalog', () => {
  it('derives cost, P/T, keywords and mana abilities', () => {
    const bird = toCatalogCard({
      id, oracle_id: 'bird', name: 'Birds of Paradise', type_line: 'Creature — Bird', mana_cost: '{G}', power: '0', toughness: '1',
      oracle_text: 'Flying\n{T}: Add one mana of any color.', keywords: ['Flying'], color_identity: ['G'],
    })
    expect(bird?.ref.rules).toMatchObject({
      types: ['creature'], cost: { colored: { G: 1 } }, power: 0, toughness: 1, keywords: ['flying'],
      manaAbilities: [{ produces: { kind: 'anyColor', amount: 1 } }], colorIdentity: ['G'],
    })
  })

  it('reads double-faced cards from the front face', () => {
    const card = toCatalogCard({
      id, oracle_id: 'delver', name: 'Delver of Secrets // Insectile Aberration', type_line: 'Creature — Human Wizard // Creature — Human Insect',
      card_faces: [
        { name: 'Delver of Secrets', type_line: 'Creature — Human Wizard', mana_cost: '{U}', power: '1', toughness: '1', oracle_text: 'At the beginning of your upkeep, look.' },
        { name: 'Insectile Aberration', type_line: 'Creature — Human Insect', mana_cost: '', power: '3', toughness: '2', oracle_text: 'Flying' },
      ],
    })
    expect(card?.ref.rules).toMatchObject({ cost: { colored: { U: 1 } }, power: 1, toughness: 1, keywords: [] })
  })

  it('ignores oversized fields instead of trusting them', () => {
    const card = toCatalogCard({ id, oracle_id: 'x', name: 'X', type_line: 'Artifact', mana_cost: `{1}`.repeat(200) })
    expect(card?.ref.rules?.cost).toBeNull()
  })
})
