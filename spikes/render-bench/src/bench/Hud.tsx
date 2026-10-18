import { useEffect, useRef, useState } from 'react'
import type { PoolSource } from './cardPool'
import { PLAYERS } from './board'
import { fpsSampler, renderStatsStore, useStore } from './stores'
import type { BenchOptions } from './types'

export type RendererKind = 'dom' | 'three'

export interface BenchResult {
  renderer: RendererKind
  perPlayer: number
  cards: number
  fps: number
  low: number
  effects: boolean
  hd: boolean
}

interface HudProps {
  renderer: RendererKind
  setRenderer: (r: RendererKind) => void
  perPlayer: number
  setPerPlayer: (n: number) => void
  opts: BenchOptions
  setOpts: (o: BenchOptions) => void
  totalCards: number
  source: PoolSource | null
  onReset: () => void
  results: BenchResult[]
  addResult: (r: BenchResult) => void
}

const BENCH_STEPS = [20, 40, 60, 80]
const WARMUP_MS = 1500
const MEASURE_MS = 3500
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function Hud(props: HudProps) {
  const { renderer, setRenderer, perPlayer, setPerPlayer, opts, setOpts, totalCards, source, onReset, results } = props
  const [live, setLive] = useState({ fps: 0, low: 0 })
  const [running, setRunning] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const stats = useStore(renderStatsStore)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  useEffect(() => {
    fpsSampler.start()
    const t = setInterval(() => setLive(fpsSampler.stats(2000)), 500)
    return () => clearInterval(t)
  }, [])

  async function runBenchmark() {
    const before = { perPlayer, opts }
    latest.current.setOpts({ ...opts, stress: true })
    for (const n of BENCH_STEPS) {
      setRunning(`${n}/jogador: aquecendo`)
      latest.current.setPerPlayer(n)
      await sleep(WARMUP_MS)
      setRunning(`${n}/jogador: medindo`)
      const mark = performance.now()
      await sleep(MEASURE_MS)
      const s = fpsSampler.stats(performance.now() - mark)
      latest.current.addResult({
        renderer: latest.current.renderer,
        perPlayer: n,
        cards: n * PLAYERS,
        fps: s.fps,
        low: s.low,
        effects: opts.effects,
        hd: opts.hd,
      })
    }
    setRunning(null)
    latest.current.setPerPlayer(before.perPlayer)
    latest.current.setOpts(before.opts)
  }

  const toggle = (key: keyof BenchOptions) => setOpts({ ...opts, [key]: !opts[key] })

  return (
    <aside className={`hud ${open ? '' : 'collapsed'}`}>
      <div className="hud-head">
        <strong className={live.fps < 45 ? 'fps bad' : 'fps'}>{live.fps.toFixed(0)} fps</strong>
        <span className="muted">1% low {live.low.toFixed(0)}</span>
        <button className="link" onClick={() => setOpen(!open)}>{open ? 'Ocultar' : 'Mostrar'}</button>
      </div>
      {open && (
        <>
          <div className="seg" role="group" aria-label="Renderizador">
            <button aria-pressed={renderer === 'dom'} onClick={() => setRenderer('dom')}>DOM / CSS 3D</button>
            <button aria-pressed={renderer === 'three'} onClick={() => setRenderer('three')}>Three.js</button>
          </div>
          <label className="row">
            <span>Permanentes por jogador: <b>{perPlayer}</b></span>
            <input type="range" min={10} max={80} step={5} value={perPlayer} disabled={!!running}
              onChange={(e) => setPerPlayer(Number(e.target.value))} />
          </label>
          <div className="muted">
            {totalCards} cartas na mesa
            {renderer === 'three' && stats && ` · ${stats.calls} draw calls`}
            {source && ` · imagens: ${source}`}
          </div>
          <label className="check"><input type="checkbox" checked={opts.stress} onChange={() => toggle('stress')} /> Estresse (virar cartas sem parar)</label>
          <label className="check"><input type="checkbox" checked={opts.effects} onChange={() => toggle('effects')} /> Efeitos (brilho de jogável, sombras)</label>
          <label className="check"><input type="checkbox" checked={opts.hd} onChange={() => toggle('hd')} /> Texturas HD (488px)</label>
          <div className="actions">
            <button onClick={runBenchmark} disabled={!!running}>{running ?? 'Rodar benchmark (~20s)'}</button>
            <button onClick={onReset} disabled={!!running}>Reiniciar mesa</button>
          </div>
          {results.length > 0 && (
            <table className="results">
              <thead><tr><th>Render</th><th>Cartas</th><th>FPS</th><th>1% low</th><th>Efeitos</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.renderer === 'dom' ? 'DOM' : 'Three'}</td>
                    <td>{r.cards}</td>
                    <td className={r.fps < 45 ? 'bad' : ''}>{r.fps.toFixed(0)}</td>
                    <td className={r.low < 30 ? 'bad' : ''}>{r.low.toFixed(0)}</td>
                    <td>{r.effects ? 'sim' : 'não'}{r.hd ? ' · HD' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint">Mouse: passar por cima amplia, clique vira, arraste move. Toque: segurar amplia.</p>
        </>
      )}
    </aside>
  )
}
