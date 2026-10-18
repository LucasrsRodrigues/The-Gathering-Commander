// Pool of real Commander staples, with images fetched once from Scryfall.
// If the network fails we fall back to generated placeholders so the bench still runs.

export type CardKind = 'land' | 'creature' | 'other'

export interface PoolCard {
  name: string
  kind: CardKind
  commander: boolean
  img: { small: string; normal: string; large: string }
}

const COMMANDERS = [
  "Atraxa, Praetors' Voice", 'Edgar Markov', 'The Ur-Dragon', 'Meren of Clan Nel Toth',
  'Krenko, Mob Boss', 'Talrand, Sky Summoner', 'Kenrith, the Returned King', 'Muldrotha, the Gravetide',
]
const CREATURES = [
  'Llanowar Elves', 'Birds of Paradise', 'Eternal Witness', 'Solemn Simulacrum', 'Beast Whisperer',
  'Craterhoof Behemoth', 'Avenger of Zendikar', 'Sakura-Tribe Elder', 'Wood Elves', 'Reclamation Sage',
  'Baleful Strix', 'Snapcaster Mage', 'Grave Titan', 'Mother of Runes', 'Elvish Mystic', 'Coiling Oracle',
  'Acidic Slime', 'Thragtusk', 'Esper Sentinel', 'Oracle of Mul Daya',
]
const OTHERS = [
  'Sol Ring', 'Arcane Signet', 'Rhystic Study', 'Smothering Tithe', 'Mystic Remora', 'Phyrexian Arena',
  'Lightning Greaves', 'Swiftfoot Boots', 'Skullclamp', 'Mind Stone', 'Fellwar Stone', "Commander's Sphere",
  'Doubling Season', 'Parallel Lives', 'Propaganda', 'Ghostly Prison', 'Sylvan Library', 'Garruk Wildspeaker',
]
const LANDS = [
  'Command Tower', 'Exotic Orchard', 'Reliquary Tower', 'Forest', 'Island', 'Swamp', 'Mountain', 'Plains',
  'Breeding Pool', 'Hallowed Fountain', 'Overgrown Tomb', 'Steam Vents', 'Temple Garden', 'Sacred Foundry',
  'Watery Grave', 'Godless Shrine', 'Path of Ancestry', 'Myriad Landscape', 'Bojuka Bog', "Rogue's Passage",
]

const ENTRIES: { name: string; kind: CardKind; commander: boolean }[] = [
  ...COMMANDERS.map((name) => ({ name, kind: 'creature' as const, commander: true })),
  ...CREATURES.map((name) => ({ name, kind: 'creature' as const, commander: false })),
  ...OTHERS.map((name) => ({ name, kind: 'other' as const, commander: false })),
  ...LANDS.map((name) => ({ name, kind: 'land' as const, commander: false })),
]

const CACHE_KEY = 'gh-render-bench-pool-v1'

interface ScryfallImages { small: string; normal: string; large: string }
interface ScryfallCard {
  name: string
  image_uris?: ScryfallImages
  card_faces?: { image_uris?: ScryfallImages }[]
}

export type PoolSource = 'scryfall' | 'cache' | 'placeholder'

export async function loadPool(): Promise<{ cards: PoolCard[]; source: PoolSource }> {
  const cached = readCache()
  if (cached) return { cards: cached, source: 'cache' }
  try {
    // /cards/collection accepts up to 75 identifiers per request.
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifiers: ENTRIES.map(({ name }) => ({ name })) }),
    })
    if (!res.ok) throw new Error(`Scryfall respondeu ${res.status}`)
    const json = (await res.json()) as { data: ScryfallCard[] }
    const byName = new Map(json.data.map((c) => [c.name, c]))
    const cards = ENTRIES.flatMap((entry) => {
      const found = byName.get(entry.name)
      const img = found?.image_uris ?? found?.card_faces?.[0]?.image_uris
      return img ? [{ ...entry, img: { small: img.small, normal: img.normal, large: img.large } }] : []
    })
    writeCache(cards)
    return { cards, source: 'scryfall' }
  } catch {
    return { cards: ENTRIES.map((e) => ({ ...e, img: placeholderImages(e.name, e.kind) })), source: 'placeholder' }
  }
}

function readCache(): PoolCard[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as PoolCard[]) : null
  } catch {
    return null
  }
}

function writeCache(cards: PoolCard[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cards))
  } catch {
    // Storage unavailable (private mode, quota): the bench works without it.
  }
}

const KIND_COLORS: Record<CardKind, string> = { land: '#5b6b3a', creature: '#7a3b2e', other: '#3b4f7a' }

function placeholderImages(name: string, kind: CardKind): PoolCard['img'] {
  const canvas = document.createElement('canvas')
  canvas.width = 244
  canvas.height = 340
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, 244, 340)
    ctx.fillStyle = KIND_COLORS[kind]
    ctx.fillRect(10, 10, 224, 320)
    ctx.fillStyle = '#f2ead8'
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText(name.slice(0, 22), 20, 40)
  }
  const url = canvas.toDataURL('image/png')
  return { small: url, normal: url, large: url }
}
