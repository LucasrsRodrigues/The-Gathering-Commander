// Variant A: plain DOM cards on a CSS-3D tilted table. Transforms only, so the
// browser can composite on the GPU; dragging writes CSS vars directly to skip React.

import { memo, useEffect, useRef, useState } from 'react'
import { PLATES, TABLE } from '../bench/board'
import { previewStore } from '../bench/stores'
import { DRAG_THRESHOLD_PX, LONG_PRESS_MS, type TableProps } from '../bench/types'
import './dom.css'

const TILT_DEG = 38
const COS_TILT = Math.cos((TILT_DEG * Math.PI) / 180)

export function DomTable({ pool, board, layout, glowIds, opts, onTap, onMove }: TableProps) {
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1200, h: 800 })

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Pixels per table unit; the tilted table must fit both axes.
  const s = Math.min(size.w / TABLE.W, size.h / (TABLE.D * COS_TILT * 1.08)) * 0.9
  const toPx = (x: number, z: number) => ({ left: (x + TABLE.W / 2) * s, top: (z + TABLE.D / 2) * s })

  return (
    <div className="dom-stage" ref={stage}>
      <div
        className={`dom-table${opts.effects ? ' fx' : ''}`}
        style={{ width: TABLE.W * s, height: TABLE.D * s, transform: `translate(-50%, -50%) rotateX(${TILT_DEG}deg)` }}
      >
        {PLATES.map((p) => {
          const { left, top } = toPx(p.x - p.w / 2, p.z - p.d / 2)
          return <div key={p.owner} className={`plate${p.owner === 0 ? ' mine' : ''}`} style={{ left, top, width: p.w * s, height: p.d * s }} />
        })}
        {board.perms.map((p) => {
          const at = layout.get(p.id)
          if (!at) return null
          const card = pool[p.poolIdx]
          const { left, top } = toPx(at.x, at.z)
          return (
            <DomCard
              key={p.id}
              id={p.id}
              url={opts.hd ? card.img.normal : card.img.small}
              preview={card.img.large}
              left={left}
              top={top}
              w={TABLE.CW * at.scale * s}
              h={TABLE.CH * at.scale * s}
              layer={at.layer}
              tapped={p.tapped}
              glow={opts.effects && glowIds.has(p.id)}
              entering={!!p.enteredAt}
              pxPerUnit={s}
              onTap={onTap}
              onMove={onMove}
            />
          )
        })}
      </div>
    </div>
  )
}

interface DomCardProps {
  id: string
  url: string
  preview: string
  left: number
  top: number
  w: number
  h: number
  layer: number
  tapped: boolean
  glow: boolean
  entering: boolean
  pxPerUnit: number
  onTap: (id: string) => void
  onMove: (id: string, x: number, z: number) => void
}

const DomCard = memo(function DomCard(props: DomCardProps) {
  const { id, url, preview, left, top, w, h, layer, tapped, glow, entering, pxPerUnit, onTap, onMove } = props
  const el = useRef<HTMLDivElement>(null)
  const gesture = useRef({ active: false, moved: false, longPressed: false, sx: 0, sy: 0, timer: 0 })

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const g = gesture.current
    Object.assign(g, { active: true, moved: false, longPressed: false, sx: e.clientX, sy: e.clientY })
    if (e.pointerType !== 'mouse') {
      g.timer = window.setTimeout(() => {
        g.longPressed = true
        previewStore.set(preview)
      }, LONG_PRESS_MS)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current
    if (!g.active) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    if (!g.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      g.moved = true
      clearTimeout(g.timer)
      el.current?.classList.add('dragging')
    }
    // Screen-to-table is approximate: the y delta is stretched back by the tilt.
    if (g.moved) el.current?.style.setProperty('--drag', `${dx}px, ${dy / COS_TILT}px`)
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current
    if (!g.active) return
    g.active = false
    clearTimeout(g.timer)
    if (g.longPressed) previewStore.set(null)
    if (g.moved) {
      el.current?.classList.remove('dragging')
      el.current?.style.removeProperty('--drag')
      const dx = (e.clientX - g.sx) / pxPerUnit
      const dz = (e.clientY - g.sy) / COS_TILT / pxPerUnit
      onMove(id, left / pxPerUnit - TABLE.W / 2 + dx, top / pxPerUnit - TABLE.D / 2 + dz)
    } else if (!g.longPressed) {
      onTap(id)
    }
  }

  return (
    <div
      ref={el}
      className={`dom-card${tapped ? ' tapped' : ''}${glow ? ' glow' : ''}${entering ? ' entering' : ''}`}
      style={{
        width: w,
        height: h,
        zIndex: layer,
        '--x': `${left - w / 2}px`,
        '--y': `${top - h / 2}px`,
      } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={(e) => e.pointerType === 'mouse' && previewStore.set(preview)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && previewStore.set(null)}
    >
      <div className="face" style={{ backgroundImage: `url(${url})` }} />
    </div>
  )
})
