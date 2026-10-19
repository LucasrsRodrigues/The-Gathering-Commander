import type { Ruleset } from '@gathering-hall/engine'

export type Color = 'W' | 'U' | 'B' | 'R' | 'G'

// What deck validation needs to know about a card. Filled by the app's catalog (ACL), never by this package.
export interface CardFacts {
  oracleId: string
  name: string
  typeLine: string
  oracleText: string
  colorIdentity: Color[]
  keywords: string[]
  legalCommander: 'legal' | 'banned' | 'not_legal' | 'restricted'
  gameChanger: boolean
}

export interface DeckEntryRef {
  oracleId: string
  count: number
}

// The shape validation works on: references only, facts come separately.
export interface DeckForValidation {
  commanders: DeckEntryRef[]
  cards: DeckEntryRef[]
}

export type Enforcement = 'block' | 'warn' | 'off'

export type BanlistSource = 'official' | 'none' | 'custom'

export interface DeckRules {
  deckSize: number
  sizeLevel: Enforcement
  singleton: Enforcement
  colorIdentity: Enforcement
  commanderEligibility: Enforcement
  pairing: Enforcement
  banlist: {
    source: BanlistSource // custom = only extraBans; official = Scryfall legality + extraBans − unbans
    extraBans: string[]
    unbans: string[]
    level: Enforcement
    asOf?: string // ISO date: use the official banlist / Game Changers of that day (needs the versioned catalog)
  }
}

export type RuleId = 'size' | 'singleton' | 'colorIdentity' | 'commanderEligibility' | 'pairing' | 'banned' | 'unknownCard'

export interface Violation {
  rule: RuleId
  level: 'block' | 'warn'
  message: string
  cards: string[] // card names involved
}

export interface Preset {
  id: string
  name: string
  base: { formatId: 'commander'; version: string }
  ruleset?: Partial<Omit<Ruleset, 'id' | 'version'>>
  deckRules?: Partial<Omit<DeckRules, 'banlist'>> & { banlist?: Partial<DeckRules['banlist']> }
}

export interface ResolvedPreset {
  ruleset: Ruleset
  deckRules: DeckRules
}
