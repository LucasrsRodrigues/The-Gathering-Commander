// Fitness functions for packages/formats: pure, and rules never key off specific card names.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')
const files = readdirSync(SRC, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, code: readFileSync(join(SRC, f), 'utf8') }))

describe('formats fitness functions', () => {
  it('imports only its own modules and the engine', () => {
    for (const { name, code } of files) {
      for (const [, spec] of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        expect(spec!.startsWith('./') || spec!.startsWith('../') || spec === '@gathering-hall/engine', `${name} importa ${spec}`).toBe(true)
      }
    }
  })

  it('never compares against hard-coded card names', () => {
    for (const { name, code } of files) {
      expect(/\.name\s*(===|!==|==|!=)\s*['"`]|['"`]\s*(===|!==)\s*\w+\.name\b/.test(code), name).toBe(false)
    }
  })

  it('has no network or nondeterminism', () => {
    for (const { name, code } of files) {
      expect(/\bfetch\(|XMLHttpRequest|Math\.random|Date\.now|new Date\(/.test(code), name).toBe(false)
    }
  })
})
