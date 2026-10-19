# Design — 07 · Online (fase 2b)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| clean-architecture | O transporte é detalhe | Porta `GameTransport`; mesa e HUD iguais no local e no online |
| domain-driven-design | Sala = aggregate novo | `Room` como aggregate, com lobby e partida; uma instância por transação (um objeto por sala) |
| secure-coding | Primeira superfície de rede | Zero trust no cliente, tokens de lugar, schema de mensagens, rate limit, visão filtrada |
| evolutionary-architecture | O provedor pode mudar | ACL de transporte e de armazenamento; fitness function de vazamento aplicada ao protocolo |
| distributed-systems-patterns / scalable-systems | Estado por sala, conexões longas | Sharding natural por sala; servidor autoritativo; ordem total das ações dentro da sala |

## Visão geral
```mermaid
flowchart LR
  subgraph Navegador
    UI[Mesa + HUD] --> S[GameSessionPort]
    S --> L[LocalSession: motor no navegador]
    S --> R[RemoteSession]
    R --> T[GameTransport: WebSocket]
  end
  T <--> W[Servidor Node: HTTP + upgrade WebSocket via ws]
  W --> D[(Room: um ator RoomCore por sala)]
  D --> E[@gathering-hall/engine: reduce, viewFor]
  D --> ST[(armazenamento da sala: estado + log)]
```
- **Um objeto por sala** (Durable Object, ou um processo/ator equivalente num servidor próprio). Ele guarda o lobby,
  o `GameState`, o log de ações e as conexões. Como todas as ações de uma sala passam por um único lugar, a ordem é
  total e não há disputa de concorrência.
- **O cliente nunca roda `reduce` no online.** Ele envia uma intenção e recebe a visão. Previsão otimista fica para
  depois, se a latência pedir.

## Protocolo (JSON, versionado)
```ts
// cliente → servidor
{ v: 1, t: 'hello', room, token?, spectator? }               // entrar/reconectar
{ v: 1, t: 'sit', seat, name, deck: DeckInput }               // lobby
{ v: 1, t: 'configure', preset: Preset }                      // lobby, só o anfitrião
{ v: 1, t: 'start' }                                          // lobby, só o anfitrião
{ v: 1, t: 'act', seq, action: ActionIntent }                 // partida
{ v: 1, t: 'ping' }

// servidor → cliente
{ v: 1, t: 'welcome', you: { seat: PlayerId | null, token?, host: boolean } }
{ v: 1, t: 'lobby', seats: { id, name, taken, connected }[], preset }
{ v: 1, t: 'state', version, view: PlayerView, events: GameEvent[] }   // já filtrados para quem recebe
{ v: 1, t: 'rejected', seq, error: GameError }
{ v: 1, t: 'presence', connected: PlayerId[] }
{ v: 1, t: 'error', code, message }                                   // protocolo (versão, sala inexistente…)
```
- O jogador da ação **não vem do cliente**: o servidor usa o lugar ligado ao token da conexão e monta
  `Action = { ...intent, player: seat }`.
- **Visão inteira a cada atualização na 2b.** Uma `PlayerView` de 4 jogadores fica na casa das dezenas de KB.
  Diferenças (patches) só se uma fitness function de tamanho de mensagem mostrar necessidade.
- `version` cresce a cada ação aplicada. O cliente descarta uma visão mais antiga que a atual.

## Identidade e segurança
- **Sala:** id aleatório de 128 bits em base64url. O link é `/#/sala/<id>`, e o fragmento não vai para logs de
  servidor.
- **Token de lugar:** 128 bits aleatórios, entregue em `welcome`, guardado no `localStorage` por sala. O servidor
  guarda só o hash.
- **Anfitrião:** quem cria a sala recebe um token de anfitrião, que permite configurar, iniciar e remover lugares
  vazios.
- **Validação:**
  - schema por tipo de mensagem (allowlist de chaves, tamanhos, tipos);
  - `ActionIntent` revalidado pelo motor;
  - `DeckInput` limitado a 250 cartas e strings de até 200 caracteres.
- **Rate limit:** um token bucket por conexão (20 mensagens por segundo; acima disso, descarta e avisa), além de um
  limite de salas criadas por IP por hora.
- **Fitness function do protocolo:** um teste sobe uma sala em memória, joga ações aleatórias e verifica que
  nenhuma mensagem enviada a um lugar contém objetos da mão de outro nem do grimório. É o mesmo invariante do motor,
  agora aplicado à rede.

## Cliente
- `GameSessionPort`: interface comum a `LocalSession` (o `GameSession` atual) e `RemoteSession`, com `view()`,
  `seat()`, `dispatch()`, `subscribe()`, `canUndo()` e `status` (conexão).
- `RemoteSession` usa um `GameTransport` (WebSocket com reconexão exponencial, ping a cada 20 s e reenvio de `hello`
  com o token).
- **Telas novas:**
  - "Jogar online": criar sala;
  - lobby da sala: lugares, nomes, escolha de deck salvo ou de exemplo, regras e botão "Começar" para o anfitrião;
  - indicador de conexão no HUD.
- A **cortina de hot-seat não existe no online**: cada dispositivo é um lugar.

## Decisões
- **ADR-07.1 — Hospedagem: VPS própria (decidido em 2026-10-19).** Servidor Node + `ws` + SQLite nativo do Node (`node:sqlite`), num container único publicado pelo EasyPanel (o proxy dele cuida do TLS); o servidor também entrega o app na mesma origem. Abaixo, a comparação que embasou a escolha.

  | | A. Servidor próprio (Node + `ws` + SQLite/Postgres) | B. Cloudflare Workers + Durable Objects ⭐ |
  |---|---|---|
  | Modelo de sala | Um processo segura todas as salas em memória; persistência manual | Uma sala = um objeto durável com armazenamento transacional próprio |
  | Custo | VPS a partir de ~US$ 5/mês | Plano gratuito cobre o uso esperado |
  | Operação | Atualizar SO, TLS, backups, reinícios | Nenhuma; deploy com `wrangler` |
  | Escala | Vertical; várias máquinas exigem coordenação | Automática por sala |
  | Aprisionamento | Nenhum | Médio; mitigado pela porta de transporte e de armazenamento |
  | Dev local | `node` direto | `wrangler dev` (simula os objetos localmente) |

  **Escolha do usuário: A (VPS própria).** Ganho: controle total e nenhum aprisionamento. Custo: operação
  (atualizações, TLS, backups) e escala vertical, mais do que suficiente para partidas entre amigos. O `RoomCore`
  puro continua isolado do runtime, então a opção B segue possível no futuro trocando só o adaptador.
  - Cada sala vira um **ator em memória** (um `RoomCore` por sala) dentro de um único processo Node, com fila de
    mensagens por sala. Isso mantém a ordem total das ações.
  - **Persistência:** SQLite em arquivo (`node:sqlite`, sem dependência nativa). Uma tabela de salas (estado +
    lobby) e uma de log de ações. Gravação a cada ação, numa transação.
- **ADR-07.2 — Núcleo de sala puro (`RoomCore`) separado do runtime.** `RoomCore` recebe mensagens e devolve
  mensagens + novo estado. O adaptador (Durable Object ou servidor Node) só cuida de sockets e armazenamento.
  Testável sem rede, como o motor.
- **ADR-07.3 — Sem previsão otimista no cliente na 2b.** Simplicidade e zero chance de divergência. Revisitar se a
  latência medida passar de 150 ms.

## Riscos
- **Cliente desatualizado após um deploy** → versão no protocolo, mais o aviso para recarregar.
- **Sala "presa" com jogador ausente** → o anfitrião pode conceder pelo ausente após 5 minutos desconectado
  (a ação `concede` com permissão do anfitrião).
- **Abuso (salas em massa, flood)** → rate limit, TTL e limites de tamanho. As salas não são indexadas nem listadas
  publicamente.
- **Custo inesperado** → alarmes de uso no provedor e limite de salas ativas.
