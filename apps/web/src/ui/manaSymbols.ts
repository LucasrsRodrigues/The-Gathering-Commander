// Mana symbol URLs (Scryfall's symbol images). The code is checked before it becomes a URL.

import { SYMBOL_HOST } from '../catalog/hosts'

const CODE = /^(?:[WUBRGCXYZSTQEP]|\d{1,2}|½|∞|[WUBRG2C]\/[WUBRGP]|[WUBRG]\/[WUBRG]\/P)$/i

export function symbolUrl(code: string): string | null {
  if (!CODE.test(code)) return null
  const file = code.toUpperCase().replace(/\//g, '').replace('½', 'HALF').replace('∞', 'INFINITY')
  return `https://${SYMBOL_HOST}/card-symbols/${encodeURIComponent(file)}.svg`
}
