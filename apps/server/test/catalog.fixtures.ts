import type { BulkCard } from '../src/catalog/normalize'

const CDN = 'https://cards.scryfall.io'
const img = (n: string) => ({ small: `${CDN}/s/${n}.jpg`, normal: `${CDN}/n/${n}.jpg`, large: `${CDN}/l/${n}.jpg` })
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export function bulk(n: number, name: string, extra: Partial<BulkCard> = {}): BulkCard {
  return {
    id: uuid(n), oracle_id: uuid(1000 + n), name, layout: 'normal', mana_cost: '{1}', type_line: 'Artifact', cmc: 1,
    oracle_text: 'Text.', color_identity: [], keywords: [], legalities: { commander: 'legal' }, game_changer: false,
    image_uris: img(name), ...extra,
  }
}

export const solRing = bulk(1, 'Sol Ring', { oracle_text: '{T}: Add {C}{C}.' })
export const manaCrypt = bulk(2, 'Mana Crypt', { mana_cost: '{0}', cmc: 0, legalities: { commander: 'banned' }, oracle_text: 'At the beginning of your upkeep, flip a coin.' })
export const rhystic = bulk(3, 'Rhystic Study', { type_line: 'Enchantment', color_identity: ['U'], game_changer: true })
export const krenko = bulk(4, 'Krenko, Mob Boss', { type_line: 'Legendary Creature — Goblin Warrior', color_identity: ['R'], power: '3', toughness: '3' })
export const dfc = bulk(5, 'Front Face // Back Face', {
  layout: 'modal_dfc', type_line: undefined, oracle_text: undefined, image_uris: undefined, oracle_id: undefined,
  card_faces: [
    { name: 'Front Face', type_line: 'Legendary Creature — Elf', oracle_text: 'Partner', oracle_id: uuid(1005), image_uris: img('front') },
    { name: 'Back Face', type_line: 'Land', oracle_text: '{T}: Add {G}.' },
  ],
})
export const artSeries = bulk(6, 'Sol Ring', { layout: 'art_series' })
