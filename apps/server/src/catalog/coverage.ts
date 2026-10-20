// How much of the most played cards the engine automates (épico 11, req. 16), and which manual sentences are the
// most common: the list that chooses the next wave of patterns. Pure; the command in src/coverage.ts feeds it.

import { rulesFor } from '@gathering-hall/cards'
import type { Coverage } from '@gathering-hall/engine'
import { oracleFactsOf } from './cardRules'
import type { ClientCard } from './normalize'

export interface CoverageRow {
  top: number
  cards: number
  automated: number
  partial: number
  manual: number
}

export interface CoverageReport {
  rows: CoverageRow[]
  phrases: { phrase: string; cards: number; example: string }[] // over the largest top
}

// "Krenko deals 3 damage to target creature." → "~ deals N damage to target creature."
export function normalizePhrase(line: string, cardName: string): string {
  let out = line
  for (const n of new Set([cardName, cardName.split(' // ')[0]!, cardName.split(',')[0]!])) if (n.length > 2) out = out.split(n).join('~')
  return out
    .replace(/\{\d+\}/g, '{N}')
    .replace(/\b\d+\b/g, 'N')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, 'N')
    .replace(/\s+/g, ' ')
    .trim()
}

export function measureCoverage(cards: readonly { rank: number; card: ClientCard }[], tops: readonly number[] = [1000, 5000], phrasesShown = 30): CoverageReport {
  const sorted = [...cards].sort((a, b) => a.rank - b.rank)
  const coverage: Coverage[] = []
  const phrases = new Map<string, { cards: Set<string>; example: string }>()
  const largest = Math.max(...tops)
  sorted.slice(0, largest).forEach(({ card }) => {
    const rules = rulesFor(oracleFactsOf(card), card.oracle_id)
    coverage.push(rules.coverage ?? 'manual')
    for (const line of rules.manualText ?? []) {
      const phrase = normalizePhrase(line, card.name)
      const entry = phrases.get(phrase) ?? { cards: new Set<string>(), example: card.name }
      entry.cards.add(card.oracle_id)
      phrases.set(phrase, entry)
    }
  })
  const rows = tops.map((top) => {
    const slice = coverage.slice(0, top)
    const count = (c: Coverage) => slice.filter((x) => x === c).length
    return { top, cards: slice.length, automated: count('automated'), partial: count('partial'), manual: count('manual') }
  })
  return {
    rows,
    phrases: [...phrases.entries()]
      .map(([phrase, e]) => ({ phrase, cards: e.cards.size, example: e.example }))
      .sort((a, b) => b.cards - a.cards || a.phrase.localeCompare(b.phrase))
      .slice(0, phrasesShown),
  }
}

const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : '—')

export function formatReport(report: CoverageReport): string {
  const lines = ['Cobertura das cartas mais jogadas no Commander (edhrec_rank):', '']
  for (const r of report.rows) {
    lines.push(`  top ${r.top} (${r.cards} cartas): automáticas ${r.automated} (${pct(r.automated, r.cards)}) · ` +
      `parciais ${r.partial} (${pct(r.partial, r.cards)}) · manuais ${r.manual} (${pct(r.manual, r.cards)}) · ` +
      `automáticas ou parciais ${pct(r.automated + r.partial, r.cards)}`)
  }
  lines.push('', `Frases manuais mais comuns (top ${Math.max(...report.rows.map((r) => r.top))}):`)
  report.phrases.forEach((p, i) => lines.push(`  ${String(i + 1).padStart(2)}. [${p.cards}] ${p.phrase}   (ex.: ${p.example})`))
  return lines.join('\n')
}
