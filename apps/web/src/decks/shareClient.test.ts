import { describe, expect, it, vi } from 'vitest'
import { publicDeckUrl, ShareClient } from './shareClient'

const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('share client', () => {
  it('changes links with the session cookie and reads public decks without it', async () => {
    const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => (url.endsWith('/share') ? answer(200, { slug: 'Ab3dE5gH9k' }) : url.includes('/public/') ? answer(200, { deck: { name: 'X' } }) : answer(200, { shares: [{ deckId: 'd1', slug: 'Ab3dE5gH9k' }, { deckId: 'd2', slug: 'bad' }] })))
    const client = new ShareClient('http://srv/', fetchFn)
    expect(await client.share('d1')).toEqual({ ok: true, slug: 'Ab3dE5gH9k' })
    expect(fetchFn.mock.calls[0]).toEqual(['http://srv/api/decks/d1/share', expect.objectContaining({ method: 'PUT', credentials: 'include' })])
    expect(await client.linkOf('d1')).toBe('Ab3dE5gH9k')
    expect(await client.linkOf('d2')).toBeNull() // a malformed slug is ignored
    expect(await client.read('Ab3dE5gH9k')).toEqual({ name: 'X' })
    expect(fetchFn.mock.calls.at(-1)![1]).toMatchObject({ credentials: 'omit' })
  })

  it('a missing link is null; an invalid slug never reaches the network', async () => {
    const fetchFn = vi.fn(async () => answer(404, { error: 'não existe' }))
    const client = new ShareClient('http://srv', fetchFn)
    expect(await client.read('Ab3dE5gH9k')).toBeNull()
    expect(await client.read('../../etc')).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(publicDeckUrl('Ab3dE5gH9k', 'https://jogo.example/')).toBe('https://jogo.example/#/d/Ab3dE5gH9k')
  })
})
