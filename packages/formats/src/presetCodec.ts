// Share presets as plain text (paste into a group chat). Imported text is untrusted: every field is
// checked against an allowlist of keys, types and ranges; unknown keys are dropped; anything invalid rejects it.

import type { BanlistSource, Enforcement, Preset } from './types'

const MARKER = 'gathering-hall/preset'
export const MAX_PRESET_TEXT = 10_000
const MAX_NAME = 60
const MAX_BANS = 200
const MAX_CARD_NAME = 200

const NUMBER_RANGES = {
  startingLife: [1, 999], startingHandSize: [0, 15], maxHandSize: [0, 99], commanderDamageLimit: [1, 999],
  poisonLimit: [1, 99], commanderTaxIncrement: [0, 20], freeMulligans: [0, 7], landsPerTurn: [1, 5],
} as const
const BOOLEANS = ['autoUntap', 'autoDraw', 'autoLoss', 'restrictToController'] as const
const LEVEL_KEYS = ['sizeLevel', 'singleton', 'colorIdentity', 'commanderEligibility', 'pairing'] as const
const RULE_LEVEL_KEYS = ['timingRules', 'manaRules', 'combatRules'] as const // épico 09
const LEVELS: Enforcement[] = ['block', 'warn', 'off']
const SOURCES: BanlistSource[] = ['official', 'none', 'custom']

export function encodePreset(preset: Preset): string {
  return JSON.stringify({ kind: MARKER, v: 1, preset })
}

export type DecodeResult = { ok: true; preset: Preset } | { ok: false; error: string }

class Invalid extends Error {}
const bad = (msg: string): never => {
  throw new Invalid(msg)
}

export function decodePreset(text: string): DecodeResult {
  if (typeof text !== 'string' || text.length > MAX_PRESET_TEXT) return { ok: false, error: 'Texto vazio ou grande demais.' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Isso não parece um preset do The Gathering Hall.' }
  }
  try {
    const root = obj(raw, 'arquivo')
    if (root.kind !== MARKER || root.v !== 1) bad('Isso não parece um preset do The Gathering Hall.')
    return { ok: true, preset: sanitize(obj(root.preset, 'preset')) }
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.message }
    throw err
  }
}

function sanitize(p: Record<string, unknown>): Preset {
  const base = obj(p.base, 'base')
  if (base.formatId !== 'commander') bad('Formato desconhecido.')
  const preset: Preset = {
    id: str(p.id, 'id', 64),
    name: str(p.name, 'nome', MAX_NAME),
    base: { formatId: 'commander', version: str(base.version, 'versão', 20) },
  }

  if (p.ruleset !== undefined) {
    const r = obj(p.ruleset, 'regras de partida')
    const ruleset: NonNullable<Preset['ruleset']> = {}
    for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
      if (r[key] !== undefined) (ruleset as Record<string, number>)[key] = int(r[key], key, min, max)
    }
    for (const key of BOOLEANS) if (r[key] !== undefined) ruleset[key] = bool(r[key], key)
    if (r.priorityMode !== undefined) ruleset.priorityMode = oneOf(r.priorityMode, 'priorityMode', ['relaxed', 'strict'] as const)
    if (r.mulligan !== undefined) ruleset.mulligan = oneOf(r.mulligan, 'mulligan', ['london'] as const)
    for (const key of RULE_LEVEL_KEYS) if (r[key] !== undefined) ruleset[key] = oneOf(r[key], key, LEVELS)
    preset.ruleset = ruleset
  }

  if (p.deckRules !== undefined) {
    const d = obj(p.deckRules, 'regras de deck')
    const deckRules: NonNullable<Preset['deckRules']> = {}
    if (d.deckSize !== undefined) deckRules.deckSize = int(d.deckSize, 'deckSize', 40, 250)
    for (const key of LEVEL_KEYS) if (d[key] !== undefined) deckRules[key] = oneOf(d[key], key, LEVELS)
    if (d.banlist !== undefined) {
      const b = obj(d.banlist, 'banlist')
      deckRules.banlist = {
        ...(b.source !== undefined ? { source: oneOf(b.source, 'source', SOURCES) } : {}),
        ...(b.level !== undefined ? { level: oneOf(b.level, 'level', LEVELS) } : {}),
        ...(b.extraBans !== undefined ? { extraBans: names(b.extraBans, 'extraBans') } : {}),
        ...(b.unbans !== undefined ? { unbans: names(b.unbans, 'unbans') } : {}),
        ...(b.asOf !== undefined ? { asOf: date(b.asOf, 'asOf') } : {}),
      }
    }
    preset.deckRules = deckRules
  }
  return preset
}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) bad(`Campo inválido: ${what}.`)
  return v as Record<string, unknown>
}

function str(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) bad(`Campo inválido: ${what}.`)
  return (v as string).trim()
}

function int(v: unknown, what: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) bad(`${what} precisa ser um número entre ${min} e ${max}.`)
  return v as number
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') bad(`Campo inválido: ${what}.`)
  return v as boolean
}

function oneOf<T extends string>(v: unknown, what: string, options: readonly T[]): T {
  if (!options.includes(v as T)) bad(`Valor inválido em ${what}.`)
  return v as T
}

function date(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) bad(`Data inválida em ${what} (use AAAA-MM-DD).`)
  return v as string
}

function names(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || v.length > MAX_BANS) bad(`Lista inválida: ${what}.`)
  return (v as unknown[]).map((n) => str(n, what, MAX_CARD_NAME))
}
