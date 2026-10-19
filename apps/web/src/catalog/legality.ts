// Banlist "as of a date" (épico 01, T1.8): swaps today's ban / Game Changer facts for the ones the
// Gathering Hall server recorded for that day. Without the server data it keeps today's list and says so.

import { factsAsOf, type CardFacts } from '@gathering-hall/formats'
import type { LegalityPort } from './gatheringHall'

export interface DatedFacts {
  facts: ReadonlyMap<string, CardFacts>
  note: string | null
}

export async function factsForDate(facts: ReadonlyMap<string, CardFacts>, asOf: string | undefined, legality: LegalityPort | undefined): Promise<DatedFacts> {
  if (!asOf) return { facts, note: null }
  const snapshot = await legality?.commanderAt(asOf).catch(() => null)
  if (!snapshot) return { facts, note: `A banlist de ${asOf} não está disponível agora; usando a atual.` }
  return {
    facts: factsAsOf(facts, { banned: new Set(snapshot.banned.map((c) => c.oracleId)), gameChangers: new Set(snapshot.gameChangers.map((c) => c.oracleId)) }),
    note: null,
  }
}
