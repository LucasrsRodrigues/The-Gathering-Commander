// Outbound host allowlist. The app only talks to Scryfall: its API and its image CDN.
// Any URL that comes from a response or from the local cache is checked here before use,
// so a tampered cache or response cannot point an <img> or texture at another origin.
// Keep in sync with the Content-Security-Policy in index.html.

export const API_HOST = 'api.scryfall.com'
export const IMAGE_HOST = 'cards.scryfall.io'

function parse(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isAllowed(value: unknown, host: string): boolean {
  const url = parse(value)
  return !!url && url.protocol === 'https:' && url.hostname === host && url.port === '' && !url.username && !url.password
}

export function isApiUrl(value: unknown): value is string {
  return isAllowed(value, API_HOST)
}

export function isImageUrl(value: unknown): value is string {
  return isAllowed(value, IMAGE_HOST)
}
