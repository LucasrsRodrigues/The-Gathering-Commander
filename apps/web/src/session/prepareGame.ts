// Turns seat choices (saved deck, sample or pasted list) + a preset into an engine game.
// Decks are validated against the preset first: any "block" violation stops the game from starting.

import { createGame, type DeckInput, type GameState } from '@gathering-hall/engine'
import { blocks, resolvePreset, validateDeck, type Preset, type Violation } from '@gathering-hall/formats'
import type { CatalogPort } from '../catalog/catalog'
import type { LegalityPort } from '../catalog/gatheringHall'
import { factsForDate } from '../catalog/legality'
import { loadDeckCards, toGameDeck } from '../decks/cardData'
import { importDecklist } from '../decks/importExport'
import { moveCard, toValidation, type Deck } from '../decks/model'
import { sampleDecklist } from '../decks/samples'

export type SeatDeck =
  | { kind: 'saved'; deck: Deck }
  | { kind: 'sample'; sampleId: string }
  | { kind: 'text'; text: string }

export interface SeatChoice {
  name: string
  deck: SeatDeck
}

export interface SeatReport {
  name: string
  violations: Violation[]
  notes: string[]
}

export type PrepareResult =
  | { ok: true; game: GameState; reports: SeatReport[] }
  | { ok: false; reports: SeatReport[] }

async function deckFor(choice: SeatDeck, catalog: CatalogPort, now: number): Promise<{ deck: Deck; notes: string[] }> {
  if (choice.kind === 'saved') return { deck: choice.deck, notes: [] }
  const text = choice.kind === 'sample' ? sampleDecklist(choice.sampleId) : choice.text
  const imported = await importDecklist(text, catalog, `seat-${now}`, now)
  const notes = [...imported.errors]
  if (imported.missing.length) notes.push(`Não encontradas: ${imported.missing.slice(0, 6).join(', ')}${imported.missing.length > 6 ? '…' : ''}`)
  let deck = imported.deck
  const candidate = imported.commanderCandidates[0]
  if (!deck.commanders.length && candidate?.facts) {
    // Pasted lists without a commander section: the setup has no room to ask, so take the first eligible card.
    deck = moveCard(deck, candidate.facts.oracleId, 'cards', now)
    notes.push(`Sem comandante marcado: usando ${candidate.ref.name}. Monte o deck no editor para escolher outro.`)
  }
  return { deck, notes }
}

// `enforce: false` (goldfish from the editor) still reports violations but never blocks: testing a
// half-built deck is the point of goldfishing.
export interface PreparedSeat {
  input: DeckInput
  violations: Violation[]
  notes: string[]
}

// One seat's deck: resolved in the catalog, validated against the preset, converted to engine input.
export async function prepareSeatDeck(
  choice: SeatDeck, preset: Preset, catalog: CatalogPort, now: number, legality?: LegalityPort,
): Promise<PreparedSeat> {
  const { deckRules } = resolvePreset(preset)
  const { deck, notes } = await deckFor(choice, catalog, now)
  const data = await loadDeckCards(deck, catalog)
  const dated = await factsForDate(data.facts, deckRules.banlist.asOf, legality)
  if (dated.note) notes.push(dated.note)
  return { input: toGameDeck(deck, data), violations: validateDeck(toValidation(deck), dated.facts, deckRules), notes }
}

export async function prepareGame(
  seats: SeatChoice[], preset: Preset, catalog: CatalogPort, seed: number, now: number, enforce = true, legality?: LegalityPort,
): Promise<PrepareResult> {
  const { ruleset } = resolvePreset(preset)
  const reports: SeatReport[] = []
  const inputs: DeckInput[] = []
  for (const seat of seats) {
    const prepared = await prepareSeatDeck(seat.deck, preset, catalog, now, legality)
    reports.push({ name: seat.name, violations: prepared.violations, notes: prepared.notes })
    inputs.push(prepared.input)
  }
  if (enforce && reports.some((r) => blocks(r.violations))) return { ok: false, reports }
  const game = createGame({
    seed,
    ruleset,
    players: seats.map((s, i) => ({ id: `p${i + 1}`, name: s.name.trim() || `Jogador ${i + 1}`, deck: inputs[i]! })),
  })
  return { ok: true, game, reports }
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!
}
