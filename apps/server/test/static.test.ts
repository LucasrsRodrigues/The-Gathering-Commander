import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, startServer, type RunningServer } from '../src/server'
import type { Db } from '../src/db'
import { migrate } from '../src/db'
import { openPglite } from '../src/db/pglite'
import { DbRoomStore } from '../src/store'

let dir: string
let server: RunningServer
let db: Db

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'gh-static-'))
  const web = join(dir, 'web')
  mkdirSync(join(web, 'assets'), { recursive: true })
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>app</title>')
  writeFileSync(join(web, 'assets', 'app-123.js'), 'console.log(1)')
  writeFileSync(join(dir, 'secret.txt'), 'do not serve')
  db = await openPglite()
  await migrate(db, join(import.meta.dirname, '..', 'migrations'))
  server = await startServer({ ...DEFAULT_CONFIG, port: 0, allowedOrigins: [], staticDir: web, trustProxy: true }, new DbRoomStore(db))
})

afterAll(async () => {
  await server.close()
  await db.close()
  rmSync(dir, { recursive: true, force: true })
})

// Raw request so the path is sent exactly as written (fetch would normalize "../").
function get(path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.port, path, method, headers }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('same-origin deploy (server also serves the web app)', () => {
  it('serves the app, hashed assets with long cache and SPA fallback', async () => {
    const index = await get('/')
    expect(index.status).toBe(200)
    expect(index.headers['cache-control']).toBe('no-cache')
    expect(index.headers['x-content-type-options']).toBe('nosniff')
    const asset = await get('/assets/app-123.js')
    expect(asset.headers['cache-control']).toContain('immutable')
    expect(asset.headers['content-type']).toContain('javascript')
    expect((await get('/sala/qualquer')).body).toContain('<title>app</title>')
    expect((await get('/assets/missing.js')).status).toBe(404)
  })

  it('never serves files outside the app folder', async () => {
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/%2e%2e/%2e%2e/secret.txt']) {
      const res = await get(path)
      expect(res.body).not.toContain('do not serve')
    }
  })

  it('accepts its own origin (via the proxy headers) and refuses others', async () => {
    const create = (origin: string, host: string) =>
      fetch(`http://127.0.0.1:${server.port}/api/rooms`, { method: 'POST', headers: { Origin: origin, 'X-Forwarded-Host': host, 'X-Forwarded-Proto': 'https' } })
    expect((await create('https://jogo.example.com', 'jogo.example.com')).status).toBe(201)
    expect((await create('https://evil.example', 'jogo.example.com')).status).toBe(403)
  })

  it('sends HSTS only behind HTTPS', async () => {
    expect((await get('/', { 'X-Forwarded-Proto': 'https' })).headers['strict-transport-security']).toBeDefined()
    expect((await get('/')).headers['strict-transport-security']).toBeUndefined()
  })
})
