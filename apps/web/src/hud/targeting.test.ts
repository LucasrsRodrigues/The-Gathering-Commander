import type { ObjectView, PlayerView, TargetSpec } from '@gathering-hall/engine'
import { beforeEach, describe, expect, it } from 'vitest'
import { castTargeting, confirmAction, legalOptions, limits, manualAction, targetingStore, toggleTarget, triggerTargeting } from './targeting'

const BOLT: TargetSpec[] = [{ kind: 'any' }]
const rules = (types: string[], extra: object = {}) => ({
  types, supertypes: [], subtypes: [], cost: null, power: types.includes('creature') ? 2 : null, toughness: types.includes('creature') ? 2 : null,
  loyalty: null, keywords: [], manaAbilities: [], colorIdentity: [], ...extra,
}) as NonNullable<ObjectView['card']>['rules']
const obj = (id: string, zone: ObjectView['zone'], name: string, r: NonNullable<ObjectView['card']>['rules'], controller = 'p1'): ObjectView => ({
  id, owner: controller, controller, zone, card: { name, typeLine: '', rules: r }, tapped: false, faceDown: false, counters: {}, isToken: false,
  isCommander: false, commanderTax: 0, summoningSick: false, power: null, toughness: null, damage: 0,
})
function view(pending: PlayerView['pending'] = null): PlayerView {
  const objects = {
    bolt: obj('bolt', 'hand', 'Lightning Bolt', rules(['instant'], { spell: { text: 'Lightning Bolt deals 3 damage to any target.', targets: BOLT, effects: [] } })),
    bear: obj('bear', 'battlefield', 'Bear', rules(['creature']), 'p2'),
    rock: obj('rock', 'battlefield', 'Rock', rules(['artifact'])),
  }
  return {
    viewer: 'p1', status: 'playing', seats: ['p1', 'p2'], battlefield: ['bear', 'rock'], stack: [], objects, pending,
    players: { p1: { name: 'Ana', lost: false }, p2: { name: 'Bia', lost: false } },
  } as unknown as PlayerView
}

beforeEach(() => targetingStore.set(null))

describe('target mode (épico 11, T11.9)', () => {
  it('casting a spell with targets starts the mode; legal targets come from the engine', () => {
    const t = castTargeting(view(), { type: 'castSpell', objectId: 'bolt' })!
    expect(t).toMatchObject({ kind: 'cast', sourceId: 'bolt', title: 'Lightning Bolt', chosen: [] })
    expect(legalOptions(view(), 'p1', t)).toEqual([{ object: 'bear' }, { player: 'p1' }, { player: 'p2' }]) // not the artifact
    expect(castTargeting(view(), { type: 'castSpell', objectId: 'bolt', targets: [{ player: 'p2' }] })).toBeNull()
    expect(castTargeting(view(), { type: 'castSpell', objectId: 'rock' })).toBeNull()
  })

  it('a click picks, a second one on another single target replaces it; confirm sends the targets', () => {
    targetingStore.set(castTargeting(view(), { type: 'castSpell', objectId: 'bolt' }))
    toggleTarget({ object: 'bear' })
    toggleTarget({ player: 'p2' })
    const t = targetingStore.get()!
    expect(t.chosen).toEqual([{ player: 'p2' }])
    expect(confirmAction(t)).toEqual({ type: 'castSpell', objectId: 'bolt', targets: [{ player: 'p2' }] })
    expect(manualAction(t)).toEqual({ type: 'castSpell', objectId: 'bolt' })
    toggleTarget({ player: 'p2' })
    expect(targetingStore.get()!.chosen).toEqual([])
  })

  it('up to N: picks stop at the maximum', () => {
    const specs: TargetSpec[] = [{ kind: 'object', filter: {}, count: 2, upTo: true }]
    expect(limits(specs)).toEqual({ min: 0, max: 2 })
    targetingStore.set({ id: 'x', kind: 'cast', sourceId: 'bolt', specs, title: '', text: '', chosen: [] })
    for (const id of ['bear', 'rock', 'bolt']) toggleTarget({ object: id })
    expect(targetingStore.get()!.chosen).toEqual([{ object: 'bear' }, { object: 'rock' }])
  })

  it('a trigger waiting on me becomes the same mode, answered with chooseTargets', () => {
    const pending: PlayerView['pending'] = { kind: 'chooseTargets', player: 'p1', trigger: { sourceId: 'bear', controller: 'p1', index: 0 }, specs: BOLT, text: 'When…', priorityTo: 'p1', rest: [] }
    expect(triggerTargeting(view(pending), 'p2')).toBeNull()
    const t = triggerTargeting(view(pending), 'p1')!
    expect(t).toMatchObject({ kind: 'trigger', title: 'Bear' })
    expect(confirmAction({ ...t, chosen: [{ player: 'p2' }] })).toEqual({ type: 'chooseTargets', targets: [{ player: 'p2' }] })
    expect(manualAction(t)).toEqual({ type: 'chooseTargets', targets: [], manual: true })
  })
})
