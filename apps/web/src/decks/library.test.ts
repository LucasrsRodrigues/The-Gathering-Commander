import { describe, expect, it } from 'vitest'
import { foldersOf, inFolder, matchesQuery, setFolder, sortDecks } from './library'
import { addCard, newDeck, type Deck } from './model'

const deck = (id: string, name: string, at: number, folder?: string, commander?: string): Deck => {
  let d = newDeck(id, name, at)
  if (commander) d = addCard(d, { oracleId: `or-${commander}`, name: commander }, 'commanders', at)
  return folder ? setFolder(d, folder, at) : d
}
const decks = [
  deck('a', 'Goblins', 3, 'Casuais', 'Krenko, Mob Boss'),
  deck('b', 'Élfico', 1, 'casuais', 'Ezuri, Renegade Leader'),
  deck('c', 'cEDH', 2, 'Torneio', 'Tymna the Weaver'),
  deck('d', 'Sem pasta', 4),
]

describe('deck library', () => {
  it('lists folders once (case-insensitive) with their counts, plus empty ones from this browser', () => {
    expect(foldersOf(decks, ['Rascunhos', 'TORNEIO'])).toEqual([{ name: 'Casuais', count: 2 }, { name: 'Rascunhos', count: 0 }, { name: 'Torneio', count: 1 }])
  })

  it('filters by folder, no folder, or all', () => {
    expect(decks.filter((d) => inFolder(d, { kind: 'folder', name: 'CASUAIS' })).map((d) => d.id)).toEqual(['a', 'b'])
    expect(decks.filter((d) => inFolder(d, { kind: 'none' })).map((d) => d.id)).toEqual(['d'])
    expect(decks.filter((d) => inFolder(d, { kind: 'all' }))).toHaveLength(4)
  })

  it('searches by deck or commander name, ignoring accents and case', () => {
    expect(decks.filter((d) => matchesQuery(d, 'krenko')).map((d) => d.id)).toEqual(['a'])
    expect(decks.filter((d) => matchesQuery(d, 'elfico')).map((d) => d.id)).toEqual(['b'])
    expect(decks.filter((d) => matchesQuery(d, '  ')).length).toBe(4)
  })

  it('sorts by last edit, name or color (WUBRG, then multicolor, colorless, unknown)', () => {
    expect(sortDecks(decks, 'updated').map((d) => d.id)).toEqual(['d', 'a', 'c', 'b'])
    expect(sortDecks(decks, 'name').map((d) => d.id)).toEqual(['c', 'b', 'a', 'd'])
    const identity = { a: ['R'], b: ['G'], c: ['W', 'U', 'B', 'G'], d: undefined } as const
    expect(sortDecks(decks, 'color', (d) => identity[d.id as keyof typeof identity]).map((d) => d.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('a folder name is cleaned; no folder removes the field', () => {
    expect(setFolder(decks[0]!, '  Nova\u0007   pasta ', 9).folder).toBe('Nova pasta')
    expect(setFolder(decks[0]!, null, 9)).not.toHaveProperty('folder')
  })
})
