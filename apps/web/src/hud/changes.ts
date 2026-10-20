// What is different about an object on the table compared with its printed card (épico 12): the preview shows it,
// read from the view's characteristics (after every layer). Pure, so it is tested without a table.

import type { CardRef, CardType, ObjectView, PlayerView } from '@gathering-hall/engine'
import { keywordLabel } from './keywordHelp'

const TYPE_LABELS: Record<CardType, string> = {
  creature: 'criatura', artifact: 'artefato', enchantment: 'encantamento', land: 'terreno', planeswalker: 'planeswalker',
  instant: 'instantânea', sorcery: 'feitiço', battle: 'batalha',
}
const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items.at(-1)}` : items[0] ?? '')

export function changesOf(obj: ObjectView, card: CardRef, view: PlayerView | undefined): string[] {
  if (obj.zone !== 'battlefield' || obj.faceDown) return []
  const lines: string[] = []
  const name = (id: string) => view?.objects[id]?.card?.name ?? 'uma carta'
  if (obj.copyOf) lines.push(`Cópia de ${name(obj.copyOf)}`)
  const printedTypes = card.rules?.types ?? []
  const newTypes = (obj.types ?? []).filter((t) => !printedTypes.includes(t))
  if (newTypes.length) lines.push(`Agora também é ${list(newTypes.map((t) => TYPE_LABELS[t]))}`)
  const printedSubs = card.rules?.subtypes ?? []
  const subs = obj.subtypes ?? []
  if (card.rules && (subs.length !== printedSubs.length || subs.some((s) => !printedSubs.includes(s)))) lines.push(`Tipos agora: ${subs.join(' ') || 'nenhum'}`)
  if (obj.abilitiesLost) lines.push('Perdeu as habilidades do texto')
  const printedKeywords: string[] = card.rules?.keywords ?? []
  const keywords: string[] = obj.keywords ?? []
  const gained = keywords.filter((k) => !printedKeywords.includes(k))
  const lost = printedKeywords.filter((k) => !keywords.includes(k))
  if (gained.length) lines.push(`Ganhou: ${list(gained.map(keywordLabel))}`)
  if (lost.length && !obj.abilitiesLost) lines.push(`Perdeu: ${list(lost.map(keywordLabel))}`)
  if (obj.attachedTo) lines.push(`${card.rules?.subtypes.includes('Aura') ? 'Encantando' : 'Equipando'} ${name(obj.attachedTo)}`)
  const attached = Object.values(view?.objects ?? {}).filter((o) => o.attachedTo === obj.id && o.zone === 'battlefield')
  if (attached.length) lines.push(`Com ${list(attached.map((o) => o.card?.name ?? 'uma carta'))}`)
  return lines
}
