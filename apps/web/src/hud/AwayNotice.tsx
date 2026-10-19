// Online: the game waits on a decision from someone who left the room. Everyone sees who it waits on; the host
// can answer for them with the default answer once they have been away long enough (protocol skip.ts).

import { useEffect, useState } from 'react'
import type { PlayerId, PlayerView } from '@gathering-hall/engine'
import { SKIP_AFTER_MS, waitingOn } from '@gathering-hall/protocol'

export interface AwayControls {
  ms(player: PlayerId): number | null // how long the player has been away; null = connected
  skip?: (player: PlayerId) => void // host only
}

export function AwayNotice({ view, away }: { view: PlayerView; away: AwayControls }) {
  const waited = [...new Set(waitingOn(view).map((w) => w.player))].filter((id) => away.ms(id) !== null)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!waited.length) return
    const timer = setInterval(() => tick((n) => n + 1), 1_000)
    return () => clearInterval(timer)
  }, [waited.length])
  if (!waited.length) return null

  return waited.map((id) => {
    const name = view.players[id]?.name ?? id
    const left = Math.max(0, Math.ceil((SKIP_AFTER_MS - (away.ms(id) ?? 0)) / 1_000))
    return (
      <span key={id} className="net-status away-notice">
        <span role="status">Esperando {name}, que está fora.</span>{' '}
        {away.skip ? (
          <button className="btn tiny" disabled={left > 0} onClick={() => away.skip!(id)}
            title="Responde com o padrão: manter a mão, não atacar nem bloquear, confirmar o dano proposto, descartar as últimas cartas, recusar a exceção ou passar a prioridade.">
            {left > 0 ? `Pular em ${left} s` : `Pular ${name}`}
          </button>
        ) : (
          <span className="muted">{left > 0 ? `Quem criou a sala pode pular em ${left} s.` : 'Quem criou a sala pode pular.'}</span>
        )}
      </span>
    )
  })
}
