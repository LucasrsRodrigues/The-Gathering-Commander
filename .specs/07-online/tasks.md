# Tasks — 07 · Online (fase 2b)

- [x] **T7.0 — Decidir a hospedagem (ADR-07.1)**: VPS própria (Node + ws + SQLite + Caddy)
- [x] **T7.1 — Pacote `@gathering-hall/protocol`** _(req: 3, 5, NFR segurança e compatibilidade)_
  - O que fazer: tipos das mensagens, versão, schema de validação (allowlist de chaves, tamanhos) e encode/decode.
  - Verificação: testes de ida e volta; mensagens malformadas e grandes demais recusadas.
- [x] **T7.2 — `RoomCore` puro** _(req: 1–5, 7, 9, 10)_ · depende de T7.1
  - O que fazer: lobby (sentar, configurar, iniciar), tokens (hash), aplicar ações com `reduce` e montar as
    mensagens por destinatário com `viewFor`/`eventsFor`.
  - Verificação: testes de unidade: token errado é recusado; só o anfitrião inicia; espectador sem mãos.
- [x] **T7.3 — Fitness function de vazamento no protocolo** _(req: 6)_ · depende de T7.2
  - Verificação: partida aleatória de 4 lugares; nenhuma mensagem a um lugar contém objetos ocultos de outro.
- [x] **T7.4 — Adaptador de runtime + armazenamento** _(req: 8, 10, 11, NFR rate limit)_ · depende de T7.0, T7.2
  - O que fazer: servidor Node (`apps/server`) com HTTP + WebSocket (`ws`), um ator por sala, persistência em
    SQLite (`node:sqlite`), TTL de 24 h, token bucket e limite de criação de salas; Dockerfile e Caddyfile para a VPS.
  - Verificação: teste de integração subindo o servidor numa porta local; reiniciar o processo preserva a partida.
- [x] **T7.5 — `GameSessionPort` + `RemoteSession` + `GameTransport`** _(req: 8, 12, NFR evolutividade)_ · depende de T7.1
  - O que fazer: extrair a interface da sessão local, o cliente WebSocket com reconexão e o indicador de conexão.
  - Verificação: os testes da sessão local continuam passando; teste do cliente com um servidor falso cobrindo
    queda e reconexão.
- [x] **T7.6 — Telas: jogar online e lobby** _(req: 1, 2, 4, 9)_ · depende de T7.4, T7.5
  - Verificação: criar uma sala, abrir o link em outro navegador, sentar, começar.
- [ ] **T7.7 — Partida online de ponta a ponta + deploy** _(critérios globais)_ · depende de T7.6
  - Verificação: duas pessoas jogam até o fim; recarregar volta ao lugar; espectador sem mãos; o modo local
    funciona sem o servidor.
- [ ] **T7.8 — Revisão de segurança** _(NFR)_ · depende de T7.7
  - Verificação: checklist secure-coding (rede, tokens, rate limit, CSP/CORS).

## Estratégia de testes
`protocol` e `RoomCore` são puros, com testes de unidade e property-based (vazamento). O adaptador tem testes de
integração no runtime local. A partida de ponta a ponta é verificada com dois navegadores.

## Notas da implementação (T7.1–T7.6)
- **Vazamento real encontrado pela fitness function (T7.3):** os eventos `zoneChanged` mandavam a todos os ids de
  objetos que iam para a mão ou o grimório de outro jogador (no mulligan, por exemplo). Corrigido no motor
  (`eventsFor`): o id só chega a quem pode ver a zona de destino. O invariante do motor agora cobre eventos também.
- **Persistência:** o snapshot da sala (lobby, estado, estado inicial e log de ações) fica numa linha do SQLite.
  Isso é suficiente para replay; uma tabela de log separada fica para quando precisarmos consultar ações.
- **Verificado no navegador:** criar a sala, sentar (deck inválido barrado), o convidado entrando em tempo real por um
  cliente WebSocket separado, começar, a mão do oponente oculta e a ação "Manter" aplicada pelo servidor. O
  servidor reiniciou com a partida em andamento, a partida voltou do SQLite e o navegador reconectou sozinho.
- **Bug corrigido no teste manual:** ao começar, o servidor não reenviava o lobby e o anfitrião ficava parado no
  lobby.
- **T7.7 pendente:** a partida completa entre duas pessoas reais e o deploy na VPS (com o domínio do usuário).
  Docker, Caddy e o passo a passo estão em `deploy/` e `DEPLOY.md`.
- **Limitação:** abas do mesmo navegador compartilham o token da sala. Para testar dois jogadores no mesmo
  computador, use dois navegadores, ou um deles em janela anônima.

## Deploy (atualizado)
- O deploy passou a ser pelo **EasyPanel**, num container único: o servidor também entrega o app na mesma origem
  (`STATIC_DIR`), e o próprio domínio é aceito automaticamente pela checagem de origem. Caddy e docker-compose saíram;
  o HTTPS fica com o proxy do EasyPanel.
- Verificado localmente em modo de produção: app servido pelo servidor, sala criada e WebSocket conectado sob o CSP
  `'self'`. A imagem Docker ainda não foi construída aqui (daemon parado), então o primeiro build acontece no
  EasyPanel.
