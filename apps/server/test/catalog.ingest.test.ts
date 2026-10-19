import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadHistory, parseHistory } from '../src/catalog/history'
import { runCatalogImport, type IngestDeps } from '../src/catalog/ingest'
import type { BulkCard } from '../src/catalog/normalize'
import { SqliteCatalogStore } from '../src/catalog/store'
import { artSeries, manaCrypt, rhystic, solRing } from './catalog.fixtures'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

function fakeScryfall(days: { updatedAt: string; cards: BulkCard[] }[]) {
  let day = 0
  const fetchFn = vi.fn(async (url: string) => {
    const current = days[Math.min(day, days.length - 1)]!
    if (url.startsWith('https://api.scryfall.com/bulk-data/')) {
      return new Response(JSON.stringify({ updated_at: current.updatedAt, jsonl_download_uri: `https://data.scryfall.io/oracle-cards/${current.updatedAt}.jsonl.gz` }))
    }
    const body = current.cards.map((c) => JSON.stringify(c)).join('\n') + '\n{broken json\n'
    return new Response(gzipSync(body))
  })
  return { fetchFn, nextDay: () => day++ }
}

function setup(days: Parameters<typeof fakeScryfall>[0], history: IngestDeps['history'] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'gh-catalog-'))
  const store = new SqliteCatalogStore(join(dir, 'catalog.db'))
  cleanup.push(() => store.close(), () => rmSync(dir, { recursive: true, force: true }))
  const api = fakeScryfall(days)
  const deps: IngestDeps = { fetchFn: api.fetchFn as never, rawDir: join(dir, 'raw'), now: () => new Date('2026-10-19T12:00:00Z'), keepRaw: 2, history }
  return { store, deps, api, dir }
}

describe('catalog import', () => {
  it('imports, skips when the bulk did not change, then records only real changes', async () => {
    const { store, deps, api } = setup([
      { updatedAt: '2026-10-01T09:00:00Z', cards: [solRing, manaCrypt, rhystic, artSeries] },
      { updatedAt: '2026-11-01T09:00:00Z', cards: [solRing, { ...manaCrypt, legalities: { commander: 'legal' } }, rhystic] },
    ])
    expect(await runCatalogImport(store, deps)).toMatchObject({ status: 'ok', cards: 3 })
    expect(await runCatalogImport(store, deps)).toMatchObject({ status: 'skipped' })
    // A catalog stored in an older card format is re-imported even when the bulk did not change.
    store.setCardFormat(1)
    expect(await runCatalogImport(store, deps)).toMatchObject({ status: 'ok', changes: 0 })
    expect(store.resolveNames(['Sol Ring']).get('sol ring')).toMatchObject({ mana_cost: '{1}' })
    api.nextDay()
    expect(await runCatalogImport(store, deps)).toMatchObject({ status: 'ok', changes: 1 })
    expect(store.commanderAt('2026-10-15').banned.map((c) => c.name)).toEqual(['Mana Crypt'])
    expect(store.commanderAt('2026-11-02').banned).toEqual([])
  })

  it('keeps only the latest raw files and refuses downloads from other hosts', async () => {
    const { store, deps, api } = setup([
      { updatedAt: '2026-10-01T09:00:00Z', cards: [solRing] },
      { updatedAt: '2026-10-02T09:00:00Z', cards: [solRing] },
      { updatedAt: '2026-10-03T09:00:00Z', cards: [solRing] },
    ])
    for (let i = 0; i < 3; i++) {
      await runCatalogImport(store, deps)
      api.nextDay()
    }
    expect(readdirSync(deps.rawDir)).toHaveLength(2)

    const evil = { ...deps, fetchFn: (async () => new Response(JSON.stringify({ updated_at: 'x', jsonl_download_uri: 'https://evil.example/a.gz' }))) as never }
    await expect(runCatalogImport(store, evil, { force: true })).rejects.toThrow('inesperada')
  })

  it('a failed download is recorded and leaves the catalog as it was', async () => {
    const { store, deps } = setup([{ updatedAt: '2026-10-01T09:00:00Z', cards: [solRing] }])
    await runCatalogImport(store, deps)
    const failing = { ...deps, fetchFn: (async (url: string) => url.includes('bulk-data')
      ? new Response(JSON.stringify({ updated_at: '2026-10-09T00:00:00Z', jsonl_download_uri: 'https://data.scryfall.io/x.gz' }))
      : new Response('nope', { status: 500 })) as never }
    expect(await runCatalogImport(store, failing)).toMatchObject({ status: 'failed' })
    expect(store.lastRun()?.status).toBe('failed')
    expect(store.cardCount()).toBe(1)
  })

  it('applies the dated history after the first import', async () => {
    const history = parseHistory(JSON.stringify({ entries: [
      { name: 'Mana Crypt', kind: 'banned', from: '2024-09-23', source: 'https://magic.wizards.com/x' },
    ] }))
    const { store, deps } = setup([{ updatedAt: '2026-10-01T09:00:00Z', cards: [solRing, { ...manaCrypt, legalities: { commander: 'banned' } }] }], history)
    await runCatalogImport(store, deps)
    expect(store.commanderAt('2025-03-01').banned.map((c) => c.name)).toEqual(['Mana Crypt'])
  })
})

describe('history file', () => {
  it('the repository file is valid and every entry cites an https source', () => {
    const path = join(import.meta.dirname, '..', 'history', 'commander.json')
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { entries: unknown[] }
    expect(loadHistory(path)).toHaveLength(raw.entries.length)
  })

  it('drops invalid entries', () => {
    expect(parseHistory(JSON.stringify({ entries: [
      { name: 'A', kind: 'banned', from: '2024-01-01', source: 'http://insecure' },
      { name: 'B', kind: 'nope', from: '2024-01-01', source: 'https://x' },
      { name: 'C', kind: 'banned', from: '2024-13', source: 'https://x' },
      { name: 'D', kind: 'gameChanger', from: '2025-02-11', to: '2025-01-01', source: 'https://x' },
      { name: 'E', kind: 'gameChanger', from: '2025-02-11', source: 'https://x' },
    ] }))).toEqual([{ name: 'E', kind: 'gameChanger', from: '2025-02-11', source: 'https://x' }])
  })
})
