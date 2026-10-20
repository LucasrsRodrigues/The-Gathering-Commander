import { describe, expect, it, vi } from 'vitest'
import { keywordHelp } from '../hud/keywordHelp'
import { rememberImages, type CatalogCard } from './catalog'
import { cachedTranslation, cardTextFor, setCardTextSource, translationFor } from './cardText'
import { ScryfallCatalog } from './scryfall'

const ID = '4b4e1f3e-0000-4000-8000-4b4e1f3e0000'

describe('card text for the preview', () => {
  it('remembers the Oracle text whenever the catalog remembers a card', () => {
    const card: CatalogCard = {
      ref: { name: 'Sol Ring', oracleId: 'or-sol', imageKey: 'img-sol' }, images: null, manaValue: 1,
      facts: { oracleId: 'or-sol', name: 'Sol Ring', typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.', colorIdentity: [], keywords: [], legalCommander: 'legal', gameChanger: false },
    }
    rememberImages(card)
    expect(cardTextFor({ name: 'Sol Ring', oracleId: 'or-sol' })).toMatchObject({ oracleText: '{T}: Add {C}{C}.' })
    expect(cardTextFor({ name: 'sol ring' })).toMatchObject({ typeLine: 'Artifact' }) // by name, too
  })

  it('asks Scryfall for a Portuguese printing and reads its printed text (both faces)', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get('q')).toBe(`oracleid:${ID} lang:pt`)
      return { ok: true, status: 200, json: async () => ({ data: [{
        printed_name: 'Anel Solar', printed_type_line: 'Artefato', printed_text: '{T}: Adicione {C}{C}.\nSegunda linha.',
      }] }) }
    })
    const catalog = new ScryfallCatalog({ fetchFn, storage: null, sleep: async () => {} })
    expect(await catalog.translation(ID)).toEqual({ name: 'Anel Solar', typeLine: 'Artefato', text: '{T}: Adicione {C}{C}.\nSegunda linha.' })
    expect(await catalog.translation('not-an-id')).toBeNull()
  })

  it('caches translations, misses included, so a card is asked once', async () => {
    const translation = vi.fn(async (id: string) => (id === 'with' ? { name: 'Nome', typeLine: 'Tipo', text: 'Texto' } : null))
    setCardTextSource({ resolve: async () => {}, translation })
    expect(await translationFor('with')).toMatchObject({ name: 'Nome' })
    expect(await translationFor('without')).toBeNull()
    await translationFor('with')
    await translationFor('without')
    expect(translation).toHaveBeenCalledTimes(2)
    expect(cachedTranslation('without')).toBeNull()
    expect(cachedTranslation('never-asked')).toBeUndefined()
    setCardTextSource(null)
  })
})

describe('keyword help', () => {
  it('explains the keywords it knows, once each, with the Portuguese name when there is one', () => {
    const help = keywordHelp(['Flying', 'Deathtouch', 'Flying', 'Mystery keyword', 'Undying'])
    expect(help.map((h) => h.name)).toEqual(['Voar (Flying)', 'Toque Mortífero (Deathtouch)', 'Undying'])
    expect(help[0]!.help).toMatch(/alcance/)
  })
})

describe('printings without printed text', () => {
  it('a basic land still gets its Portuguese name and type', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ printed_name: 'Montanha', printed_type_line: 'Terreno Básico — Montanha' }] }) }))
    const catalog = new ScryfallCatalog({ fetchFn, storage: null, sleep: async () => {} })
    expect(await catalog.translation(ID)).toEqual({ name: 'Montanha', typeLine: 'Terreno Básico — Montanha', text: '' })
  })
})
