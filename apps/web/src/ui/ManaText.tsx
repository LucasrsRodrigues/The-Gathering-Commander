// Rules text with its symbols drawn ({T}, {G}, {2}, {W/U}, {G/P}…), using Scryfall's symbol images, loaded at run
// time like the card images. The symbol code is checked before it becomes a URL; anything unknown stays as text.

import { Fragment } from 'react'
import { symbolUrl } from './manaSymbols'

const NAMES: Record<string, string> = {
  T: 'virar', Q: 'desvirar', W: 'branco', U: 'azul', B: 'preto', R: 'vermelho', G: 'verde', C: 'incolor', S: 'neve', X: 'X', E: 'energia',
}
const label = (code: string) => NAMES[code.toUpperCase()] ?? code

export function ManaSymbol({ code }: { code: string }) {
  const src = symbolUrl(code)
  if (!src) return <>{`{${code}}`}</>
  return <img className="mana-sym" src={src} alt={`{${code}}`} title={label(code)} width={16} height={16} decoding="async" draggable={false} />
}

// Splits on {…}; plain text stays text (React escapes it), symbols become images.
export function ManaText({ text }: { text: string }) {
  const parts = text.split(/(\{[^{}]{1,7}\})/g)
  return <>{parts.map((p, i) => {
    const m = /^\{([^{}]{1,7})\}$/.exec(p)
    return m ? <ManaSymbol key={i} code={m[1]!} /> : <Fragment key={i}>{p}</Fragment>
  })}</>
}
