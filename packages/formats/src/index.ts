export * from './types'
export { COMMANDER_VERSIONS, commanderVersion, latestCommanderVersion, type FormatVersion } from './format'
export { OFFICIAL_PRESET_ID, officialPreset, resolvePreset } from './preset'
export { validateDeck, blocks } from './validate'
export { suggestBracket, BRACKET_RULES, type BracketSuggestion } from './bracket'
export { encodePreset, decodePreset, MAX_PRESET_TEXT, type DecodeResult } from './presetCodec'
export { isEligibleAlone, canPair } from './rules/commander'
export { copiesAllowed, commanderIdentity } from './rules/basic'
export { isBanned } from './rules/banned'
export { normalizeName } from './text'
export { factsAsOf, type LegalitySnapshot } from './asOf'
export {
  DECK_LIMITS, DECK_ZONES, hasV2Content, isLegacyDeck, MAX_DECK_DOC_BYTES, MAX_DECK_ENTRIES, MAX_DECK_NAME, sanitizeDeck,
  type ChangeLine, type Deck, type DeckCard, type DeckChange, type DeckZone,
} from './deckDocument'
export {
  applyBackward, applyForward, diff as deckDiff, MAX_HISTORY_BYTES, MERGE_WINDOW_MS, record as recordChange, restore as restoreVersion,
  versionAt, withChange, type Delta,
} from './deckHistory'
