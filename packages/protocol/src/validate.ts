// Strict decoding of client messages. Everything that reaches the server is untrusted:
// only known keys survive, every field is type- and size-checked, and engine actions are rebuilt
// field by field so nothing unexpected can end up in the game state broadcast to other players.

import { STEPS, type ActionIntent, type CardRef, type DeckInput, type ZoneKind } from '@gathering-hall/engine'
import { decodePreset, MAX_PRESET_TEXT } from '@gathering-hall/formats'
import { MAX_MESSAGE_BYTES, MAX_SEATS, type ClientMessage } from './messages'

export const ROOM_ID = /^[A-Za-z0-9_-]{22}$/ // 128 bits, base64url
export const TOKEN = /^[A-Za-z0-9_-]{22}$/
const MANA_TYPES = ['W', 'U', 'B', 'R', 'G', 'C'] as const
const MAX_NAME = 24
const MAX_TEXT = 200
const MAX_ID = 40
const MAX_DECK = 250
const MAX_COMMANDERS = 2
// Control characters and bidi overrides are never accepted in names or free text.
// oxlint-disable-next-line no-control-regex -- detecting control characters is the point
const UNSAFE = /[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/
const PLAYERS = Array.from({ length: MAX_SEATS }, (_, i) => `p${i + 1}`)
const ZONES: readonly ZoneKind[] = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'stack', 'command']

export type DecodeResult = { ok: true; msg: ClientMessage } | { ok: false; error: string }

class Invalid extends Error {}
const bad = (msg: string): never => {
  throw new Invalid(msg)
}

type Obj = Record<string, unknown>

function obj(v: unknown, what: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) bad(`${what}: objeto esperado`)
  return v as Obj
}

function text(v: unknown, what: string, max = MAX_TEXT): string {
  if (typeof v !== 'string') bad(`${what}: texto esperado`)
  const s = (v as string).trim()
  if (!s || s.length > max || UNSAFE.test(s)) bad(`${what}: texto inválido`)
  return s
}

function optText(v: unknown, what: string, max = MAX_TEXT): string | undefined {
  return v === undefined ? undefined : text(v, what, max)
}

function int(v: unknown, what: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) bad(`${what}: número fora do limite`)
  return v as number
}

function finite(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1000) bad(`${what}: número inválido`)
  return v as number
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') bad(`${what}: verdadeiro/falso esperado`)
  return v as boolean
}

function oneOf<T extends string>(v: unknown, what: string, options: readonly T[]): T {
  if (!options.includes(v as T)) bad(`${what}: valor inválido`)
  return v as T
}

function id(v: unknown, what: string): string {
  return text(v, what, MAX_ID)
}

function pattern(v: unknown, what: string, re: RegExp): string {
  if (typeof v !== 'string' || !re.test(v)) bad(`${what}: formato inválido`)
  return v as string
}

export function cardRef(v: unknown): CardRef {
  const c = obj(v, 'carta')
  const ref: CardRef = { name: text(c.name, 'nome da carta') }
  for (const key of ['scryfallId', 'oracleId', 'typeLine', 'imageKey'] as const) {
    const value = optText(c[key], key)
    if (value !== undefined) ref[key] = value
  }
  return ref
}

export function deckInput(v: unknown): DeckInput {
  const d = obj(v, 'deck')
  if (!Array.isArray(d.commanders) || !Array.isArray(d.cards)) bad('deck: listas esperadas')
  const commanders = d.commanders as unknown[]
  const cards = d.cards as unknown[]
  if (commanders.length > MAX_COMMANDERS || cards.length > MAX_DECK) bad('deck: grande demais')
  return { commanders: commanders.map(cardRef), cards: cards.map(cardRef) }
}

// Rebuilds an engine action with exactly the fields that action type has.
// Épico 11: chosen targets, each a player or an object (the engine checks legality).
function targets(v: unknown) {
  if (!Array.isArray(v) || v.length > 20) bad('targets inválido')
  return (v as unknown[]).map((x) => {
    const t = obj(x, 'alvo')
    if (t.player !== undefined && t.object === undefined) return { player: id(t.player, 'player') }
    if (t.object !== undefined && t.player === undefined) return { object: id(t.object, 'object') }
    return bad('alvo precisa ser { player } ou { object }')
  })
}

function manaActivations(v: unknown) {
  if (!Array.isArray(v) || v.length > 60) bad('payWith inválido')
  return (v as unknown[]).map((item) => {
    const m = obj(item, 'ativação')
    return {
      objectId: id(m.objectId, 'objectId'), abilityIndex: int(m.abilityIndex, 'abilityIndex', 0, 9),
      ...(m.color !== undefined ? { color: oneOf(m.color, 'color', MANA_TYPES) } : {}),
    }
  })
}

export function actionIntent(v: unknown): ActionIntent {
  const a = obj(v, 'ação')
  const type = a.type
  switch (type) {
    case 'keepHand': case 'mulligan': case 'passPriority': case 'advanceStep': case 'shuffleLibrary': case 'concede':
    case 'cancelException':
      return { type }
    case 'answerException':
      return { type, approve: bool(a.approve, 'approve') }
    case 'requestException': {
      // One level only: the requested action is any ordinary action, never another exception message.
      const inner = actionIntent(a.action)
      if (inner.type === 'requestException' || inner.type === 'answerException' || inner.type === 'cancelException') bad('exceção dentro de exceção')
      const reason = a.reason === undefined || a.reason === '' ? '' : text(a.reason, 'motivo', 200)
      return { type, action: inner, reason }
    }
    case 'setStops': {
      const st = obj(a.stops, 'paradas')
      const steps = (v: unknown, what: string) => {
        if (!Array.isArray(v) || v.length > STEPS.length) bad(`${what} inválido`)
        return (v as unknown[]).map((x) => oneOf(x, what, STEPS))
      }
      return { type, stops: { own: steps(st.own, 'own'), others: steps(st.others, 'others'), passAfterOwnSpell: bool(st.passAfterOwnSpell, 'passAfterOwnSpell') } }
    }
    case 'passUntil':
      return { type, until: a.until === null ? null : oneOf(a.until, 'until', ['endOfTurn', 'myTurn'] as const) }
    case 'discard': {
      if (!Array.isArray(a.objectIds) || a.objectIds.length > 100) bad('objectIds inválido')
      return { type, objectIds: (a.objectIds as unknown[]).map((x) => id(x, 'objectId')) }
    }
    case 'bottomCards': {
      if (!Array.isArray(a.objectIds) || a.objectIds.length > 20) bad('objectIds inválido')
      return { type, objectIds: (a.objectIds as unknown[]).map((x) => id(x, 'objectId')) }
    }
    case 'moveObject':
      return {
        type, objectId: id(a.objectId, 'objectId'), to: oneOf(a.to, 'to', ZONES),
        ...(a.position !== undefined ? { position: oneOf(a.position, 'position', ['top', 'bottom'] as const) } : {}),
        ...(a.faceDown !== undefined ? { faceDown: bool(a.faceDown, 'faceDown') } : {}),
      }
    case 'draw': case 'mill':
      return { type, count: int(a.count, 'count', 1, 100) }
    case 'tap': case 'untap': case 'playLand':
      return { type, objectId: id(a.objectId, 'objectId') }
    case 'activateMana':
      return {
        type, objectId: id(a.objectId, 'objectId'), abilityIndex: int(a.abilityIndex, 'abilityIndex', 0, 9),
        ...(a.color !== undefined ? { color: oneOf(a.color, 'color', MANA_TYPES) } : {}),
      }
    case 'declareMana': {
      const m = obj(a.mana, 'mana')
      const mana: Partial<Record<(typeof MANA_TYPES)[number], number>> = {}
      for (const t of MANA_TYPES) if (m[t] !== undefined) mana[t] = int(m[t], `mana ${t}`, 0, 20)
      return { type, objectId: id(a.objectId, 'objectId'), mana }
    }
    case 'declareAttackers': {
      if (!Array.isArray(a.attacks) || a.attacks.length > 200) bad('attacks inválido')
      return { type, attacks: (a.attacks as unknown[]).map((x) => { const m = obj(x, 'ataque'); return { attacker: id(m.attacker, 'attacker'), target: id(m.target, 'target') } }) }
    }
    case 'declareBlockers': {
      if (!Array.isArray(a.blocks) || a.blocks.length > 200) bad('blocks inválido')
      return { type, blocks: (a.blocks as unknown[]).map((x) => { const m = obj(x, 'bloqueio'); return { blocker: id(m.blocker, 'blocker'), attacker: id(m.attacker, 'attacker') } }) }
    }
    case 'assignDamage': {
      if (!Array.isArray(a.assignments) || a.assignments.length > 400) bad('assignments inválido')
      return {
        type,
        assignments: (a.assignments as unknown[]).map((x) => {
          const m = obj(x, 'dano')
          return { source: id(m.source, 'source'), to: id(m.to, 'to'), amount: int(m.amount, 'amount', 0, 9999) }
        }),
      }
    }
    case 'adjustPT':
      return { type, objectId: id(a.objectId, 'objectId'), power: int(a.power, 'power', -100, 100), toughness: int(a.toughness, 'toughness', -100, 100) }
    case 'dealDamage':
      return {
        type, objectId: id(a.objectId, 'objectId'), amount: int(a.amount, 'amount', 1, 999),
        ...(a.deathtouch !== undefined ? { deathtouch: bool(a.deathtouch, 'deathtouch') } : {}),
      }
    case 'castSpell':
      return {
        type, objectId: id(a.objectId, 'objectId'), ...(a.x !== undefined ? { x: int(a.x, 'x', 0, 100) } : {}),
        ...(a.payWith !== undefined ? { payWith: manaActivations(a.payWith) } : {}),
        ...(a.targets !== undefined ? { targets: targets(a.targets) } : {}),
      }
    case 'chooseTargets':
      return { type, targets: targets(a.targets), ...(a.manual !== undefined ? { manual: bool(a.manual, 'manual') } : {}) }
    case 'setFaceDown':
      return { type, objectId: id(a.objectId, 'objectId'), faceDown: bool(a.faceDown, 'faceDown') }
    case 'addCounter':
      return { type, objectId: id(a.objectId, 'objectId'), counter: text(a.counter, 'counter', 40), delta: int(a.delta, 'delta', -99, 99) }
    case 'createToken':
      return { type, card: cardRef(a.card), ...(a.tapped !== undefined ? { tapped: bool(a.tapped, 'tapped') } : {}) }
    case 'setArrangement': {
      if (a.arrangement === null) return { type, objectId: id(a.objectId, 'objectId'), arrangement: null }
      const p = obj(a.arrangement, 'arrangement')
      return { type, objectId: id(a.objectId, 'objectId'), arrangement: { x: finite(p.x, 'x'), z: finite(p.z, 'z') } }
    }
    case 'adjustLife': case 'adjustPoison':
      return { type, target: id(a.target, 'target'), delta: int(a.delta, 'delta', -999, 999) }
    case 'commanderDamage':
      return {
        type, target: id(a.target, 'target'), commanderId: id(a.commanderId, 'commanderId'),
        amount: int(a.amount, 'amount', -999, 999), alsoLife: bool(a.alsoLife, 'alsoLife'),
      }
    case 'putAbilityOnStack':
      return {
        type, description: text(a.description, 'description'),
        ...(a.sourceId !== undefined ? { sourceId: id(a.sourceId, 'sourceId') } : {}),
      }
    default:
      return bad('tipo de ação desconhecido')
  }
}

export function decodeClientMessage(raw: string): DecodeResult {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return { ok: false, error: 'mensagem grande demais' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'JSON inválido' }
  }
  try {
    const m = obj(parsed, 'mensagem')
    if (m.v !== 1) bad('versão do protocolo incompatível')
    switch (m.t) {
      case 'hello':
        return {
          ok: true,
          msg: {
            v: 1, t: 'hello', room: pattern(m.room, 'sala', ROOM_ID),
            ...(m.token !== undefined ? { token: pattern(m.token, 'token', TOKEN) } : {}),
            ...(m.spectator !== undefined ? { spectator: bool(m.spectator, 'spectator') } : {}),
          },
        }
      case 'sit':
        return { ok: true, msg: { v: 1, t: 'sit', seat: int(m.seat, 'lugar', 0, MAX_SEATS - 1), name: text(m.name, 'nome', MAX_NAME), deck: deckInput(m.deck) } }
      case 'configure': {
        // Same validation as a preset pasted by a user (the formats codec).
        const decoded = decodePreset(JSON.stringify({ kind: 'gathering-hall/preset', v: 1, preset: m.preset }).slice(0, MAX_PRESET_TEXT + 1))
        if (!decoded.ok) return bad(`regras: ${decoded.error}`)
        return { ok: true, msg: { v: 1, t: 'configure', preset: decoded.preset } }
      }
      case 'act':
        return { ok: true, msg: { v: 1, t: 'act', seq: int(m.seq, 'seq', 0, Number.MAX_SAFE_INTEGER), action: actionIntent(m.action) } }
      case 'skip':
        return { ok: true, msg: { v: 1, t: 'skip', player: oneOf(m.player, 'jogador', PLAYERS) } }
      case 'stand': case 'start': case 'rematch': case 'ping':
        return { ok: true, msg: { v: 1, t: m.t } }
      default:
        return bad('tipo de mensagem desconhecido')
    }
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.message }
    throw err
  }
}
