import type { CardRef, ObjectView, PlayerView } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { changesOf } from './changes'
import { keywordLabel } from './keywordHelp'

const rules = { types: ['creature'], supertypes: [], subtypes: ['Bear'], cost: null, power: 2, toughness: 2, loyalty: null, keywords: ['trample'], manaAbilities: [], colorIdentity: [] } as unknown as NonNullable<CardRef['rules']>
const BEAR: CardRef = { name: 'Bear', rules }
const obj = (extra: Partial<ObjectView> = {}): ObjectView => ({
  id: 'o1', owner: 'p1', controller: 'p1', zone: 'battlefield', card: BEAR, tapped: false, faceDown: false, counters: {}, isToken: false,
  isCommander: false, commanderTax: 0, summoningSick: false, power: 2, toughness: 2, damage: 0,
  types: ['creature'], subtypes: ['Bear'], keywords: ['trample'], colors: ['G'], ...extra,
})
const view = (objects: ObjectView[]) => ({ objects: Object.fromEntries(objects.map((o) => [o.id, o])) }) as unknown as PlayerView

describe('what the layers changed, for the preview (épico 12, T12.3)', () => {
  it('nothing for an unchanged object', () => {
    expect(changesOf(obj(), BEAR, view([obj()]))).toEqual([])
  })

  it('gained and lost keywords, in Portuguese', () => {
    const o = obj({ keywords: ['haste', 'vigilance'] })
    expect(changesOf(o, BEAR, view([o]))).toEqual(['Ganhou: Ímpeto e Vigilância', 'Perdeu: Atropelar'])
    expect(keywordLabel('firstStrike')).toBe('Iniciativa')
  })

  it('new types and subtypes, lost abilities, a copy', () => {
    const o = obj({ types: ['creature', 'artifact'], subtypes: ['Golem'], keywords: [], abilitiesLost: true, copyOf: 'o9' })
    const other = obj({ id: 'o9', card: { name: 'Golem' } })
    expect(changesOf(o, BEAR, view([o, other]))).toEqual([
      'Cópia de Golem', 'Agora também é artefato', 'Tipos agora: Golem', 'Perdeu as habilidades do texto',
    ])
  })

  it('what it equips and what is attached to it', () => {
    const boots = obj({ id: 'b', card: { name: 'Swiftfoot Boots', rules: { ...rules, types: ['artifact'], subtypes: ['Equipment'], keywords: [] } }, types: ['artifact'], subtypes: ['Equipment'], keywords: [], attachedTo: 'o1' })
    const bear = obj()
    expect(changesOf(boots, boots.card!, view([bear, boots]))).toEqual(['Equipando Bear'])
    expect(changesOf(bear, BEAR, view([bear, boots]))).toEqual(['Com Swiftfoot Boots'])
  })
})
