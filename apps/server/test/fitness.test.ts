// Architectural fitness (épico 08): the room core stays pure and synchronous. The database, the catalog store and the
// network live in server.ts; the room only sees messages, deps and data prepared for it.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOM = join(import.meta.dirname, '..', 'src', 'room')
const ALLOWED = [/^@gathering-hall\/(engine|formats|protocol)$/, /^\.\/[a-z]+$/]

describe('room core fitness', () => {
  it('imports no database, store, network or Node module', () => {
    for (const file of readdirSync(ROOM).filter((f) => f.endsWith('.ts'))) {
      const code = readFileSync(join(ROOM, file), 'utf8')
      for (const [, spec] of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        expect(ALLOWED.some((re) => re.test(spec!)), `${file} importa ${spec}`).toBe(true)
      }
      expect(/\bawait\b|\basync\b/.test(code), `${file} tem código assíncrono`).toBe(false)
    }
  })
})
