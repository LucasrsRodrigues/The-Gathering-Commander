// Per-card exceptions (épico 11, ADR-11.4): what the Oracle reader cannot read, written by hand from the card's
// Oracle text. Keyed by Scryfall oracle id; the name is only a label for people. An entry replaces the reader's
// spell / etb / activated / mana for that card and sets its coverage.
//
// Shape of an entry (see the effect model in @gathering-hall/engine types.ts):
//   '<oracle id>': { name: 'Card Name', rules: { spell: { text, targets?, effects: [...] }, coverage: 'automated' } },
//
// Never copy card scripts from other projects (Forge, XMage): write them from the Oracle text.

import type { CardRules } from '@gathering-hall/engine'

export type Override = { name: string; rules: Partial<Pick<CardRules, 'spell' | 'etb' | 'activated' | 'manaAbilities' | 'coverage' | 'manualText'>> }

export const OVERRIDES: Record<string, Override> = {}
