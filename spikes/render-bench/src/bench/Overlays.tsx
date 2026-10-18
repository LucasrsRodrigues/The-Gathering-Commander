// DOM overlays shared by both renderers: the local hand and the big card preview.

import { previewStore, useStore } from './stores'

export function Hand({ cards, onPlay }: { cards: { url: string; preview: string }[]; onPlay: (i: number) => void }) {
  const mid = (cards.length - 1) / 2
  return (
    <div className="hand" aria-label="Sua mão">
      {cards.map((c, i) => (
        <button
          key={i}
          className="hand-card"
          style={{
            backgroundImage: `url(${c.url})`,
            transform: `translateY(${Math.abs(i - mid) * 7}px) rotate(${(i - mid) * 5}deg)`,
          }}
          onPointerEnter={(e) => e.pointerType === 'mouse' && previewStore.set(c.preview)}
          onPointerLeave={() => previewStore.set(null)}
          onClick={() => {
            previewStore.set(null)
            onPlay(i)
          }}
          aria-label="Jogar carta"
        />
      ))}
    </div>
  )
}

export function Preview() {
  const url = useStore(previewStore)
  if (!url) return null
  return <img className="preview" src={url} alt="" />
}
