import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveCardRules, type OracleFacts } from '../src'
import { deriveCardRulesWith } from '../src/deriveRules'
import type { LinePattern } from '../src/oracle/patterns'

const FIXTURE: OracleFacts[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'oracle.json'), 'utf8'))
const facts = (name: string) => FIXTURE.find((f) => f.name === name)!
const card = (over: Partial<OracleFacts>): OracleFacts => ({ name: 'Test Card', typeLine: 'Instant', manaCost: '{1}', oracleText: '', keywords: [], colorIdentity: [], ...over })

describe('coverage (épico 11, T11.2)', () => {
  it('what the engine already did before épico 11 counts as understood', () => {
    for (const name of ['Sol Ring', 'Llanowar Elves', 'Command Tower', 'Dark Ritual', 'Forest', 'Caves of Koilos', 'Dimir Signet']) {
      expect(deriveCardRules(facts(name)).coverage, name).toBe('automated')
    }
    expect(deriveCardRules(card({ typeLine: 'Creature — Bear', oracleText: '' })).coverage).toBe('automated') // vanilla
    expect(deriveCardRules(card({ typeLine: 'Creature — Bird', oracleText: 'Flying, vigilance' })).coverage).toBe('automated')
  })

  it('anything else stays manual, listed as the players read it', () => {
    // Evolving Wilds became automated with the searches (T11.12); "on top of your library" is still not read.
    const odd = card({ name: 'Odd Wilds', typeLine: 'Land', oracleText: '{T}, Sacrifice Odd Wilds: Search your library for a basic land card, reveal it, then shuffle and put that card on top. (Reminder.)' })
    const wilds = deriveCardRules(odd)
    expect(wilds.coverage).toBe('manual')
    expect(wilds.manualText).toEqual([odd.oracleText.replace(/\s*\([^)]*\)/g, '').trim()])
    const ward = deriveCardRules(card({ typeLine: 'Creature — Elf', oracleText: 'Flying\nWard {2}', keywords: ['Flying', 'Ward'] }))
    expect(ward.coverage).toBe('partial') // Flying is ours; Ward is not automated yet
    expect(ward.manualText).toEqual(['Ward {2}'])
  })

  it('reminder text never counts, and the card name shows in the manual list', () => {
    const r = deriveCardRules(card({ name: 'Odd Golem', typeLine: 'Artifact Creature — Golem', oracleText: 'Odd Golem does something weird. (This is a reminder.)' }))
    expect(r.manualText).toEqual(['Odd Golem does something weird.'])
  })

  it('fitness: a sentence the reader does not know never leaves a card automated', () => {
    for (const f of FIXTURE) {
      const odd = 'Gibberish sentence the reader cannot know.'
      const r = deriveCardRules({ ...f, oracleText: f.oracleText ? `${f.oracleText}\n${odd}` : odd })
      expect(r.coverage, f.name).not.toBe('automated')
      expect(r.manualText, f.name).toContain(odd)
    }
  })

  it('patterns add their pieces; a card is automated only when every line matched', () => {
    const draw: LinePattern = {
      id: 'test-draw',
      match: (line) => (line === 'Draw a card.' ? { spell: { text: line, effects: [{ kind: 'draw', who: 'you', amount: { kind: 'fixed', n: 1 } }] } } : null),
    }
    const full = deriveCardRulesWith(card({ oracleText: 'Draw a card.' }), [draw])
    expect(full).toMatchObject({ coverage: 'automated', spell: { effects: [{ kind: 'draw' }] } })
    expect(full.manualText).toBeUndefined()
    const half = deriveCardRulesWith(card({ oracleText: 'Draw a card.\nScry 2.' }), [draw])
    expect(half).toMatchObject({ coverage: 'partial', manualText: ['Scry 2.'] })
    expect(deriveCardRulesWith(card({ oracleText: 'Draw a card.' }), []).coverage).toBe('manual')
  })
})
