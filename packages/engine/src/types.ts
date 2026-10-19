// Core types of the rules engine. Everything here is plain JSON so a state can be
// saved, sent over the network, replayed or cloned for simulation.

export type PlayerId = string
export type ObjectId = string

export type ZoneKind = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'stack' | 'command'
export type PlayerZoneKind = 'library' | 'hand' | 'graveyard' | 'exile' | 'command'
export const PLAYER_ZONES: readonly PlayerZoneKind[] = ['library', 'hand', 'graveyard', 'exile', 'command']

// CR 500.1: the steps of a turn, in order.
export const STEPS = [
  'untap', 'upkeep', 'draw',
  'main1',
  'beginCombat', 'declareAttackers', 'declareBlockers', 'combatDamage', 'endCombat',
  'main2',
  'end', 'cleanup',
] as const
export type Step = (typeof STEPS)[number]

// Pointer to the card catalog, plus the structured rules the engine uses (épico 09). The engine never
// reads rules text: `rules` is derived outside the core (deriveRules.ts) and, online, by the server.
export interface CardRef {
  name: string
  scryfallId?: string
  oracleId?: string
  typeLine?: string
  imageKey?: string
  rules?: CardRules // absent = no data: the card stays playable with manual costs
}

// ---- Card rules (structured, no text) ---------------------------------------

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G'
export type ManaType = ManaColor | 'C'
export type ManaAmount = Partial<Record<ManaType, number>>

export type CardType = 'land' | 'creature' | 'artifact' | 'enchantment' | 'planeswalker' | 'instant' | 'sorcery' | 'battle'
export type Supertype = 'legendary' | 'basic' | 'snow'

export const KEYWORDS = [
  'flash', 'haste', 'vigilance', 'defender', 'flying', 'reach', 'menace',
  'trample', 'firstStrike', 'doubleStrike', 'deathtouch', 'lifelink', 'indestructible',
] as const
export type Keyword = (typeof KEYWORDS)[number]

// CR 107.4 mana symbols the engine understands. `unknown` = some symbol it does not (snow, …): cost is manual.
export interface ManaCost {
  generic: number
  colored: ManaAmount // includes {C}
  hybrid: [ManaColor, ManaColor][] // {W/U}
  twoBrid: ManaColor[] // {2/W}
  phyrexian: ManaColor[] // {G/P}
  x: number // how many {X}
  unknown?: boolean
}

export type ManaProduction =
  | { kind: 'fixed'; mana: ManaAmount } // {T}: Add {C}{C}.
  | { kind: 'oneOf'; colors: ManaType[] } // {T}: Add {W}, {U}, or {B}.
  | { kind: 'anyColor'; amount: number } // one mana of any color / three mana of any one color
  | { kind: 'commanderIdentity' } // one mana of any color in your commander's color identity

export interface ManaAbility {
  produces: ManaProduction
  extraCost?: ManaCost // "{1}, {T}: Add {U}{B}." (Signets)
  lifeCost?: number // "{T}, Pay 1 life: …"
  selfDamage?: number // "This land deals 1 damage to you." / "Whenever this land becomes tapped, it deals 1 damage to you."
  partial?: boolean // the ability does something else too (applied by hand)
}

export interface CardRules {
  types: CardType[]
  supertypes: Supertype[]
  subtypes: string[]
  cost: ManaCost | null // null = no mana cost (lands, suspend-only cards)
  power: number | null
  toughness: number | null
  variablePT?: boolean // '*' in P/T: base 0, needs a manual adjustment
  loyalty: number | null
  keywords: Keyword[]
  manaAbilities: ManaAbility[]
  hasUnrecognizedMana?: boolean // an activated ability adds mana in a way the parser does not know → declared mana
  entersTapped?: boolean
  spellMana?: ManaAmount // instants/sorceries whose whole text is "Add {B}{B}{B}."
  colorIdentity: ManaColor[]
}

export interface Arrangement {
  x: number
  z: number
}

export interface GameObject {
  id: ObjectId
  owner: PlayerId
  controller: PlayerId
  card: CardRef
  zone: ZoneKind
  tapped: boolean
  faceDown: boolean
  counters: Record<string, number>
  isToken: boolean
  isCommander: boolean
  commanderCasts: number
  arrangement?: Arrangement
  timestamp: number // CR 613.7: when the object entered its current zone
}

export type LossReason = 'life' | 'poison' | 'commanderDamage' | 'emptyLibrary' | 'conceded'

export interface PlayerState {
  id: PlayerId
  name: string
  life: number
  poison: number
  commanderDamage: Record<ObjectId, number> // received, per source commander
  mulligans: number
  hasKept: boolean
  drewFromEmptyLibrary: boolean
  lost: boolean
  lossReason?: LossReason
}

export interface StackItem {
  id: string
  kind: 'card' | 'ability'
  controller: PlayerId
  objectId?: ObjectId // for kind 'card': the object on the stack
  sourceId?: ObjectId // for kind 'ability': where it came from
  description?: string
}

export type PendingDecision =
  | { kind: 'mulligan'; player: PlayerId }
  | { kind: 'bottomCards'; player: PlayerId; count: number }

export type PriorityMode = 'relaxed' | 'strict'

export interface Ruleset {
  id: 'commander'
  version: string
  startingLife: number
  startingHandSize: number
  maxHandSize: number
  commanderDamageLimit: number
  poisonLimit: number
  commanderTaxIncrement: number
  mulligan: 'london'
  freeMulligans: number
  autoUntap: boolean
  autoDraw: boolean
  autoLoss: boolean
  priorityMode: PriorityMode
  restrictToController: boolean
}

export interface TurnState {
  number: number
  active: PlayerId
  step: Step
}

export interface PriorityState {
  player: PlayerId
  passed: PlayerId[]
}

export interface GameState {
  schemaVersion: 1
  engineVersion: string
  ruleset: Ruleset
  rng: number
  nextId: number
  timestamp: number
  status: 'mulligan' | 'playing' | 'ended'
  seats: PlayerId[]
  startingPlayer: PlayerId
  players: Record<PlayerId, PlayerState>
  objects: Record<ObjectId, GameObject>
  zones: Record<PlayerId, Record<PlayerZoneKind, ObjectId[]>> // ordered bottom → top
  battlefield: ObjectId[]
  stack: StackItem[] // last = top
  turn: TurnState
  priority: PriorityState | null
  pending: PendingDecision | null
  winners: PlayerId[] | null
}

// ---- Actions (commands) ----------------------------------------------------

type ActionOf<T extends string, P = object> = { type: T; player: PlayerId } & P

export type Action =
  | ActionOf<'keepHand'>
  | ActionOf<'mulligan'>
  | ActionOf<'bottomCards', { objectIds: ObjectId[] }>
  | ActionOf<'passPriority'>
  | ActionOf<'advanceStep'>
  | ActionOf<'moveObject', { objectId: ObjectId; to: ZoneKind; position?: 'top' | 'bottom'; faceDown?: boolean }>
  | ActionOf<'draw', { count: number }>
  | ActionOf<'mill', { count: number }>
  | ActionOf<'shuffleLibrary'>
  | ActionOf<'tap', { objectId: ObjectId }>
  | ActionOf<'untap', { objectId: ObjectId }>
  | ActionOf<'setFaceDown', { objectId: ObjectId; faceDown: boolean }>
  | ActionOf<'addCounter', { objectId: ObjectId; counter: string; delta: number }>
  | ActionOf<'createToken', { card: CardRef; tapped?: boolean }>
  | ActionOf<'setArrangement', { objectId: ObjectId; arrangement: Arrangement | null }>
  | ActionOf<'adjustLife', { target: PlayerId; delta: number }>
  | ActionOf<'adjustPoison', { target: PlayerId; delta: number }>
  | ActionOf<'commanderDamage', { target: PlayerId; commanderId: ObjectId; amount: number; alsoLife: boolean }>
  | ActionOf<'putAbilityOnStack', { description: string; sourceId?: ObjectId }>
  | ActionOf<'concede'>

export type ActionType = Action['type']

// An action before the acting player is attached (what a UI or bot "intends" to do).
type WithoutPlayer<A> = A extends unknown ? Omit<A, 'player'> : never
export type ActionIntent = WithoutPlayer<Action>

// ---- Events (things that happened) ----------------------------------------

export type GameEvent =
  | { type: 'gameStarted'; startingPlayer: PlayerId }
  | { type: 'mulliganTaken'; player: PlayerId; mulligans: number }
  | { type: 'handKept'; player: PlayerId }
  | { type: 'cardsBottomed'; player: PlayerId; objectIds: ObjectId[] }
  | { type: 'turnStarted'; player: PlayerId; turn: number }
  | { type: 'stepChanged'; step: Step; turn: number }
  | { type: 'priorityPassed'; player: PlayerId }
  | { type: 'zoneChanged'; objectId: ObjectId; owner: PlayerId; from: ZoneKind | null; to: ZoneKind | null }
  | { type: 'cardsDrawn'; player: PlayerId; objectIds: ObjectId[] }
  | { type: 'libraryShuffled'; player: PlayerId }
  | { type: 'tapped'; objectId: ObjectId }
  | { type: 'untapped'; objectId: ObjectId }
  | { type: 'faceChanged'; objectId: ObjectId; faceDown: boolean }
  | { type: 'counterChanged'; objectId: ObjectId; counter: string; value: number }
  | { type: 'tokenCreated'; objectId: ObjectId }
  | { type: 'arranged'; objectId: ObjectId }
  | { type: 'lifeChanged'; player: PlayerId; from: number; to: number }
  | { type: 'poisonChanged'; player: PlayerId; from: number; to: number }
  | { type: 'commanderDamageDealt'; player: PlayerId; commanderId: ObjectId; amount: number; total: number }
  | { type: 'stackItemAdded'; item: StackItem }
  | { type: 'stackItemResolved'; item: StackItem }
  | { type: 'commanderMayReturn'; objectId: ObjectId; owner: PlayerId }
  | { type: 'playerLost'; player: PlayerId; reason: LossReason }
  | { type: 'gameEnded'; winners: PlayerId[] }

// ---- Results ----------------------------------------------------------------

export type ErrorCode =
  | 'gameOver'
  | 'unknownPlayer'
  | 'playerLost'
  | 'wrongPhase'
  | 'notYourDecision'
  | 'notYourPriority'
  | 'notActivePlayer'
  | 'stackNotEmpty'
  | 'strictPriority'
  | 'unknownObject'
  | 'notAllowed'
  | 'invalidZone'
  | 'invalidAmount'
  | 'invalidSelection'
  | 'invalidAction'

export interface GameError {
  code: ErrorCode
  message: string
}

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: GameError }
