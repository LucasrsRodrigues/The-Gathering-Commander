import { createGame, deriveCardRules, reduce, viewFor, type Action, type CardRef, type GameState } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { formatMana, manaItems, paymentFor } from './mana'

const ref = (name: string, typeLine: string, manaCost: string, oracleText: string, colorIdentity: string[] = []): CardRef =>
  ({ name, typeLine, rules: deriveCardRules({ name, typeLine, manaCost, oracleText, keywords: [], colorIdentity }) })
const forest = ref('Forest', 'Basic Land — Forest', '', '({T}: Add {G}.)', ['G'])
const caves = ref('Caves of Koilos', 'Land', '', '{T}: Add {C}.\n{T}: Add {W} or {B}. This land deals 1 damage to you.', ['W', 'B'])
const orchard = ref('Exotic Orchard', 'Land', '', '{T}: Add one mana of any color that a land an opponent controls could produce.')
const bear = ref('Grizzly Bears', 'Creature — Bear', '{1}{G}', '', ['G'])
const boss = ref('Boss', 'Legendary Creature — Elf', '{G}', '', ['G'])

function must(s: GameState, a: Action) {
  const r = reduce(s, a)
  if (!r.ok) throw new Error(r.error.message)
  return r.state
}

function game(): GameState {
  let s = createGame({
    seed: 1, startingPlayer: 'p1', ruleset: { timingRules: 'off' },
    players: [{ id: 'p1', name: 'Ana', deck: { commanders: [boss], cards: [forest, forest, caves, orchard, bear, ...Array(30).fill(forest)] } }],
  })
  s = must(s, { type: 'keepHand', player: 'p1' })
  for (const name of ['Forest', 'Caves of Koilos', 'Exotic Orchard']) {
    const id = Object.values(s.objects).find((o) => o.card.name === name && o.zone !== 'battlefield')!.id
    s = must(s, { type: 'moveObject', player: 'p1', objectId: id, to: 'battlefield' })
  }
  const second = Object.values(s.objects).find((o) => o.card.name === 'Forest' && o.zone !== 'battlefield')!.id
  s = must(s, { type: 'moveObject', player: 'p1', objectId: second, to: 'battlefield' })
  const bearId = Object.values(s.objects).find((o) => o.card.name === 'Grizzly Bears')!.id
  return s.objects[bearId]!.zone === 'hand' ? s : must(s, { type: 'moveObject', player: 'p1', objectId: bearId, to: 'hand' })
}
const byName = (s: GameState, name: string) => Object.values(s.objects).find((o) => o.card.name === name)!.id

describe('mana on the table', () => {
  it('writes mana like the cards do', () => {
    expect(formatMana({ G: 2, C: 1 })).toBe('{G}{G}{C}')
  })

  it('offers each way a source makes mana, with its cost', () => {
    const s = game()
    const view = viewFor(s, 'p1')
    expect(manaItems(view, 'p1', view.objects[byName(s, 'Forest')]!).map((i) => i.label)).toEqual(['Gerar {G}'])
    expect(manaItems(view, 'p1', view.objects[byName(s, 'Caves of Koilos')]!).map((i) => i.label))
      .toEqual(['Gerar {C}', 'Gerar {W} (1 de dano em você)', 'Gerar {B} (1 de dano em você)'])
    expect(manaItems(view, 'p1', view.objects[byName(s, 'Exotic Orchard')]!)[0]).toMatchObject({ label: 'Declarar {W}', action: { type: 'declareMana' } })
    expect(manaItems(view, 'p2', view.objects[byName(s, 'Forest')]!)).toEqual([]) // not yours
  })

  it('casting asks to confirm the sources it will tap', () => {
    const s = game()
    const pending = paymentFor(viewFor(s, 'p1'), 'p1', { type: 'castSpell', objectId: byName(s, 'Grizzly Bears') })
    expect(pending?.plan).toHaveLength(2)
    expect(paymentFor(viewFor(s, 'p1'), 'p1', { type: 'playLand', objectId: byName(s, 'Forest') })).toBeNull()
  })
})
