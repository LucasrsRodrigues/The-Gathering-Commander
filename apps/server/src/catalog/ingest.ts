// Daily import of Scryfall's "Oracle Cards" bulk file (JSON Lines, ~25 MB gzipped). Follows Scryfall's
// guidelines: at most once per bulk update, identified User-Agent, no page scraping. The raw file is kept
// (last few days) so a bad normalization can be reprocessed without losing history.

import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { diffCatalog } from './diff'
import { CARD_FORMAT, normalizeCard, type BulkCard, type CatalogRecord } from './normalize'
import type { CatalogStore, HistoryEntry, ImportRun } from './store'

const BULK_INFO = 'https://api.scryfall.com/bulk-data/oracle-cards'
const USER_AGENT = 'TheGatheringHall/0.1 (+https://github.com/LucasrsRodrigues/The-Gathering-Commander)'
const DOWNLOAD_HOST = 'data.scryfall.io'
const MAX_LINE = 200_000

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface IngestDeps {
  fetchFn: FetchLike
  rawDir: string
  now: () => Date
  keepRaw?: number
  history?: HistoryEntry[]
  log?: (msg: string) => void
}

export interface IngestResult {
  status: ImportRun['status']
  cards: number
  changes: number
  error?: string
}

function allowedDownload(url: unknown): url is string {
  try {
    const u = new URL(String(url))
    return u.protocol === 'https:' && u.hostname === DOWNLOAD_HOST
  } catch {
    return false
  }
}

export async function runCatalogImport(store: CatalogStore, deps: IngestDeps, opts: { force?: boolean } = {}): Promise<IngestResult> {
  const log = deps.log ?? (() => {})
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  const infoRes = await deps.fetchFn(BULK_INFO, { headers })
  if (!infoRes.ok) throw new Error(`bulk-data respondeu ${infoRes.status}`)
  const info = (await infoRes.json()) as { updated_at?: string; jsonl_download_uri?: string }
  const updatedAt = typeof info.updated_at === 'string' ? info.updated_at : ''
  if (!updatedAt || !allowedDownload(info.jsonl_download_uri)) throw new Error('resposta inesperada do bulk-data')

  if (!opts.force && (await store.lastRun('ok'))?.bulkUpdatedAt === updatedAt && (await store.cardFormat()) === CARD_FORMAT) {
    log('catálogo: bulk sem novidades')
    return { status: 'skipped', cards: 0, changes: 0 }
  }

  const runId = await store.startRun(deps.now().toISOString())
  try {
    mkdirSync(deps.rawDir, { recursive: true })
    const stamp = updatedAt.replace(/[^0-9]/g, '').slice(0, 14)
    const rawPath = join(deps.rawDir, `oracle-cards-${stamp}.jsonl.gz`)
    const res = await deps.fetchFn(info.jsonl_download_uri, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok || !res.body) throw new Error(`download respondeu ${res.status}`)
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(rawPath))

    const records = await readBulk(rawPath)
    const date = updatedAt.slice(0, 10)
    const changes = await store.apply(diffCatalog(await store.currentState(), records), records, date)
    if (deps.history?.length) {
      const seeded = await store.seedHistory(deps.history)
      if (seeded.unknown.length) log(`catálogo: histórico com nomes desconhecidos: ${seeded.unknown.join(', ')}`)
    }
    await store.setCardFormat(CARD_FORMAT)
    pruneRaw(deps.rawDir, deps.keepRaw ?? 7)
    await store.finishRun(runId, { finishedAt: deps.now().toISOString(), status: 'ok', bulkUpdatedAt: updatedAt, cards: records.length, changes })
    log(`catálogo: ${records.length} cartas, ${changes} mudança(s) em ${date}`)
    return { status: 'ok', cards: records.length, changes }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await store.finishRun(runId, { finishedAt: deps.now().toISOString(), status: 'failed', error: message.slice(0, 500) })
    log(`catálogo: importação falhou: ${message}`)
    return { status: 'failed', cards: 0, changes: 0, error: message }
  }
}

// Streams the gzipped JSON Lines file: one card per line, never the whole file in memory as text.
export async function readBulk(path: string): Promise<CatalogRecord[]> {
  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity })
  const records: CatalogRecord[] = []
  for await (const line of lines) {
    if (!line || line.length > MAX_LINE) continue
    let raw: BulkCard
    try {
      raw = JSON.parse(line) as BulkCard
    } catch {
      continue
    }
    const rec = normalizeCard(raw)
    if (rec) records.push(rec)
  }
  if (records.length === 0) throw new Error('arquivo do bulk sem cartas')
  return records
}

function pruneRaw(dir: string, keep: number) {
  const files = readdirSync(dir).filter((f) => f.startsWith('oracle-cards-') && f.endsWith('.jsonl.gz')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, f), { force: true })
}
