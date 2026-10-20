// Architectural fitness functions for packages/engine (see .specs/00-visao-geral/design.md).

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
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
      for (const spec of imports) {
        // Relative and inside src/ (subfolders such as effects/ may reach their siblings with ../).
        const inside = spec.startsWith('./') || (spec.startsWith('../') && !normalize(join(dirname(name), spec)).startsWith('..'))
        expect(inside, `${name} importa ${spec}`).toBe(true)
      }
    }
  })

  it('never branches on card names (rules come from data, not hard-coded cards)', () => {
    for (const { name, code } of files) {
      expect(/\.name\s*(===|!==|==|!=)|name\.(includes|startsWith|endsWith)\(/.test(code), name).toBe(false)
    }
  })

  it('keeps the Oracle parser out of the rules core (only index.ts re-exports it; oracle/ belongs to the reader)', () => {
    for (const { name, code } of files) {
      if (name === 'index.ts' || name === 'deriveRules.ts' || name.startsWith('oracle/')) continue // oracle/ is the reader too
      expect(/from\s+['"](\.\.?\/)+deriveRules['"]/.test(code), name).toBe(false)
    }
  })

  it('keeps the sentence patterns inside the reader (only deriveRules.ts imports oracle/)', () => {
    for (const { name, code } of files) {
      if (name === 'deriveRules.ts' || name.startsWith('oracle/')) continue
      expect(/from\s+['"](\.\.?\/)+oracle\//.test(code), name).toBe(false)
    }
  })

  it('has no hidden sources of nondeterminism', () => {
    for (const { name, code } of files) {
      expect(/Math\.random|Date\.now|new Date\(|performance\.now/.test(code), name).toBe(false)
    }
  })
})
