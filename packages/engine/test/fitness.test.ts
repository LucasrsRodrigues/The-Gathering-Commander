// Architectural fitness functions for packages/engine (see .specs/00-visao-geral/design.md).

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')
const files = readdirSync(SRC, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, code: readFileSync(join(SRC, f), 'utf8') }))

describe('engine fitness functions', () => {
  it('imports only its own modules (no UI, network, node or third-party code)', () => {
    for (const { name, code } of files) {
      const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
      for (const spec of imports) expect(spec.startsWith('./'), `${name} importa ${spec}`).toBe(true)
    }
  })

  it('never branches on card names (rules come from data, not hard-coded cards)', () => {
    for (const { name, code } of files) {
      expect(/\.name\s*(===|!==|==|!=)|name\.(includes|startsWith|endsWith)\(/.test(code), name).toBe(false)
    }
  })

  it('has no hidden sources of nondeterminism', () => {
    for (const { name, code } of files) {
      expect(/Math\.random|Date\.now|new Date\(|performance\.now/.test(code), name).toBe(false)
    }
  })
})
