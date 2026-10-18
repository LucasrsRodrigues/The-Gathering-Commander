import { useCallback, useEffect, useMemo, useState } from 'react'
import { generateBoard, layoutBoard, type Board } from './bench/board'
import { loadPool, type PoolCard, type PoolSource } from './bench/cardPool'
import { Hud, type BenchResult, type RendererKind } from './bench/Hud'
import { Hand, Preview } from './bench/Overlays'
import type { BenchOptions } from './bench/types'
import { DomTable } from './render-dom/DomTable'
import { ThreeTable } from './render-three/ThreeTable'

const SEED = 7
const STRESS_INTERVAL_MS = 300
const STRESS_FLIPS = 10

function initialRenderer(): RendererKind {
  return location.hash === '#three' ? 'three' : 'dom'
}

export default function App() {
  const [pool, setPool] = useState<PoolCard[] | null>(null)
  const [source, setSource] = useState<PoolSource | null>(null)
  const [renderer, setRendererState] = useState<RendererKind>(initialRenderer)
  const [perPlayer, setPerPlayer] = useState(30)
  const [opts, setOpts] = useState<BenchOptions>({ stress: false, effects: true, hd: false })
  const [board, setBoard] = useState<Board | null>(null)
  const [results, setResults] = useState<BenchResult[]>([])
  const [resetCount, setResetCount] = useState(0)

  useEffect(() => {
    loadPool().then(({ cards, source }) => {
      setPool(cards)
      setSource(source)
    })
  }, [])

  useEffect(() => {
    if (pool) setBoard(generateBoard(pool, perPlayer, SEED + resetCount))
  }, [pool, perPlayer, resetCount])

  useEffect(() => {
    if (!opts.stress) return
    const t = setInterval(() => {
      setBoard((b) => {
        if (!b) return b
        const perms = b.perms.slice()
        for (let i = 0; i < STRESS_FLIPS; i++) {
          const k = Math.floor(Math.random() * perms.length)
          perms[k] = { ...perms[k], tapped: !perms[k].tapped }
        }
        return { ...b, perms }
      })
    }, STRESS_INTERVAL_MS)
    return () => clearInterval(t)
  }, [opts.stress])

  const setRenderer = (r: RendererKind) => {
    history.replaceState(null, '', r === 'three' ? '#three' : '#dom')
    setRendererState(r)
  }

  const onTap = useCallback((id: string) => {
    setBoard((b) => b && { ...b, perms: b.perms.map((p) => (p.id === id ? { ...p, tapped: !p.tapped } : p)) })
  }, [])

  const onMove = useCallback((id: string, x: number, z: number) => {
    setBoard((b) => b && { ...b, perms: b.perms.map((p) => (p.id === id ? { ...p, pos: { x, z } } : p)) })
  }, [])

  const onPlay = useCallback(
    (handIdx: number) => {
      setBoard((b) => {
        if (!b || !pool) return b
        const poolIdx = b.hand[handIdx]
        const played = {
          id: `h${Date.now()}`, owner: 0, poolIdx, kind: pool[poolIdx].kind,
          tapped: false, commander: false, enteredAt: Date.now(),
        }
        return { perms: [...b.perms, played], hand: b.hand.filter((_, i) => i !== handIdx) }
      })
    },
    [pool],
  )

  const layout = useMemo(() => (board ? layoutBoard(board.perms) : new Map()), [board])

  // Fake "playable" highlights on part of the local board, like Arena's glowing borders.
  const glowIds = useMemo(() => {
    const ids = new Set<string>()
    board?.perms.forEach((p, i) => {
      if (p.owner === 0 && p.kind !== 'land' && !p.tapped && (p.commander || i % 3 === 0)) ids.add(p.id)
    })
    return ids
  }, [board])

  if (!pool || !board) return <div className="loading">Carregando cartas do Scryfall…</div>

  const tableProps = { pool, board, layout, glowIds, opts, onTap, onMove }
  const handCards = board.hand.map((i) => ({ url: pool[i].img.normal, preview: pool[i].img.large }))

  return (
    <main className="app">
      {renderer === 'dom' ? <DomTable {...tableProps} /> : <ThreeTable {...tableProps} />}
      <Hand cards={handCards} onPlay={onPlay} />
      <Preview />
      <Hud
        renderer={renderer}
        setRenderer={setRenderer}
        perPlayer={perPlayer}
        setPerPlayer={setPerPlayer}
        opts={opts}
        setOpts={setOpts}
        totalCards={board.perms.length}
        source={source}
        onReset={() => setResetCount((n) => n + 1)}
        results={results}
        addResult={(r) => setResults((rs) => [...rs, r])}
      />
    </main>
  )
}
