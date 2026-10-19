// Strict decoding of client messages. Everything that reaches the server is untrusted:
// only known keys survive, every field is type- and size-checked, and engine actions are rebuilt
// field by field so nothing unexpected can end up in the game state broadcast to other players.

import type { ActionIntent, CardRef, DeckInput, ZoneKind } from '@gathering-hall/engine'
import { decodePreset, MAX_PRESET_TEXT } from '@gathering-hall/formats'
import { MAX_MESSAGE_BYTES, MAX_SEATS, type ClientMessage } from './messages'

export const ROOM_ID = /^[A-Za-z0-9_-]{22}$/ // 128 bits, base64url
export const TOKEN = /^[A-Za-z0-9_-]{22}$/
const MAX_NAME = 24
const MAX_TEXT = 200
const MAX_ID = 40
const MAX_DECK = 250
const MAX_COMMANDERS = 2
// Control characters and bidi overrides are never accepted in names or free text.
// oxlint-disable-next-line no-control-regex -- detecting control characters is the point
const UNSAFE = /[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/
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
export function actionIntent(v: unknown): ActionIntent {
  const a = obj(v, 'ação')
  const type = a.type
  switch (type) {
    case 'keepHand': case 'mulligan': case 'passPriority': case 'advanceStep': case 'shuffleLibrary': case 'concede':
      return { type }
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
    case 'castSpell':
      return { type, objectId: id(a.objectId, 'objectId'), ...(a.x !== undefined ? { x: int(a.x, 'x', 0, 100) } : {}) }
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
