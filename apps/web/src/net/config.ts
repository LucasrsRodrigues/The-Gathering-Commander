// Where the online server lives. Set VITE_SERVER_URL at build time (see .env.example / DEPLOY.md);
// the Content-Security-Policy in index.html uses the same variables.

const raw = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:8787'

export const SERVER_HTTP = raw.replace(/\/+$/, '')
export const SERVER_WS = SERVER_HTTP.replace(/^http/, 'ws')

export const ROOM_HASH = /^#\/sala\/([A-Za-z0-9_-]{22})$/

export function roomLink(roomId: string): string {
  return `${location.origin}${location.pathname}#/sala/${roomId}`
}
