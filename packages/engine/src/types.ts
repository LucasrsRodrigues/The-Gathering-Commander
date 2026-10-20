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
  | { kind: 'dynamic'; color: ManaType; amount: Value } // épico 11: "Add an amount of {G} equal to ~'s power."

export interface ManaAbility {
  produces: ManaProduction
  extraCost?: ManaCost // "{1}, {T}: Add {U}{B}." (Signets)
  lifeCost?: number // "{T}, Pay 1 life: …"
  selfDamage?: number // "This land deals 1 damage to you." / "Whenever this land becomes tapped, it deals 1 damage to you."
  partial?: boolean // the ability does something else too (applied by hand)
  sacrificeSelf?: boolean // "{T}, Sacrifice this artifact: Add …" (Treasure)
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
  colors?: ManaColor[] // épico 12, CR 105.2: when the cost does not say it (tokens); otherwise derived from the cost (layers.ts)
  // Épico 11: what the card does, as data the engine interprets. Absent = the card plays by hand, as before.
  spell?: Ability // instants and sorceries: the effect on resolution
  etb?: Ability[] // "When ~ enters, …"
  activated?: ActivatedAbility[] // non-mana activated abilities
  coverage?: Coverage // absent = 'manual'
  manualText?: string[] // the sentences left to the players (partial cards)
}

// ---- Card effects (épico 11) ---------------------------------------------------
// Pure data: the state stays serializable and replays stay deterministic. The engine interprets them (effects/).

export type Coverage = 'automated' | 'partial' | 'manual'

// How much: fixed, the X paid, a P/T, a count, or counters on the source.
export type Value =
  | { kind: 'fixed'; n: number }
  | { kind: 'x' }
  | { kind: 'power' | 'toughness'; of: 'self' | 'target' }
  | { kind: 'count'; what: Filter; zone: 'battlefield' | 'hand' | 'graveyard' }
  | { kind: 'counters'; counter: string; of: 'self' }

// Which objects: for targets, counts and searches. Every field narrows; an empty filter matches everything.
export interface Filter {
  types?: CardType[] // any of these
  notTypes?: CardType[]
  subtypes?: string[] // any of these (case-insensitive)
  supertypes?: Supertype[]
  controller?: 'you' | 'opponent' | 'any'
  colors?: ManaColor[] // any of these: the object's color (épico 12; it was the color identity before, never used)
  tapped?: boolean
  other?: boolean // not the source itself ("another")
  token?: boolean
}

export type TargetSpec =
  | { kind: 'object'; filter: Filter; count: number; upTo?: boolean; zone?: 'battlefield' | 'stack' | 'graveyard' } // default: battlefield
  | { kind: 'player'; who: 'any' | 'opponent' }
  | { kind: 'any' } // "any target": creature, planeswalker or player (CR 115.4)

// Who an effect is about. 'target' = the first player target (or the controller of the first object target).
export type Who = 'you' | 'target' | 'each opponent' | 'each player'

export interface TokenDef {
  name: string
  types: CardType[]
  subtypes: string[]
  colors: ManaColor[]
  power: number | null
  toughness: number | null
  keywords: Keyword[]
  manaAbilities: ManaAbility[]
  etb?: Ability[] // a token with its own "when this enters" (from a card exception)
  activated?: ActivatedAbility[] // Clue, Food (épico 11, onda 2)
}

export type Effect =
  | { kind: 'draw'; who: Who; amount: Value }
  | { kind: 'damage'; to: 'target' | 'each opponent' | 'each creature'; amount: Value }
  | { kind: 'gainLife' | 'loseLife'; who: Who; amount: Value }
  | { kind: 'destroy' | 'exile' | 'bounce'; what: 'target' | { all: Filter } }
  | { kind: 'counters'; what: 'target' | 'self' | { each: Filter }; counter: string; amount: Value }
  | { kind: 'pump'; what: 'target' | 'self' | { each: Filter }; power: Value; toughness: Value } // until end of turn
  | { kind: 'token'; token: TokenDef; amount: Value; tapped?: boolean }
  | { kind: 'mill' | 'discard'; who: Who; amount: Value }
  | { kind: 'search'; filter: Filter; to: 'hand' | 'battlefield' | 'split'; tapped?: boolean; amount: Value } // split: Cultivate (one to the battlefield tapped, the rest to hand)
  | { kind: 'scry' | 'surveil'; amount: Value }
  | { kind: 'addMana'; produces: ManaProduction }

export interface Ability {
  targets?: TargetSpec[]
  effects: Effect[]
  text: string // the sentence, for the log and the preview
}

export interface AbilityCost {
  mana?: ManaCost
  tap?: boolean
  sacrifice?: Filter | 'self'
  discard?: number
  life?: number
}

// What activating an ability sends (CR 602.2): targets first, then the costs that need choosing.
export interface ActivateAbility {
  objectId: ObjectId
  index: number // into rules.activated
  targets?: Target[]
  payWith?: ManaActivation[] // mana abilities to activate first, atomically (as in castSpell)
  sacrifice?: ObjectId[] // for "Sacrifice a creature": which ones
  discard?: ObjectId[] // for "Discard a card": which ones
}

export interface ActivatedAbility extends Ability {
  cost: AbilityCost
  sorcerySpeed?: boolean // "Activate only as a sorcery."
}

export type Target = { player: PlayerId } | { object: ObjectId }

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
  // Épico 09 (combat and timing). Reset whenever the object changes zones (CR 400.7).
  damage: number // CR 120.6: marked damage, removed in cleanup
  deathtouchDamage: boolean // CR 704.5h
  controlledSince: number // turn number since which its controller has controlled it (CR 302.6)
  ptMods: { power: number; toughness: number }[] // manual "until end of turn" adjustments
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
  // Épico 09
  manaPool: ManaPool // CR 106.4: empties between steps
  landsPlayed: number // this turn (CR 305.2)
  lastTurnStarted: number // number of this player's most recent turn (summoning sickness)
  stops: StopSettings
  passUntil: 'endOfTurn' | 'myTurn' | null
}

export type ManaPool = Record<ManaType, number>

// Where a player wants to receive priority (Arena-style automatic passing).
export interface StopSettings {
  own: Step[] // steps of their own turn
  others: Step[] // steps of other players' turns
  passAfterOwnSpell: boolean // after casting, pass instead of holding priority
}

export interface StackItem {
  id: string
  kind: 'card' | 'ability'
  controller: PlayerId
  objectId?: ObjectId // for kind 'card': the object on the stack
  sourceId?: ObjectId // for kind 'ability': where it came from
  description?: string
  x?: number // the value chosen for {X} when the spell was cast
  // Épico 11: the automated ability this item resolves, and its chosen targets.
  ability?: { from: 'spell' | 'etb' | 'activated'; index: number }
  targets?: Target[]
  manual?: boolean // "Resolver à mão": resolves without the automated effects
  snapshot?: Ability // the ability as it was activated, for a source that left (a sacrificed token: CR 113.7a)
}

export type PendingDecision =
  | { kind: 'mulligan'; player: PlayerId }
  | { kind: 'bottomCards'; player: PlayerId; count: number }
  | { kind: 'declareAttackers'; player: PlayerId } // CR 508.1: the active player declares (an empty list is fine)
  | { kind: 'declareBlockers'; player: PlayerId; players: PlayerId[] } // CR 509.1: each attacked player; `player` = next
  | { kind: 'confirmDamage'; player: PlayerId; proposal: DamageProposal } // CR 510.1: the active player confirms or adjusts
  | { kind: 'discard'; player: PlayerId; count: number } // CR 514.1: discard down to the maximum hand size
  | ChooseTargets
  | LibraryChoice
  | ExceptionRequest

// Épico 11, onda 2: a resolving ability waits for its controller to choose cards from their library (CR 701.19
// search, 701.18 scry, 701.25 surveil). `cards` are visible only to that player (view.ts); the rest of the ability
// resumes afterwards.
export interface LibraryChoice {
  kind: 'searchLibrary' | 'scry' | 'surveil'
  player: PlayerId
  cards: ObjectId[] // search: the cards that fit; scry/surveil: the top cards, top first
  count: number // search: at most this many
  to?: 'hand' | 'battlefield' | 'split'
  tapped?: boolean
  text: string
  continueWith: { itemId: string; effects: Effect[]; ctx: { controller: PlayerId; sourceId?: ObjectId; targets?: Target[]; x?: number } }
}

// Épico 11, CR 603.3: a "when this enters" ability waiting to go on the stack (index into the source's `etb`).
export interface PendingTrigger {
  sourceId: ObjectId
  controller: PlayerId
  index: number
}

// CR 603.3d: the controller chooses the targets of a trigger as it goes on the stack. `priorityTo` gets priority afterwards.
export interface ChooseTargets {
  kind: 'chooseTargets'
  player: PlayerId
  trigger: PendingTrigger
  specs: TargetSpec[]
  text: string
  priorityTo: PlayerId
  rest: PendingTrigger[] // the triggers after this one, already in stacking order
}

// "Fazer mesmo assim" (épico 09): an action a 'block' policy rejected, waiting for the other players' approval.
// Public on purpose: approvers must see what they approve, so a card from hand is revealed with the request.
export interface ExceptionRequest {
  kind: 'exception'
  player: PlayerId // who asked
  action: Action
  reason: string
  card?: CardRef // the card the action plays, revealed to everyone
  findings: RuleFinding[]
  approvals: PlayerId[]
  resume?: PendingDecision // the decision the request interrupted (a combat declaration), restored afterwards
}

export type Attack = { attacker: ObjectId; target: PlayerId | ObjectId } // a player or a planeswalker

// Combat damage the engine proposes for one damage step (first strike or regular).
export interface DamageAssignment {
  source: ObjectId
  to: ObjectId | PlayerId
  amount: number
}
export interface DamageProposal {
  phase: 'first' | 'regular'
  assignments: DamageAssignment[]
}
export type Block = { blocker: ObjectId; attacker: ObjectId }

export type PriorityMode = 'relaxed' | 'strict'

// How strictly an area of the rules is enforced (épico 09): block, allow with a logged warning, or not checked.
export type RuleLevel = 'block' | 'warn' | 'off'
export type RuleArea = 'timing' | 'mana' | 'combat'

// One rule an action breaks. Blocking findings reject the action; warnings let it through as `ruleBent`.
export interface RuleFinding {
  area: RuleArea
  code: string // stable id, e.g. 'useCastOrPlay'
  message: string // for the player, in Portuguese
}

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
  landsPerTurn: number // CR 305.2
  timingRules: RuleLevel // when lands and spells may be played (CR 117, 305, 307)
  manaRules: RuleLevel // costs are paid from the mana pool (CR 601.2)
  combatRules: RuleLevel // attack / block legality and calculated damage (CR 506–511)
}

export interface TurnState {
  number: number
  active: PlayerId
  step: Step
  combat: CombatState | null // épico 09: only during the combat phase
}

export interface CombatState {
  attacks: Attack[]
  blocks: Block[]
  damageOrder: Record<ObjectId, ObjectId[]> // attacker → its blockers, in damage assignment order
  firstStrikeDealt: boolean // the first-strike damage step happened (CR 510.4)
  regularDealt: boolean
}

// Session options set by whoever creates the game (not house rules).
export interface GameOptions {
  exceptionApproval: 'auto' | 'vote' // local games approve rule exceptions at once; online games vote
}

export interface PriorityState {
  player: PlayerId
  passed: PlayerId[]
}

export const SCHEMA_VERSION = 2

export interface GameState {
  schemaVersion: typeof SCHEMA_VERSION
  engineVersion: string
  ruleset: Ruleset
  options: GameOptions
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
  triggers?: PendingTrigger[] // épico 11: triggered, not yet on the stack (CR 603.3)
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
  | ActionOf<'playLand', { objectId: ObjectId }> // CR 305.1
  | ActionOf<'castSpell', { objectId: ObjectId; x?: number; payWith?: ManaActivation[]; targets?: Target[] }> // CR 601.2 (payWith: tap these first, atomically; targets: épico 11)
  | ActionOf<'activateAbility', ActivateAbility> // épico 11, CR 602: an automated activated ability
  | ActionOf<'resolveManually', { stackItemId: string }> // épico 11: the top item resolves without its automated effects
  | ActionOf<'searchLibrary', { objectIds: ObjectId[] }> // answers a search: the cards found (none is fine)
  | ActionOf<'arrangeTop', { top: ObjectId[]; away: ObjectId[] }> // answers scry (away = bottom) or surveil (away = graveyard); top first
  | ActionOf<'chooseTargets', { targets: Target[]; manual?: boolean }> // épico 11: answers ChooseTargets (manual: do it by hand)
  | ActionOf<'activateMana', { objectId: ObjectId; abilityIndex: number; color?: ManaType }> // CR 605
  | ActionOf<'declareMana', { objectId: ObjectId; mana: ManaAmount }> // a source the parser did not recognize
  | ActionOf<'adjustPT', { objectId: ObjectId; power: number; toughness: number }> // until end of turn (unscripted pumps)
  | ActionOf<'dealDamage', { objectId: ObjectId; amount: number; deathtouch?: boolean }> // to a creature or planeswalker
  | ActionOf<'declareAttackers', { attacks: Attack[] }> // CR 508
  | ActionOf<'declareBlockers', { blocks: Block[] }> // CR 509
  | ActionOf<'assignDamage', { assignments: DamageAssignment[] }> // CR 510.1: confirm (or adjust) the proposal
  | ActionOf<'discard', { objectIds: ObjectId[] }> // answers the cleanup discard
  | ActionOf<'setStops', { stops: StopSettings }> // the player's own automatic-passing preferences
  | ActionOf<'passUntil', { until: 'endOfTurn' | 'myTurn' | null }>
  | ActionOf<'requestException', { action: ActionIntent; reason: string }>
  | ActionOf<'answerException', { approve: boolean }>
  | ActionOf<'cancelException'>

export type ActionType = Action['type']

// One mana ability to activate: which source, which of its abilities, and the color when it offers a choice.
export interface ManaActivation {
  objectId: ObjectId
  abilityIndex: number
  color?: ManaType
}

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
  | { type: 'priorityPassed'; player: PlayerId; auto?: true } // auto: passed by the player's stop settings
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
  | { type: 'stackItemFizzled'; item: StackItem } // CR 608.2b: every target became illegal, nothing happens
  | { type: 'resolvedManually'; player: PlayerId; item: StackItem } // "Resolver à mão": the players apply it by hand
  | { type: 'libraryArranged'; player: PlayerId; kind: 'scry' | 'surveil'; top: number; away: number } // how many, not which
  | { type: 'triggerSkipped'; sourceId: ObjectId; text: string } // CR 603.3d: no legal target, the trigger is removed
  | { type: 'effectDamage'; sourceId?: ObjectId; to: Target; amount: number } // épico 11: damage from a spell or ability
  | { type: 'abilityResolving'; item: StackItem; text: string } // épico 11: an automated ability applies its effects
  | { type: 'manualStep'; text: string; objectId?: ObjectId } // épico 11: a part the players do by hand
  | { type: 'commanderMayReturn'; objectId: ObjectId; owner: PlayerId }
  | { type: 'playerLost'; player: PlayerId; reason: LossReason }
  | { type: 'gameEnded'; winners: PlayerId[] }
  | { type: 'ruleBent'; player: PlayerId; area: RuleArea; code: string; message: string } // allowed by a 'warn' level
  | { type: 'manaAdded'; player: PlayerId; mana: ManaAmount; source: ObjectId | null }
  | { type: 'manaDeclared'; player: PlayerId; objectId: ObjectId } // the amount follows as manaAdded
  | { type: 'manaEmptied'; player: PlayerId }
  | { type: 'costPaid'; player: PlayerId; objectId: ObjectId; cost: string; mana: ManaAmount; life: number }
  | { type: 'manualCost'; player: PlayerId; objectId: ObjectId } // no data to charge: paid by hand
  | { type: 'ptAdjusted'; objectId: ObjectId; power: number; toughness: number }
  | { type: 'damageDealt'; objectId: ObjectId; amount: number; total: number }
  | { type: 'destroyed'; objectId: ObjectId; reason: 'damage' | 'toughness' | 'loyalty' } // by a state-based action
  | { type: 'attackersDeclared'; player: PlayerId; attacks: Attack[] }
  | { type: 'blockersDeclared'; player: PlayerId; blocks: Block[] }
  | { type: 'combatDamage'; phase: DamageProposal['phase']; assignments: DamageAssignment[] }
  | { type: 'exceptionRequested'; player: PlayerId; reason: string }
  | { type: 'exceptionAnswered'; player: PlayerId; approve: boolean }
  | { type: 'exceptionCancelled'; player: PlayerId }
  | { type: 'exceptionFailed'; player: PlayerId; message: string } // approved, but the action no longer works
  | { type: 'judgeAction'; player: PlayerId; actionType: ActionType; reason: string; approvedBy: PlayerId[] }

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
  | 'invalidTarget' // épico 11: a chosen target does not fit the spell or ability
  | 'ruleBlocked' // a house-rule area at 'block' rejected it; `findings` says why
  | 'pendingException' // a rule exception is waiting for answers
  | 'noException' // nothing to answer, or the action did not need an exception

export interface GameError {
  code: ErrorCode
  message: string
  findings?: RuleFinding[] // only for 'ruleBlocked'
}

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: GameError }
