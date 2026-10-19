// Mana on the table (épico 09): what tapping a source offers, and how mana is written ({G}{G}).

import { planPaymentFromView, type ActionIntent, type ManaActivation, type ManaAmount, type ManaColor, type ManaType, type ObjectView, type PlayerId, type PlayerView } from '@gathering-hall/engine'
import type { MenuItem } from './actions'

const MANA_TYPES: readonly ManaType[] = ['W', 'U', 'B', 'R', 'G', 'C']
const COLORS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G']

export function formatMana(mana: Partial<Record<ManaType, number>>): string {
  return MANA_TYPES.flatMap((t) => Array<string>(mana[t] ?? 0).fill(`{${t}}`)).join('')
}

function identity(view: PlayerView, player: PlayerId): ManaColor[] {
  const colors = new Set<ManaColor>()
  for (const o of Object.values(view.objects)) if (o.isCommander && o.owner === player) o.card?.rules?.colorIdentity.forEach((c) => colors.add(c))
  return COLORS.filter((c) => colors.has(c))
}

const isLand = (obj: ObjectView) => obj.card?.rules ? obj.card.rules.types.includes('land') : /\bland\b/i.test(obj.card?.typeLine ?? '')

// The mana a source offers its controller right now: one item per ability and color. Sources the parser did not
// recognize (and lands without data) offer "declared" mana instead.
export function manaItems(view: PlayerView, viewer: PlayerId | null, obj: ObjectView): MenuItem[] {
  if (!viewer || obj.zone !== 'battlefield' || obj.controller !== viewer || obj.tapped || !obj.card) return []
  const rules = obj.card.rules
  if ((!rules && isLand(obj)) || rules?.hasUnrecognizedMana) {
    return MANA_TYPES.map((t) => ({ label: `Declarar ${formatMana({ [t]: 1 })}`, action: { type: 'declareMana', objectId: obj.id, mana: { [t]: 1 } } }))
  }
  const items: MenuItem[] = []
  rules?.manaAbilities.forEach((ability, abilityIndex) => {
    const notes = [
      ability.extraCost ? `paga {${ability.extraCost.generic}}` : '',
      ability.lifeCost ? `${ability.lifeCost} de vida` : '',
      ability.selfDamage ? `${ability.selfDamage} de dano em você` : '',
    ].filter(Boolean)
    const suffix = notes.length ? ` (${notes.join(', ')})` : ''
    const p = ability.produces
    const add = (mana: ManaAmount, color?: ManaType) =>
      items.push({ label: `Gerar ${formatMana(mana)}${suffix}`, action: { type: 'activateMana', objectId: obj.id, abilityIndex, ...(color ? { color } : {}) } })
    if (p.kind === 'fixed') add(p.mana)
    else {
      const colors = p.kind === 'oneOf' ? p.colors : p.kind === 'anyColor' ? COLORS : identity(view, viewer)
      for (const c of colors) add({ [c]: p.kind === 'anyColor' ? p.amount : 1 }, c)
    }
  })
  return items
}

export interface PendingPayment {
  action: Extract<ActionIntent, { type: 'castSpell' }>
  plan: ManaActivation[]
}

// A cast that needs sources tapped becomes a confirmation; anything else goes straight to the engine (which
// blocks it with the reason when it cannot be paid).
export function paymentFor(view: PlayerView, seat: PlayerId, action: ActionIntent): PendingPayment | null {
  if (action.type !== 'castSpell' || action.payWith || view.ruleset.manaRules === 'off') return null
  const plan = planPaymentFromView(view, seat, action.objectId, action.x ?? 0)
  return plan?.length ? { action, plan } : null
}
