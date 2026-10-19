// Turns engine events into short Portuguese log lines without revealing hidden cards.

import type { CardRef, GameEvent, PlayerId, Step, ZoneKind } from '@gathering-hall/engine'

// Both a full GameState (local) and a PlayerView (online) fit this shape.
export interface LogContext {
  players: Record<PlayerId, { name: string } | undefined>
  objects: Record<string, { card: CardRef | null } | undefined>
}

export const STEP_LABELS: Record<Step, string> = {
  untap: 'Desvirar', upkeep: 'Manutenção', draw: 'Compra', main1: 'Principal 1',
  beginCombat: 'Início do combate', declareAttackers: 'Atacantes', declareBlockers: 'Bloqueadores',
  combatDamage: 'Dano de combate', endCombat: 'Fim do combate', main2: 'Principal 2',
  end: 'Final', cleanup: 'Limpeza',
}

export const ZONE_LABELS: Record<ZoneKind, string> = {
  library: 'grimório', hand: 'mão', battlefield: 'campo de batalha', graveyard: 'cemitério',
  exile: 'exílio', stack: 'pilha', command: 'zona de comando',
}

const LOSS_LABELS = {
  life: 'ficou sem vida', poison: 'foi envenenado', commanderDamage: 'sofreu 21 de dano de comandante',
  emptyLibrary: 'comprou de um grimório vazio', conceded: 'concedeu',
} as const

const HIDDEN: (ZoneKind | null)[] = ['library', 'hand', null]

export function describeEvents(events: GameEvent[], after: LogContext, before: LogContext, viewer: PlayerId | null): string[] {
  const name = (id: PlayerId) => after.players[id]?.name ?? id
  const cardName = (id: string) => (after.objects[id] ?? before.objects[id])?.card?.name ?? 'uma carta'
  const lines: string[] = []
  for (const e of events) {
    switch (e.type) {
      case 'gameStarted': lines.push(`A partida começou. ${name(e.startingPlayer)} joga primeiro.`); break
      case 'mulliganTaken': lines.push(`${name(e.player)} fez mulligan (${e.mulligans}).`); break
      case 'handKept': lines.push(`${name(e.player)} manteve a mão.`); break
      case 'turnStarted': lines.push(`— Turno ${e.turn}: ${name(e.player)} —`); break
      case 'cardsDrawn': lines.push(`${name(e.player)} comprou ${e.objectIds.length} carta(s).`); break
      case 'libraryShuffled': lines.push(`${name(e.player)} embaralhou o grimório.`); break
      case 'zoneChanged': {
        if (e.from === 'library' && e.to === 'hand') break
        const hidden = HIDDEN.includes(e.from) && HIDDEN.includes(e.to)
        const ownHidden = e.owner === viewer
        const what = hidden && !ownHidden ? 'uma carta' : cardName(e.objectId)
        if (e.to === null) lines.push(`${what} saiu do jogo.`)
        else if (e.to !== 'stack') lines.push(`${what}: ${e.from ? ZONE_LABELS[e.from] : 'nova'} → ${ZONE_LABELS[e.to]}.`)
        break
      }
      case 'stackItemAdded':
        lines.push(`${name(e.item.controller)} pôs na pilha: ${e.item.objectId ? cardName(e.item.objectId) : e.item.description}.`)
        break
      case 'stackItemResolved':
        lines.push(`Resolveu: ${e.item.objectId ? cardName(e.item.objectId) : e.item.description}.`)
        break
      case 'lifeChanged': lines.push(`${name(e.player)}: vida ${e.from} → ${e.to}.`); break
      case 'poisonChanged': lines.push(`${name(e.player)}: veneno ${e.from} → ${e.to}.`); break
      case 'commanderDamageDealt':
        lines.push(`${name(e.player)} recebeu ${e.amount} de dano de ${cardName(e.commanderId)} (total ${e.total}).`)
        break
      case 'commanderMayReturn': lines.push(`${cardName(e.objectId)} pode voltar para a zona de comando.`); break
      case 'playerLost': lines.push(`${name(e.player)} ${LOSS_LABELS[e.reason]} e saiu da partida.`); break
      case 'gameEnded':
        lines.push(e.winners.length ? `Fim de jogo! Vitória de ${e.winners.map(name).join(', ')}.` : 'Fim de jogo.')
        break
      case 'ruleBent': lines.push(`Regra contornada (aviso) por ${name(e.player)}: ${e.message}`); break
      case 'costPaid':
        lines.push(`${name(e.player)} pagou ${e.cost} por ${cardName(e.objectId)}${e.life ? ` (e ${e.life} de vida)` : ''}.`)
        break
      case 'manualCost': lines.push(`${cardName(e.objectId)}: custo sem dados, pago à mão.`); break
      case 'manaDeclared': lines.push(`${name(e.player)} declarou mana de ${cardName(e.objectId)} (fonte sem automação).`); break
      case 'exceptionRequested': lines.push(`${name(e.player)} pediu uma exceção às regras${e.reason ? `: “${e.reason}”` : ''}.`); break
      case 'exceptionAnswered': lines.push(`${name(e.player)} ${e.approve ? 'aprovou' : 'recusou'} o pedido.`); break
      case 'exceptionCancelled': lines.push(`${name(e.player)} desistiu do pedido de exceção.`); break
      case 'exceptionFailed': lines.push(`O pedido de ${name(e.player)} foi aprovado, mas a ação já não vale: ${e.message}`); break
      case 'judgeAction':
        lines.push(`⚖ Ação de juiz: ${name(e.player)} fez uma jogada fora das regras${e.reason ? ` (“${e.reason}”)` : ''}${e.approvedBy.length ? `, aprovada por ${e.approvedBy.map(name).join(', ')}` : ''}.`)
        break
      default: break
    }
  }
  return lines
}
