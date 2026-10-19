// Commander eligibility (CR 903.3) and two-commander pairings (Partner, Partner with, Partner—group,
// Friends forever, Choose a Background, Doctor's companion). Everything is read from type line and Oracle text.

import { frontType, normalizeName } from '../text'
import type { CardFacts } from '../types'
import { factsOf, type Finding, type Rule } from './rule'

// Legendary permanent types that may lead a deck. Vehicles and Spacecraft were added in 2025;
// keep this in sync with CR 903.3 when it changes.
const ELIGIBLE_LEGENDARY_TYPES = ['creature', 'vehicle', 'spacecraft']

export function isEligibleAlone(card: CardFacts): boolean {
  const type = frontType(card.typeLine)
  if (type.includes('legendary') && ELIGIBLE_LEGENDARY_TYPES.some((t) => type.includes(t))) return true
  return /can be your commander/i.test(card.oracleText)
}

interface PairAbilities {
  plain: boolean
  withName?: string
  group?: string
  friendsForever: boolean
  choosesBackground: boolean
  isBackground: boolean
  doctorsCompanion: boolean
  isDoctor: boolean
}

export function pairAbilities(card: CardFacts): PairAbilities {
  const lines = card.oracleText.split('\n').map((l) => l.trim())
  const find = (re: RegExp) => lines.map((l) => re.exec(l)).find(Boolean) ?? null
  const withName = find(/^Partner with ([^(]+?)\s*(?:\(|$)/)
  const group = find(/^Partner\s*[—-]\s*([^(]+?)\s*(?:\(|$)/)
  const subtypes = (card.typeLine.split('—')[1] ?? '').toLowerCase()
  return {
    plain: !!find(/^Partner\s*(?:\(|$)/),
    ...(withName ? { withName: withName[1]! } : {}),
    ...(group ? { group: group[1]!.toLowerCase() } : {}),
    friendsForever: !!find(/^Friends forever\b/i),
    choosesBackground: !!find(/^Choose a Background\b/i),
    isBackground: /\bbackground\b/.test(subtypes),
    doctorsCompanion: !!find(/^Doctor's companion\b/i),
    isDoctor: /\bdoctor\b/.test(subtypes),
  }
}

export function canPair(a: CardFacts, b: CardFacts): boolean {
  const pa = pairAbilities(a)
  const pb = pairAbilities(b)
  const names = (x: string) => normalizeName(x)
  if (pa.plain && pb.plain) return true
  if (pa.withName && pb.withName && names(pa.withName) === names(b.name) && names(pb.withName) === names(a.name)) return true
  if (pa.group && pa.group === pb.group) return true
  if (pa.friendsForever && pb.friendsForever) return true
  if ((pa.choosesBackground && pb.isBackground) || (pb.choosesBackground && pa.isBackground)) return true
  if ((pa.doctorsCompanion && pb.isDoctor) || (pb.doctorsCompanion && pa.isDoctor)) return true
  return false
}

export const commanderEligibilityRule: Rule = (ctx) => {
  const commanders = factsOf(ctx, ctx.deck.commanders).map((e) => e.facts)
  if (!ctx.deck.commanders.length) {
    return [{ rule: 'commanderEligibility', message: 'Escolha um comandante.', cards: [] }]
  }
  // A Background can only lead alongside a "Choose a Background" commander (checked by the pairing rule).
  const pairedBackground = (c: CardFacts) =>
    pairAbilities(c).isBackground && commanders.some((o) => o !== c && pairAbilities(o).choosesBackground)
  const invalid = commanders.filter((c) => !isEligibleAlone(c) && !pairedBackground(c))
  if (!invalid.length) return []
  return [{
    rule: 'commanderEligibility',
    message: `Não pode ser comandante: ${invalid.map((c) => c.name).join(', ')}.`,
    cards: invalid.map((c) => c.name),
  }]
}

export const pairingRule: Rule = (ctx) => {
  const commanders = factsOf(ctx, ctx.deck.commanders).map((e) => e.facts)
  const total = ctx.deck.commanders.reduce((n, e) => n + e.count, 0)
  const findings: Finding[] = []
  if (total > 2) {
    findings.push({ rule: 'pairing', message: 'Um deck pode ter no máximo dois comandantes.', cards: commanders.map((c) => c.name) })
  } else if (commanders.length === 2 && !canPair(commanders[0]!, commanders[1]!)) {
    findings.push({
      rule: 'pairing',
      message: `${commanders[0]!.name} e ${commanders[1]!.name} não podem ser comandantes juntos (precisam de Partner ou habilidade parecida).`,
      cards: commanders.map((c) => c.name),
    })
  }
  return findings
}
