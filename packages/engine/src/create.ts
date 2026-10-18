import { continueMulligans } from './mulligan'
import { randomIndex, shuffle } from './rng'
import { makeRuleset } from './ruleset'
import { Tx } from './tx'
import type { CardRef, GameObject, GameState, PlayerId, PlayerZoneKind, Ruleset } from './types'
import { drawCards } from './zones'

export const ENGINE_VERSION = '0.1.0'
export const MAX_PLAYERS = 4

export interface DeckInput {
  commanders: CardRef[]
  cards: CardRef[]
}

export interface GameConfig {
  seed: number
  players: { id: PlayerId; name: string; deck: DeckInput }[]
  ruleset?: Partial<Ruleset>
  startingPlayer?: PlayerId
}

export function createGame(config: GameConfig): GameState {
  const { players } = config
  if (players.length < 1 || players.length > MAX_PLAYERS) {
    throw new Error(`uma partida precisa de 1 a ${MAX_PLAYERS} jogadores`)
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('ids de jogador repetidos')
  if (config.startingPlayer && !players.some((p) => p.id === config.startingPlayer)) {
    throw new Error('jogador inicial desconhecido')
  }

  const ruleset = makeRuleset(config.ruleset)
  let rng = config.seed | 0
  let nextId = 1
  let timestamp = 0
  const objects: Record<string, GameObject> = {}
  const zones: Record<PlayerId, Record<PlayerZoneKind, string[]>> = {}

  const makeObject = (owner: PlayerId, card: CardRef, zone: PlayerZoneKind, isCommander: boolean) => {
    const id = `o${nextId++}`
    objects[id] = {
      id, owner, controller: owner, card: { ...card }, zone, tapped: false, faceDown: false, counters: {},
      isToken: false, isCommander, commanderCasts: 0, timestamp: ++timestamp,
    }
    return id
  }

  for (const p of players) {
    const command = p.deck.commanders.map((c) => makeObject(p.id, c, 'command', true))
    const deck = p.deck.cards.map((c) => makeObject(p.id, c, 'library', false))
    const [library, nextRng] = shuffle(deck, rng)
    rng = nextRng
    zones[p.id] = { library, hand: [], graveyard: [], exile: [], command }
  }

  let starting = config.startingPlayer
  if (!starting) {
    const [i, nextRng] = randomIndex(players.length, rng)
    rng = nextRng
    starting = players[i]!.id
  }

  const base: GameState = {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    ruleset,
    rng,
    nextId,
    timestamp,
    status: 'mulligan',
    seats: players.map((p) => p.id),
    startingPlayer: starting,
    players: Object.fromEntries(players.map((p) => [p.id, {
      id: p.id, name: p.name, life: ruleset.startingLife, poison: 0, commanderDamage: {},
      mulligans: 0, hasKept: false, drewFromEmptyLibrary: false, lost: false,
    }])),
    objects,
    zones,
    battlefield: [],
    stack: [],
    turn: { number: 0, active: starting, step: 'untap' },
    priority: null,
    pending: null,
    winners: null,
  }

  const tx = new Tx(base)
  for (const p of players) drawCards(tx, p.id, ruleset.startingHandSize)
  continueMulligans(tx)
  return tx.s
}
