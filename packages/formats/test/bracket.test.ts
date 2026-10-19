import { describe, expect, it } from 'vitest'
import { suggestBracket } from '../src'
import { card, deckOf, legend } from './fixtures'

const cmd = legend('Commander', ['G'])
const gc = (i: number) => card(`Game Changer ${i}`, { gameChanger: true })

describe('suggestBracket', () => {
  it('no Game Changers, no land destruction, no extra turns → 2', () => {
    const { deck, facts } = deckOf([cmd], [card('Llanowar Elves')])
    const s = suggestBracket(deck, facts)
    expect(s.bracket).toBe(2)
    expect(s.gameChangers).toEqual([])
  })

  it('1 to 3 Game Changers → 3; 4 or more → 4', () => {
    const two = deckOf([cmd], [gc(1), gc(2)])
    expect(suggestBracket(two.deck, two.facts)).toMatchObject({ bracket: 3, gameChangers: ['Game Changer 1', 'Game Changer 2'] })
    const five = deckOf([cmd], [gc(1), gc(2), gc(3), gc(4), gc(5)])
    expect(suggestBracket(five.deck, five.facts).bracket).toBe(4)
  })

  it('mass land denial pushes to 4', () => {
    const armageddon = card('Armageddon', { typeLine: 'Sorcery', oracleText: 'Destroy all lands.' })
    const { deck, facts } = deckOf([cmd], [armageddon])
    expect(suggestBracket(deck, facts)).toMatchObject({ bracket: 4, massLandDenial: ['Armageddon'] })
  })

  it('one extra-turn card is fine; several suggest chaining → 4', () => {
    const turn = (n: string) => card(n, { typeLine: 'Sorcery', oracleText: 'Take an extra turn after this one.' })
    const one = deckOf([cmd], [turn('Time Warp')])
    expect(suggestBracket(one.deck, one.facts).bracket).toBe(2)
    const two = deckOf([cmd], [turn('Time Warp'), turn('Temporal Manipulation')])
    expect(suggestBracket(two.deck, two.facts).bracket).toBe(4)
  })

  it('explains itself', () => {
    const { deck, facts } = deckOf([cmd], [gc(1)])
    expect(suggestBracket(deck, facts).reasons.join(' ')).toContain('Game Changer 1')
  })
})
