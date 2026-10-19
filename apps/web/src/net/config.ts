// Where the online server lives. In development it is a separate process (apps/web/.env); in the
// single-container deploy (Dockerfile, EasyPanel) VITE_SERVER_URL is empty and the app talks to its
// own origin. The Content-Security-Policy in index.html uses the same variables.

const raw = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? ''

export const SERVER_HTTP = (raw || location.origin).replace(/\/+$/, '')
export const SERVER_WS = SERVER_HTTP.replace(/^http/, 'ws')

export const ROOM_HASH = /^#\/sala\/([A-Za-z0-9_-]{22})$/

export function roomLink(roomId: string): string {
  return `${location.origin}${location.pathname}#/sala/${roomId}`
}
