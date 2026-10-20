import { describe, expect, it, vi } from 'vitest'
import { AccountClient, toAccount } from './client'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function server(routes: Record<string, () => Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    expect(init?.credentials).toBe('include') // the session cookie goes along (dev app on another port)
    const path = new URL(url).pathname
    const route = routes[`${init?.method ?? 'GET'} ${path}`]
    return route ? route() : json(404, {})
  })
}

describe('account client', () => {
  it('without providers on the server, accounts are off and nothing asks to log in', async () => {
    const client = new AccountClient('http://srv', server({ 'GET /api/auth/providers': () => json(200, { providers: [] }) }))
    expect(await client.refresh()).toEqual({ status: 'off' })
  })

  it('an unreachable server also means off: the game never depends on it', async () => {
    const client = new AccountClient('http://srv', async () => { throw new Error('offline') })
    expect(await client.refresh()).toEqual({ status: 'off' })
  })

  it('knows anonymous and signed-in visitors', async () => {
    const anon = new AccountClient('http://srv', server({
      'GET /api/auth/providers': () => json(200, { providers: ['discord', 'google', 'myspace'] }),
      'GET /api/me': () => json(401, { account: null }),
    }))
    expect(await anon.refresh()).toEqual({ status: 'anonymous', providers: ['discord', 'google'] })
    expect(anon.startUrl('discord')).toBe('http://srv/api/auth/discord/start')

    const signed = new AccountClient('http://srv/', server({
      'GET /api/auth/providers': () => json(200, { providers: ['discord'] }),
      'GET /api/me': () => json(200, { account: { id: 'u1', name: 'Ana', avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png', providers: ['discord'] } }),
    }))
    expect(await signed.refresh()).toMatchObject({ status: 'signedIn', account: { name: 'Ana', providers: ['discord'] } })
  })

  it('distrusts what the server sends about the account', () => {
    expect(toAccount({ id: 'u', name: 'A', avatarUrl: 'https://evil.example/x.png', providers: ['discord', 'evil'] }))
      .toEqual({ id: 'u', name: 'A', avatarUrl: null, providers: ['discord'] })
    expect(toAccount({ id: 'u', name: '   ' })).toBeNull()
    expect(toAccount(null)).toBeNull()
  })

  it('deleting sends the typed confirmation and reports the server message', async () => {
    const fetchFn = server({
      'GET /api/auth/providers': () => json(200, { providers: ['discord'] }),
      'GET /api/me': () => json(401, {}),
      'DELETE /api/me': () => json(400, { error: 'confirme digitando "excluir minha conta"' }),
    })
    const client = new AccountClient('http://srv', fetchFn)
    expect(await client.deleteAccount('sim')).toEqual({ ok: false, error: 'confirme digitando "excluir minha conta"' })
    const call = fetchFn.mock.calls.find(([, init]) => init?.method === 'DELETE')!
    expect(JSON.parse(String(call[1]!.body))).toEqual({ confirm: 'sim' })
  })
})

describe('match history client', () => {
  it('asks for a page with the cursor and keeps only well-formed fields', async () => {
    const fetchFn = server({
      'GET /api/games': () => json(200, {
        next: 'c2',
        games: [
          { id: 'g1', startedAt: 1, endedAt: 600_001, preset: 'Oficial', players: [
            { seat: 0, name: 'Ana', commanders: ['Krenko'], won: true, lossReason: null, you: true, userId: 'leak' },
            { seat: 1, name: 42, commanders: 'x', won: 'yes', you: false },
          ] },
          { id: 7, players: [] },
        ],
      }),
    })
    const client = new AccountClient('http://srv', fetchFn)
    const page = await client.games('c1')
    expect(fetchFn.mock.calls[0]![0]).toBe('http://srv/api/games?cursor=c1')
    expect(page!.next).toBe('c2')
    expect(page!.games).toHaveLength(1)
    expect(page!.games[0]!.players).toEqual([
      { seat: 0, name: 'Ana', commanders: ['Krenko'], won: true, lossReason: null, you: true },
      { seat: 1, name: 'Jogador', commanders: [], won: false, lossReason: null, you: false },
    ])
  })

  it('a failed request is null, so the screen can offer to try again', async () => {
    const client = new AccountClient('http://srv', server({ 'GET /api/games': () => json(401, {}) }))
    expect(await client.games(null)).toBeNull()
  })
})
