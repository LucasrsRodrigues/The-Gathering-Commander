import type { Color } from '@gathering-hall/formats'

// Builds the Scryfall query: commander mode looks for legal commanders; deck mode can stay inside
// the commander's color identity (on by default, can be turned off).
export function effectiveQuery(text: string, commanderMode: boolean, identity: Color[] | null, sameIdentity: boolean): string {
  const q = text.trim()
  if (!q) return ''
  if (commanderMode) return `${q} is:commander`
  if (identity && sameIdentity) return `${q} id<=${identity.join('') || 'c'}`
  return q
}
