import type { CardFacts } from '@gathering-hall/formats'
import { describe, expect, it } from 'vitest'
import { factsForDate } from './legality'

const crypt: CardFacts = { oracleId: 'crypt', name: 'Mana Crypt', typeLine: 'Artifact', oracleText: '', colorIdentity: [], keywords: [], legalCommander: 'banned', gameChanger: false }
const facts = new Map([['crypt', crypt]])

describe('factsForDate', () => {
  it('keeps today facts without a date', async () => {
    expect(await factsForDate(facts, undefined, undefined)).toEqual({ facts, note: null })
  })

  it('uses the snapshot of the date', async () => {
    const legality = { commanderAt: async (date: string) => ({ date, banned: [], gameChangers: [] }) }
    const dated = await factsForDate(facts, '2024-01-01', legality)
    expect(dated.facts.get('crypt')?.legalCommander).toBe('legal')
    expect(dated.note).toBeNull()
  })

  it('falls back to today with a note when the server has no data', async () => {
    const dated = await factsForDate(facts, '2024-01-01', { commanderAt: async () => null })
    expect(dated.facts).toBe(facts)
    expect(dated.note).toMatch(/2024-01-01/)
  })
})
