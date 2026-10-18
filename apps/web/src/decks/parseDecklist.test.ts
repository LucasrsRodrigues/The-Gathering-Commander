import { describe, expect, it } from 'vitest'
import { MAX_CARDS, MAX_CHARS, MAX_LINES, parseDecklist } from './parseDecklist'

describe('parseDecklist', () => {
  it('reads plain "N Name" lines and a Commander section', () => {
    const deck = parseDecklist(['Commander', '1 Krenko, Mob Boss', '', 'Deck', '1 Sol Ring', '30 Mountain', 'Goblin Matron'].join('\n'))
    expect(deck.commanders).toEqual([{ count: 1, name: 'Krenko, Mob Boss' }])
    expect(deck.cards).toEqual([
      { count: 1, name: 'Sol Ring' },
      { count: 30, name: 'Mountain' },
      { count: 1, name: 'Goblin Matron' },
    ])
    expect(deck.errors).toEqual([])
  })

  it('strips Moxfield/Archidekt decorations and honours *CMDR*', () => {
    const deck = parseDecklist([
      "1 Atraxa, Praetors' Voice (2X2) 190 *F* *CMDR*",
      '1x Arcane Signet (CMM) 378',
      '1 Command Tower [Land]',
      '1 Lightning Greaves ^Have,#37d67a^',
    ].join('\n'))
    expect(deck.commanders).toEqual([{ count: 1, name: "Atraxa, Praetors' Voice" }])
    expect(deck.cards.map((c) => c.name)).toEqual(['Arcane Signet', 'Command Tower', 'Lightning Greaves'])
  })

  it('ignores sideboard/maybeboard sections and comments', () => {
    const deck = parseDecklist(['1 Sol Ring', '// a comment', 'Sideboard', '1 Mana Crypt', 'Deck', '1 Mind Stone'].join('\n'))
    expect(deck.cards.map((c) => c.name)).toEqual(['Sol Ring', 'Mind Stone'])
  })

  it('bounds untrusted input', () => {
    expect(parseDecklist(Array(MAX_LINES + 1).fill('1 Island').join('\n')).errors).toHaveLength(1)
    expect(parseDecklist(`1 ${'x'.repeat(300)}`).errors).toHaveLength(1)
    expect(parseDecklist('500 Island').errors).toHaveLength(1)
  })

  it('caps the whole input and the total number of cards', () => {
    expect(parseDecklist('x'.repeat(MAX_CHARS + 1)).errors).toEqual([`A lista tem mais de ${MAX_CHARS} caracteres.`])
    const deck = parseDecklist(['99 Island', '99 Forest', '99 Swamp', '1 Sol Ring', 'Commander', '1 Krenko, Mob Boss'].join('\n'))
    expect(deck.cards.reduce((n, c) => n + c.count, 0)).toBeLessThanOrEqual(MAX_CARDS)
    expect(deck.commanders).toEqual([])
    expect(deck.errors).toHaveLength(1)
  })

  it('rejects control characters and bidi overrides', () => {
    const deck = parseDecklist(['1 Sol\u0000 Ring', '1 Evil‮gnir', '1\tMind Stone'].join('\n'))
    expect(deck.cards.map((c) => c.name)).toEqual(['Mind Stone'])
    expect(deck.errors).toHaveLength(2)
  })

  it('refuses non-string input', () => {
    expect(parseDecklist(null as unknown as string).errors).toHaveLength(1)
  })

  it('keeps markup as inert text', () => {
    const deck = parseDecklist('1 <img src=x onerror=alert(1)>')
    expect(deck.cards[0]?.name).toBe('<img src=x onerror=alert(1)>')
  })
})
