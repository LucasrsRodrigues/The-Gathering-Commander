import { describe, expect, it } from 'vitest'
import type { OracleFacts } from '@gathering-hall/engine'
import { OVERRIDES, rulesFor, validateRules, type Override } from '../src'

const odd: OracleFacts = { name: 'Odd Sorcery', typeLine: 'Sorcery', manaCost: '{2}{U}', oracleText: 'Something only a person can read.', keywords: [], colorIdentity: ['U'] }

describe('card rules with exceptions (épico 11, T11.2)', () => {
  it('without an exception, the reader decides', () => {
    expect(rulesFor(odd, 'some-id')).toMatchObject({ coverage: 'manual', manualText: ['Something only a person can read.'] })
  })

  it('an exception replaces the reader for that card only, by oracle id', () => {
    const overrides: Record<string, Override> = {
      'odd-id': { name: 'Odd Sorcery', rules: { coverage: 'automated', spell: { text: 'Something…', effects: [{ kind: 'draw', who: 'you', amount: { kind: 'fixed', n: 2 } }] } } },
    }
    const r = rulesFor(odd, 'odd-id', overrides)
    expect(r).toMatchObject({ coverage: 'automated', spell: { effects: [{ kind: 'draw', amount: { n: 2 } }] }, types: ['sorcery'] })
    expect(r.manualText).toBeUndefined()
    expect(rulesFor(odd, 'other-id', overrides).coverage).toBe('manual')
  })

  it('every exception fits the effect model', () => {
    for (const [id, o] of Object.entries(OVERRIDES)) expect(validateRules(o.rules), `${o.name} (${id})`).toEqual([])
  })

  it('the validator catches typos in hand-written rules', () => {
    expect(validateRules({ spell: { text: 'x', effects: [{ kind: 'drwa' } as never] } })).toEqual(['spell.effects[0]: efeito desconhecido'])
    expect(validateRules({ spell: { text: 'x', effects: [{ kind: 'draw', who: 'you', amount: { kind: 'fixed', n: -1 } }] } })[0]).toMatch(/0–100/)
    expect(validateRules({ activated: [{ text: 'x', effects: [{ kind: 'draw', who: 'you', amount: { kind: 'fixed', n: 1 } }] } as never] })).toContain('activated[0]: sem custo')
    expect(validateRules({ spell: { text: '', effects: [] } })).toEqual(['spell: sem texto', 'spell: sem efeitos'])
  })
})
