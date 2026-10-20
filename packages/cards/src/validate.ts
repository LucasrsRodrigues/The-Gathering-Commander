// Checks that hand-written rules fit the effect model, so a typo in an exception fails a test instead of a game.

import type { Ability, CardRules, Effect, TargetSpec, Value } from '@gathering-hall/engine'

const EFFECTS = new Set(['draw', 'damage', 'gainLife', 'loseLife', 'destroy', 'exile', 'bounce', 'counters', 'pump', 'token', 'mill', 'discard', 'search', 'scry', 'surveil', 'addMana'])
const VALUES = new Set(['fixed', 'x', 'power', 'toughness', 'count', 'counters'])
const TARGETS = new Set(['object', 'player', 'any'])

function value(v: Value | undefined, where: string, errors: string[]) {
  if (v === undefined) return
  if (!v || !VALUES.has(v.kind)) return void errors.push(`${where}: valor desconhecido`)
  if (v.kind === 'fixed' && !(Number.isInteger(v.n) && v.n >= 0 && v.n <= 100)) errors.push(`${where}: número fora de 0–100`)
}

function effect(e: Effect, where: string, errors: string[]) {
  if (!e || !EFFECTS.has(e.kind)) return void errors.push(`${where}: efeito desconhecido`)
  for (const key of ['amount', 'power', 'toughness'] as const) value((e as Record<string, unknown>)[key] as Value | undefined, `${where}.${key}`, errors)
}

function target(t: TargetSpec, where: string, errors: string[]) {
  if (!t || !TARGETS.has(t.kind)) return void errors.push(`${where}: alvo desconhecido`)
  if (t.kind === 'object' && !(Number.isInteger(t.count) && t.count >= 1 && t.count <= 20)) errors.push(`${where}: quantidade de alvos inválida`)
}

function ability(a: Ability, where: string, errors: string[]) {
  if (!a || typeof a.text !== 'string' || !a.text.trim()) errors.push(`${where}: sem texto`)
  if (!Array.isArray(a?.effects) || a.effects.length === 0) return void errors.push(`${where}: sem efeitos`)
  a.effects.forEach((e, i) => effect(e, `${where}.effects[${i}]`, errors))
  a.targets?.forEach((t, i) => target(t, `${where}.targets[${i}]`, errors))
}

export function validateRules(rules: Partial<CardRules>): string[] {
  const errors: string[] = []
  if (rules.spell) ability(rules.spell, 'spell', errors)
  rules.etb?.forEach((a, i) => ability(a, `etb[${i}]`, errors))
  rules.activated?.forEach((a, i) => {
    ability(a, `activated[${i}]`, errors)
    if (!a.cost || typeof a.cost !== 'object') errors.push(`activated[${i}]: sem custo`)
  })
  if (rules.coverage && !['automated', 'partial', 'manual'].includes(rules.coverage)) errors.push('coverage inválida')
  try {
    if (JSON.stringify(JSON.parse(JSON.stringify(rules))) !== JSON.stringify(rules)) errors.push('não é dado puro')
  } catch {
    errors.push('não é serializável')
  }
  return errors
}
