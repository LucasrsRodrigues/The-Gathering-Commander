// Fitness (épico 08, T8.11): nothing secret ever reaches the browser. The app code, the packages it bundles and the
// built files are scanned for server-only configuration, and the only build-time variable is the server's address.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const CLIENT_DIRS = ['apps/web/src', 'packages/engine/src', 'packages/formats/src', 'packages/protocol/src']
const SERVER_ONLY = /\b(SESSION_SECRET|CLIENT_SECRET|client_secret|DATABASE_URL|TEST_DATABASE_URL|DISCORD_CLIENT_ID|GOOGLE_CLIENT_ID)\b/

function sources(dir: string) {
  const abs = join(ROOT, dir)
  return readdirSync(abs, { recursive: true }).map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => ({ name: `${dir}/${f}`, code: readFileSync(join(abs, f), 'utf8') }))
}

const files = CLIENT_DIRS.flatMap(sources)

describe('no secrets in the client', () => {
  it('client code never names server-only settings nor reads process.env', () => {
    for (const { name, code } of files) {
      expect(SERVER_ONLY.test(code), `${name} cita configuração do servidor`).toBe(false)
      expect(/process\.env/.test(code), `${name} lê process.env`).toBe(false)
    }
  })

  it('the only build-time variable is the public server address', () => {
    const used = new Set(files.flatMap(({ code }) => [...code.matchAll(/import\.meta\.env\.(\w+)/g)].map((m) => m[1])))
    expect([...used]).toEqual(['VITE_SERVER_URL'])
  })

  it('client code never imports the server', () => {
    for (const { name, code } of files) {
      expect(/from\s+['"][^'"]*apps\/server|@gathering-hall\/server/.test(code), name).toBe(false)
    }
  })

  it('the built app carries none of it either (when built)', () => {
    const dist = join(ROOT, 'apps/web/dist')
    if (!existsSync(dist)) return
    for (const f of readdirSync(dist, { recursive: true }).map(String).filter((x) => /\.(js|html)$/.test(x))) {
      expect(SERVER_ONLY.test(readFileSync(join(dist, f), 'utf8')), f).toBe(false)
    }
  })
})
