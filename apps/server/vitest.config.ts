import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests open in-process Postgres (PGlite) databases; in parallel they need more than the default 5 s.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
