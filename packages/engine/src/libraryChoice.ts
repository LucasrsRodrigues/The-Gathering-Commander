// Answers to a LibraryChoice (épico 11, onda 2): the cards found by a search, or how the top cards were arranged by
// scry or surveil. After the answer, the rest of the ability runs, and the item finishes resolving.

import { continueEffects } from './effects/apply'
import { fail } from './errors'
import { finishResolution } from './turn'
import type { Tx } from './tx'
import type { LibraryChoice, ObjectId, PlayerId } from './types'
import { moveObject, shuffleLibrary } from './zones'

export const isLibraryChoice = (p: { kind: string } | null | undefined): p is LibraryChoice =>
  p?.kind === 'searchLibrary' || p?.kind === 'scry' || p?.kind === 'surveil'

function pendingChoice(tx: Tx, actor: PlayerId, kinds: LibraryChoice['kind'][]): LibraryChoice {
  const p = tx.s.pending
  if (!isLibraryChoice(p) || !kinds.includes(p.kind) || p.player !== actor) fail('notYourDecision', 'Não há essa escolha pendente para você.')
  return p
}

const distinct = (ids: unknown): ids is ObjectId[] =>
  Array.isArray(ids) && ids.length <= 100 && ids.every((id) => typeof id === 'string') && new Set(ids).size === ids.length

// CR 701.19: the cards found (none is always allowed: a search may fail to find), then the library is shuffled.
export function answerSearch(tx: Tx, actor: PlayerId, objectIds: ObjectId[]) {
  const choice = pendingChoice(tx, actor, ['searchLibrary'])
  if (!distinct(objectIds) || objectIds.length > choice.count || !objectIds.every((id) => choice.cards.includes(id))) {
    fail('invalidSelection', `Escolha até ${choice.count} carta(s) entre as que servem.`)
  }
  tx.s.pending = null
  objectIds.forEach((id, i) => {
    const to = choice.to === 'split' ? (i === 0 ? 'battlefield' : 'hand') : choice.to ?? 'hand'
    moveObject(tx, id, to, { controller: actor })
    if (to === 'battlefield' && choice.tapped) {
      tx.object(id).tapped = true
      tx.emit({ type: 'tapped', objectId: id })
    }
  })
  shuffleLibrary(tx, actor)
  resume(tx, choice)
}

// CR 701.18 / 701.25: every card looked at goes back on top (in the order given, top first) or away — to the bottom
// for scry, to the graveyard for surveil.
export function answerArrange(tx: Tx, actor: PlayerId, top: ObjectId[], away: ObjectId[]) {
  const choice = pendingChoice(tx, actor, ['scry', 'surveil'])
  const all = [...(Array.isArray(top) ? top : []), ...(Array.isArray(away) ? away : [])]
  if (!distinct(top) || !distinct(away) || all.length !== choice.cards.length || !choice.cards.every((id) => all.includes(id))) {
    fail('invalidSelection', 'Ponha cada carta olhada no topo ou fora dele.')
  }
  tx.s.pending = null
  const library = tx.zone(actor, 'library')
  library.splice(library.length - choice.cards.length, choice.cards.length) // the cards looked at leave the top…
  for (const id of away) {
    if (choice.kind === 'scry') library.unshift(id) // …the bottom (index 0 is the bottom)
    else {
      library.push(id) // back on top for a moment, so moveObject takes it from the library
      moveObject(tx, id, 'graveyard')
    }
  }
  for (const id of [...top].reverse()) library.push(id) // …and the rest back on top, the first one last
  tx.emit({ type: 'libraryArranged', player: actor, top: top.length, away: away.length, kind: choice.kind === 'scry' ? 'scry' : 'surveil' })
  resume(tx, choice)
}

function resume(tx: Tx, choice: LibraryChoice) {
  if (continueEffects(tx, choice)) return // another choice: the item keeps waiting
  const top = tx.s.stack[tx.s.stack.length - 1]
  if (top?.id === choice.continueWith.itemId) finishResolution(tx, top)
}
