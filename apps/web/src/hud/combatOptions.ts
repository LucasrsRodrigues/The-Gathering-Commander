// Combat on the table (épico 09, T9.16): who can attack or block, and what a damage proposal will do. Pure helpers
// over the player's view; the engine still decides what is legal.

import type { DamageAssignment, ObjectView, PlayerId, PlayerView } from '@gathering-hall/engine'

export interface Choice {
  id: string
  label: string
}

// Épico 12: the view's characteristics (after every layer); the type line only when the view has none.
const typesOf = (obj: ObjectView): string[] => obj.types?.length ? obj.types : (/\bcreature\b/i.test(obj.card?.typeLine ?? '') ? ['creature'] : [])
const isCreature = (obj: ObjectView) => typesOf(obj).includes('creature')
const isPlaneswalker = (obj: ObjectView) => obj.types?.length ? obj.types.includes('planeswalker') : /planeswalker/i.test(obj.card?.typeLine ?? '')
const has = (obj: ObjectView | undefined, k: string) => !!obj?.keywords?.includes(k as never)
const name = (view: PlayerView, id: string) => view.players[id]?.name ?? view.objects[id]?.card?.name ?? 'alvo'

export function pt(obj: ObjectView): string {
  return obj.power !== null && obj.toughness !== null ? `${obj.power}/${obj.toughness}` : '?/?'
}

const mine = (view: PlayerView, seat: PlayerId) =>
  view.battlefield.map((id) => view.objects[id]!).filter((o) => o && o.controller === seat && !o.tapped && isCreature(o))

// The seat's untapped creatures and what they can attack: each opponent still in the game and their planeswalkers.
export function attackOptions(view: PlayerView, seat: PlayerId): { creatures: ObjectView[]; targets: Choice[] } {
  const opponents = view.seats.filter((p) => p !== seat && !view.players[p]?.lost)
  const walkers = view.battlefield.map((id) => view.objects[id]!).filter((o) => o && opponents.includes(o.controller) && isPlaneswalker(o))
  return {
    creatures: mine(view, seat),
    targets: [
      ...opponents.map((p) => ({ id: p, label: name(view, p) })),
      ...walkers.map((o) => ({ id: o.id, label: `${o.card?.name ?? 'Planeswalker'} (de ${name(view, o.controller)})` })),
    ],
  }
}

// What attacks the seat (directly or through its planeswalkers), and the creatures it can block with.
export function blockOptions(view: PlayerView, seat: PlayerId): { attackers: Choice[]; blockers: ObjectView[] } {
  const attacks = view.turn.combat?.attacks ?? []
  const attackers = attacks
    .filter((a) => a.target === seat || view.objects[a.target]?.controller === seat)
    .map((a) => {
      const obj = view.objects[a.attacker]
      const flags = [has(obj, 'flying') && 'Flying', has(obj, 'menace') && 'Menace', has(obj, 'trample') && 'Trample'].filter(Boolean)
      return { id: a.attacker, label: `${obj?.card?.name ?? 'Atacante'} ${obj ? pt(obj) : ''}${flags.length ? ` · ${flags.join(', ')}` : ''}${a.target !== seat ? ` → ${name(view, a.target)}` : ''}` }
    })
  return { attackers, blockers: mine(view, seat) }
}

export interface DamagePreview {
  dies: string[] // names of creatures and planeswalkers that will not survive
  life: { player: PlayerId; name: string; delta: number }[]
  commander: { player: PlayerId; name: string; source: string; total: number }[]
}

// What confirming these assignments will do (CR 510.2 + state-based actions), as far as the view can tell.
export function damagePreview(view: PlayerView, assignments: DamageAssignment[]): DamagePreview {
  const toObject = new Map<string, { total: number; deathtouch: boolean }>()
  const life = new Map<PlayerId, number>()
  const commander: DamagePreview['commander'] = []
  for (const a of assignments) {
    if (!a.amount) continue
    const source = view.objects[a.source]
    if (view.players[a.to]) {
      life.set(a.to, (life.get(a.to) ?? 0) - a.amount)
      if (source?.isCommander) {
        const before = view.players[a.to]!.commanderDamage[a.source] ?? 0
        commander.push({ player: a.to, name: name(view, a.to), source: source.card?.name ?? 'Comandante', total: before + a.amount })
      }
    } else {
      const entry = toObject.get(a.to) ?? { total: 0, deathtouch: false }
      toObject.set(a.to, { total: entry.total + a.amount, deathtouch: entry.deathtouch || has(source, 'deathtouch') })
    }
    if (has(source, 'lifelink') && source) life.set(source.controller, (life.get(source.controller) ?? 0) + a.amount)
  }
  const dies: string[] = []
  for (const [id, { total, deathtouch }] of toObject) {
    const obj = view.objects[id]
    if (!obj) continue
    if (isCreature(obj)) {
      if (obj.toughness === null || has(obj, 'indestructible')) continue
      if (deathtouch || obj.damage + total >= obj.toughness) dies.push(obj.card?.name ?? 'Criatura')
    } else if (isPlaneswalker(obj) && (obj.counters.lealdade ?? 0) - total <= 0) {
      dies.push(obj.card?.name ?? 'Planeswalker')
    }
  }
  return {
    dies,
    life: [...life].filter(([, d]) => d).map(([player, delta]) => ({ player, name: name(view, player), delta })),
    commander,
  }
}
