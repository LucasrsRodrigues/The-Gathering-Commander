// Combat panels (épico 09, T9.16): declare attackers, declare blockers, confirm damage. DOM first; arrows on the 3D
// table can come later. Out-of-rules choices go to the engine and come back as the rules dialog with its exception.

import { useState } from 'react'
import type { DamageAssignment, PlayerId, PlayerView } from '@gathering-hall/engine'
import { attackOptions, blockOptions, damagePreview, pt } from './combatOptions'
import type { Dispatch } from './PlayerPanels'

export function CombatPanel({ view, seat, dispatch }: { view: PlayerView; seat: PlayerId; dispatch: Dispatch }) {
  const pending = view.pending
  if (!pending) return null
  const name = (id: PlayerId) => view.players[id]?.name ?? id
  if (pending.kind === 'declareAttackers') {
    return pending.player === seat
      ? <AttackPanel key={view.turn.number} view={view} seat={seat} dispatch={dispatch} />
      : <Waiting text={`${name(pending.player)} está declarando atacantes…`} />
  }
  if (pending.kind === 'declareBlockers') {
    return pending.players.includes(seat)
      ? <BlockPanel key={view.turn.number} view={view} seat={seat} dispatch={dispatch} />
      : <Waiting text={`Esperando bloqueios: ${pending.players.map(name).join(', ')}…`} />
  }
  if (pending.kind === 'confirmDamage') {
    return pending.player === seat
      ? <DamagePanel key={`${view.turn.number}-${pending.proposal.phase}`} view={view} assignments={pending.proposal.assignments} first={pending.proposal.phase === 'first'} dispatch={dispatch} />
      : <Waiting text={`${name(pending.player)} está confirmando o dano de combate…`} />
  }
  return null
}

function Waiting({ text }: { text: string }) {
  return <div className="combat-panel" role="status"><p className="muted">{text}</p></div>
}

function AttackPanel({ view, seat, dispatch }: { view: PlayerView; seat: PlayerId; dispatch: Dispatch }) {
  const { creatures, targets } = attackOptions(view, seat)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const attacks = Object.entries(chosen).filter(([, t]) => t).map(([attacker, target]) => ({ attacker, target }))
  const allAt = (target: string) => setChosen(Object.fromEntries(creatures.filter((c) => !c.summoningSick).map((c) => [c.id, target])))

  return (
    <div className="combat-panel" role="dialog" aria-label="Declarar atacantes">
      <h3>Atacar</h3>
      <ul className="combat-rows">
        {creatures.map((c) => (
          <li key={c.id}>
            <span>{c.card?.name ?? 'Criatura'} <b>{pt(c)}</b>{c.summoningSick && <span className="muted small"> · acabou de chegar</span>}</span>
            <select aria-label={`Alvo de ${c.card?.name ?? 'criatura'}`} value={chosen[c.id] ?? ''}
              onChange={(e) => setChosen({ ...chosen, [c.id]: e.target.value })}>
              <option value="">Não ataca</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <div className="row">
        {targets.length === 1 && <button className="btn" onClick={() => allAt(targets[0]!.id)}>Todos em {targets[0]!.label}</button>}
        <button className="btn" onClick={() => dispatch({ type: 'declareAttackers', attacks: [] })}>Sem ataque</button>
        <button className="btn primary" disabled={!attacks.length} onClick={() => dispatch({ type: 'declareAttackers', attacks })}>
          Atacar{attacks.length ? ` (${attacks.length})` : ''}
        </button>
      </div>
    </div>
  )
}

function BlockPanel({ view, seat, dispatch }: { view: PlayerView; seat: PlayerId; dispatch: Dispatch }) {
  const { attackers, blockers } = blockOptions(view, seat)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const blocks = Object.entries(chosen).filter(([, a]) => a).map(([blocker, attacker]) => ({ blocker, attacker }))

  return (
    <div className="combat-panel" role="dialog" aria-label="Declarar bloqueadores">
      <h3>Você está sendo atacado</h3>
      <ul className="combat-rows small">{attackers.map((a) => <li key={a.id}>{a.label}</li>)}</ul>
      <ul className="combat-rows">
        {blockers.map((b) => (
          <li key={b.id}>
            <span>{b.card?.name ?? 'Criatura'} <b>{pt(b)}</b></span>
            <select aria-label={`Quem ${b.card?.name ?? 'criatura'} bloqueia`} value={chosen[b.id] ?? ''}
              onChange={(e) => setChosen({ ...chosen, [b.id]: e.target.value })}>
              <option value="">Não bloqueia</option>
              {attackers.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" onClick={() => dispatch({ type: 'declareBlockers', blocks: [] })}>Sem bloqueio</button>
        <button className="btn primary" disabled={!blocks.length} onClick={() => dispatch({ type: 'declareBlockers', blocks })}>
          Bloquear{blocks.length ? ` (${blocks.length})` : ''}
        </button>
      </div>
    </div>
  )
}

function DamagePanel({ view, assignments: proposed, first, dispatch }: {
  view: PlayerView; assignments: DamageAssignment[]; first: boolean; dispatch: Dispatch
}) {
  const [assignments, setAssignments] = useState(proposed)
  const preview = damagePreview(view, assignments)
  const label = (id: string) => view.players[id]?.name ?? view.objects[id]?.card?.name ?? '?'
  const sources = [...new Set(assignments.map((a) => a.source))]
  const move = (index: number, delta: number) =>
    setAssignments(assignments.map((a, i) => (i === index ? { ...a, amount: Math.max(0, a.amount + delta) } : a)))

  return (
    <div className="combat-panel" role="dialog" aria-label="Confirmar dano de combate">
      <h3>{first ? 'Dano de First strike' : 'Dano de combate'}</h3>
      <ul className="combat-rows">
        {sources.map((source) => {
          const rows = assignments.map((a, i) => ({ a, i })).filter(({ a }) => a.source === source)
          const adjustable = rows.length > 1
          return (
            <li key={source} className="damage-source">
              <span>{label(source)}</span>
              {rows.map(({ a, i }) => (
                <span key={a.to} className="damage-row">
                  → {label(a.to)} <b>{a.amount}</b>
                  {adjustable && <>
                    <button className="step-btn" aria-label={`Menos dano em ${label(a.to)}`} onClick={() => move(i, -1)}>−</button>
                    <button className="step-btn" aria-label={`Mais dano em ${label(a.to)}`} onClick={() => move(i, 1)}>+</button>
                  </>}
                </span>
              ))}
            </li>
          )
        })}
      </ul>
      <div className="damage-preview" aria-live="polite">
        {preview.dies.length > 0 && <p>Morrem: {preview.dies.join(', ')}</p>}
        {preview.life.map((l) => <p key={l.player}>{l.name}: {l.delta > 0 ? `+${l.delta}` : l.delta} de vida</p>)}
        {preview.commander.map((c) => <p key={`${c.player}-${c.source}`}>{c.name}: {c.total} de dano de comandante de {c.source}</p>)}
      </div>
      <div className="row">
        {assignments !== proposed && <button className="btn" onClick={() => setAssignments(proposed)}>Voltar à proposta</button>}
        <button className="btn primary" autoFocus onClick={() => dispatch({ type: 'assignDamage', assignments })}>Confirmar dano</button>
      </div>
    </div>
  )
}
