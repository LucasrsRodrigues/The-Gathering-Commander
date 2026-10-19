import type { DeckInput } from '@gathering-hall/engine'
import { describe, expect, it } from 'vitest'
import { makeRulesFiller, oracleFactsOf } from '../src/catalog/cardRules'
import { diffCatalog } from '../src/catalog/diff'
import { normalizeCard } from '../src/catalog/normalize'
import { CatalogCache } from '../src/catalog/lookup'
import { CatalogStore } from '../src/catalog/store'
import { testDb } from './db.helpers'
import { Room } from '../src/room/room'
import { dfc, krenko, solRing } from './catalog.fixtures'
import { msg, testDeps } from './helpers'

async function filler() {
  const store = new CatalogStore(await testDb())
  const records = [solRing, krenko, dfc].map((c) => normalizeCard(c)!)
  await store.apply(diffCatalog(await store.currentState(), records), records, '2026-10-01')
  const cache = new CatalogCache(store)
  await cache.warm(['Sol Ring', 'Krenko, Mob Boss', 'Carta Inventada'])
  return makeRulesFiller(cache)
}

// What a modified client could try: Sol Ring "adding" ten mana.
const forged: DeckInput = {
  commanders: [{ name: 'Krenko, Mob Boss' }],
  cards: [
    { name: 'Sol Ring', rules: { types: ['artifact'], supertypes: [], subtypes: [], cost: null, power: null, toughness: null, loyalty: null, keywords: [], manaAbilities: [{ produces: { kind: 'fixed', mana: { C: 10 } } }], colorIdentity: [] } },
    { name: 'Carta Inventada' },
  ],
}

describe('card rules from the server catalog', () => {
  it('replaces whatever rules the client sent with the catalog ones', async () => {
    const deck = (await filler())(forged)
    expect(deck.cards[0]!.rules?.manaAbilities).toEqual([{ produces: { kind: 'fixed', mana: { C: 2 } } }])
    expect(deck.cards[0]!.rules?.cost).toMatchObject({ generic: 1 })
    expect(deck.commanders[0]!.rules).toMatchObject({ types: ['creature'], power: 3, toughness: 3, supertypes: ['legendary'] })
    expect(deck.cards[1]).toEqual({ name: 'Carta Inventada' })
  })

  it('reads multi-face cards from the front face', () => {
    const card = normalizeCard(dfc)!.card
    expect(oracleFactsOf(card)).toMatchObject({ typeLine: 'Legendary Creature — Elf', oracleText: 'Partner' })
  })

  it('rooms store the trusted deck, and drop client rules without a catalog', async () => {
    const withCatalog = Room.create('r', { ...testDeps(), cardRules: await filler() })
    withCatalog.room.receive('a', msg({ t: 'hello', room: 'r', token: withCatalog.hostToken }))
    withCatalog.room.receive('a', msg({ t: 'sit', seat: 0, name: 'Ana', deck: forged }))
    expect(withCatalog.room.snapshot().seats[0]?.deck.cards[0]?.rules?.manaAbilities[0]?.produces).toEqual({ kind: 'fixed', mana: { C: 2 } })

    const without = Room.create('r', testDeps())
    without.room.receive('a', msg({ t: 'hello', room: 'r', token: without.hostToken }))
    without.room.receive('a', msg({ t: 'sit', seat: 0, name: 'Ana', deck: forged }))
    expect(without.room.snapshot().seats[0]?.deck.cards.every((c) => c.rules === undefined)).toBe(true)
  })
})
