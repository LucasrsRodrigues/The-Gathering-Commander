// Serves the built web app (apps/web/dist) from the same origin as the API and WebSocket, so a single
// container is enough (e.g. one EasyPanel app). Paths are resolved strictly inside the root folder.

import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
}

export function securityHeaders(res: ServerResponse, https: boolean) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

// Returns true when it answered the request.
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse, https: boolean): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const base = resolve(root)
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  } catch {
    return false
  }
  const candidate = resolve(join(base, normalize(pathname)))
  if (candidate !== base && !candidate.startsWith(base + sep)) return false // path traversal

  let file = candidate
  let size = fileSize(file)
  // Single-page app: unknown paths without an extension fall back to index.html.
  if (size === null && !extname(pathname)) {
    file = join(base, 'index.html')
    size = fileSize(file)
  }
  if (size === null) return false

  securityHeaders(res, https)
  const isIndex = file.endsWith(`${sep}index.html`)
  // Vite puts content hashes in asset names: cache them forever; never cache the HTML entry.
  res.setHeader('Cache-Control', isIndex ? 'no-cache' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
  res.setHeader('Content-Length', size)
  res.writeHead(200)
  if (req.method === 'HEAD') res.end()
  else createReadStream(file).pipe(res)
  return true
}

function fileSize(path: string): number | null {
  try {
    const s = statSync(path)
    return s.isFile() ? s.size : null
  } catch {
    return null
  }
}
