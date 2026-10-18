// Plain-text decklist parser (Moxfield / Archidekt / MTGO style). The input is untrusted:
// bounded in size and treated strictly as text.

export interface DeckEntry {
  count: number
  name: string
}

export interface ParsedDeck {
  commanders: DeckEntry[]
  cards: DeckEntry[]
  errors: string[]
}

export const MAX_LINES = 300
export const MAX_LINE_LENGTH = 200
const MAX_COPIES = 99

const COMMANDER_HEADERS = /^(\/\/\s*)?(commander|commanders|comandante|comandantes)\s*:?$/i
const IGNORED_HEADERS = /^(\/\/\s*)?(sideboard|maybeboard|considering|tokens?)\s*:?$/i
const OTHER_HEADERS = /^(\/\/\s*)?(deck|mainboard|main|companion|creatures?|lands?|instants?|sorceries|artifacts?|enchantments?|planeswalkers?)\s*(\(\d+\))?\s*:?$/i

export function parseDecklist(text: string): ParsedDeck {
  const result: ParsedDeck = { commanders: [], cards: [], errors: [] }
  const lines = text.split(/\r?\n/)
  if (lines.length > MAX_LINES) {
    result.errors.push(`A lista tem mais de ${MAX_LINES} linhas.`)
    return result
  }

  let section: 'main' | 'commander' | 'ignored' = 'main'
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    if (line.length > MAX_LINE_LENGTH) {
      result.errors.push(`Linha ${i + 1} é longa demais.`)
      return
    }
    if (COMMANDER_HEADERS.test(line)) return void (section = 'commander')
    if (IGNORED_HEADERS.test(line)) return void (section = 'ignored')
    if (OTHER_HEADERS.test(line)) return void (section = 'main')
    if (line.startsWith('#') || line.startsWith('//')) return
    if (section === 'ignored') return

    const entry = parseLine(line)
    if (!entry) {
      result.errors.push(`Linha ${i + 1} não foi entendida: "${line.slice(0, 60)}"`)
      return
    }
    const isCommander = section === 'commander' || /\*CMDR\*/i.test(line)
    ;(isCommander ? result.commanders : result.cards).push(entry)
  })
  return result
}

function parseLine(line: string): DeckEntry | null {
  const match = /^(?:(\d+)\s*x?\s+)?(.+)$/i.exec(line)
  if (!match) return null
  const count = match[1] ? Number(match[1]) : 1
  const name = match[2]!
    .replace(/\*[A-Z]+\*/gi, '') // *F*, *E*, *CMDR*
    .replace(/\s+\([A-Z0-9]{2,6}\)(\s+[\w-]+)?\s*$/i, '') // (SET) 123
    .replace(/\s+\[[^\]]*\]\s*$/, '') // [Category] tags
    .replace(/\s+\^[^^]*\^\s*$/, '') // ^tags^
    .trim()
  if (!name || count < 1 || count > MAX_COPIES) return null
  return { count, name }
}
