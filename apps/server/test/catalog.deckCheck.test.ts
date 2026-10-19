import { officialPreset, type Preset } from '@gathering-hall/formats'
import { afterEach, describe, expect, it } from 'vitest'
import { makeDeckChecker } from '../src/catalog/deckCheck'
import { diffCatalog } from '../src/catalog/diff'
import { normalizeCard } from '../src/catalog/normalize'
import { SqliteCatalogStore } from '../src/catalog/store'
import { Room } from '../src/room/room'
import { bulk, krenko, manaCrypt } from './catalog.fixtures'
import { deck, msg, testDeps, to } from './helpers'

const wastes = bulk(7, 'Wastes', { type_line: 'Basic Land', oracle_text: '{T}: Add {C}.' })
const goodDeck = {
  commanders: [{ name: 'Krenko, Mob Boss', typeLine: 'Legendary Creature — Goblin Warrior' }],
  cards: Array(99).fill({ name: 'Wastes', typeLine: 'Basic Land' }),
}
const withCrypt = { ...goodDeck, cards: [...goodDeck.cards.slice(1), { name: 'Mana Crypt', typeLine: 'Artifact' }] }

let store: SqliteCatalogStore
afterEach(() => {
  store?.close()
  store = undefined as unknown as SqliteCatalogStore
})

function catalog() {
  store = new SqliteCatalogStore(':memory:')
  const records = [krenko, manaCrypt, wastes].map((c) => normalizeCard(c)!)
  store.apply(diffCatalog(store.currentState(), records), records, '2026-10-01')
  store.seedHistory([{ name: 'Mana Crypt', kind: 'banned', from: '2024-09-23', to: '2026-10-01', source: 'https://example.org' }])
  return makeDeckChecker(store)
}

describe('server-side deck check', () => {
  it('returns null without catalog data', () => {
    store = new SqliteCatalogStore(':memory:')
    expect(makeDeckChecker(store)(goodDeck, officialPreset())).toBeNull()
  })

  it('passes a legal deck, blocks banned cards and only warns on unknown ones', () => {
    const check = catalog()
    expect(check(goodDeck, officialPreset())).toEqual([])
    expect(check(withCrypt, officialPreset())).toContainEqual(expect.objectContaining({ rule: 'banned', level: 'block' }))
    const unknown = check({ ...goodDeck, cards: [...goodDeck.cards.slice(1), { name: 'Carta Inventada', typeLine: 'Artifact' }] }, officialPreset())
    expect(unknown).toContainEqual(expect.objectContaining({ rule: 'unknownCard', level: 'warn' }))
    expect(unknown?.some((v) => v.level === 'block')).toBe(false)
  })

  it('uses the banlist of the preset date', () => {
    const check = catalog()
    const old: Preset = { ...officialPreset(), id: 'old', name: 'Antes', deckRules: { banlist: { asOf: '2024-01-01' } } }
    expect(check(withCrypt, old)?.filter((v) => v.rule === 'banned')).toEqual([])
    const after: Preset = { ...old, deckRules: { banlist: { asOf: '2025-01-01' } } }
    expect(check(withCrypt, after)).toContainEqual(expect.objectContaining({ rule: 'banned' }))
  })
})

describe('Room with deck check', () => {
  const blocked = () => [{ rule: 'banned' as const, level: 'block' as const, message: 'Mana Crypt está banida.', cards: ['Mana Crypt'] }]

  it('refuses a seat when the deck breaks a blocking rule', () => {
    const { room, hostToken } = Room.create('r', { ...testDeps(), checkDeck: blocked })
    room.receive('a', msg({ t: 'hello', room: 'r', token: hostToken }))
    const out = room.receive('a', msg({ t: 'sit', seat: 0, name: 'Host', deck }))
    expect(to(out, 'a', 'error')[0]).toMatchObject({ code: 'deckInvalid' })
    expect(to(out, 'a', 'error')[0]).toMatchObject({ message: expect.stringContaining('Mana Crypt') })
  })

  it('stricter rules free the seats whose decks no longer pass', () => {
    let strict = false
    const { room, hostToken } = Room.create('r', { ...testDeps(), checkDeck: () => (strict ? blocked() : []) })
    room.receive('a', msg({ t: 'hello', room: 'r', token: hostToken }))
    room.receive('a', msg({ t: 'sit', seat: 0, name: 'Host', deck }))
    strict = true
    const out = room.receive('a', msg({ t: 'configure', preset: { ...officialPreset(), id: 'x', name: 'Rígida' } }))
    const lobby = to(out, 'a', 'lobby').at(-1)
    expect(lobby && 'seats' in lobby && lobby.seats[0]?.taken).toBe(false)
  })
})
