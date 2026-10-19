import type { CardRef, DeckInput } from '@gathering-hall/engine'
import type { ClientMessage, ServerMessage } from '@gathering-hall/protocol'
import { Room, type Outgoing, type RoomDeps } from '../src/room/room'

export function testDeps(): RoomDeps {
  let n = 0
  return {
    newToken: () => `tok${String(++n).padStart(19, '0')}`,
    hash: (t) => `h:${t}`,
    seed: () => 42,
    now: () => 1_000,
  }
}

const bear: CardRef = { name: 'Bear', typeLine: 'Creature — Bear' }
const land: CardRef = { name: 'Forest', typeLine: 'Basic Land — Forest' }
export const deck: DeckInput = {
  commanders: [{ name: 'Boss', typeLine: 'Legendary Creature — Human' }],
  cards: [...Array(30).fill(bear), ...Array(30).fill(land)],
}

export const msg = <T extends ClientMessage['t']>(m: Omit<Extract<ClientMessage, { t: T }>, 'v'> & { t: T }) =>
  ({ v: 1, ...m }) as ClientMessage

export function to(out: Outgoing[], conn: string, t?: ServerMessage['t']): ServerMessage[] {
  return out.filter((o) => o.to === conn && (!t || o.msg.t === t)).map((o) => o.msg)
}

// A room with a host and `players - 1` guests, all seated; returns tokens by seat.
export function seatedRoom(players: number) {
  const deps = testDeps()
  const { room, hostToken } = Room.create('room-1', deps)
  room.receive('c0', msg({ t: 'hello', room: 'room-1', token: hostToken }))
  room.receive('c0', msg({ t: 'sit', seat: 0, name: 'Host', deck }))
  for (let i = 1; i < players; i++) {
    room.receive(`c${i}`, msg({ t: 'hello', room: 'room-1' }))
    room.receive(`c${i}`, msg({ t: 'sit', seat: i, name: `P${i + 1}`, deck }))
  }
  return { room, deps, hostToken }
}
