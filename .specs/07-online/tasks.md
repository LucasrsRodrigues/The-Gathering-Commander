# Tasks — 07 · Online (fase 2b)

- [ ] **T7.0 — Decidir a hospedagem (ADR-07.1)** · bloqueia T7.4
- [ ] **T7.1 — Pacote `@gathering-hall/protocol`** _(req: 3, 5, NFR segurança e compatibilidade)_
  - O que fazer: tipos das mensagens, versão, schema de validação (allowlist de chaves, tamanhos) e encode/decode.
  - Verificação: testes de ida e volta; mensagens malformadas e grandes demais recusadas.
- [ ] **T7.2 — `RoomCore` puro** _(req: 1–5, 7, 9, 10)_ · depende de T7.1
  - O que fazer: lobby (sentar, configurar, iniciar), tokens (hash), aplicar ações com `reduce` e montar as
    mensagens por destinatário com `viewFor`/`eventsFor`.
  - Verificação: testes de unidade: token errado é recusado; só o anfitrião inicia; espectador sem mãos.
- [ ] **T7.3 — Fitness function de vazamento no protocolo** _(req: 6)_ · depende de T7.2
  - Verificação: partida aleatória de 4 lugares; nenhuma mensagem a um lugar contém objetos ocultos de outro.
- [ ] **T7.4 — Adaptador de runtime + armazenamento** _(req: 8, 10, 11, NFR rate limit)_ · depende de T7.0, T7.2
  - O que fazer: Worker + Durable Object (ou servidor Node), com persistência de estado e log, TTL de 24 h,
    token bucket e limite de criação de salas.
  - Verificação: teste de integração com o runtime local; reiniciar o objeto preserva a partida.
- [ ] **T7.5 — `GameSessionPort` + `RemoteSession` + `GameTransport`** _(req: 8, 12, NFR evolutividade)_ · depende de T7.1
  - O que fazer: extrair a interface da sessão local, o cliente WebSocket com reconexão e o indicador de conexão.
  - Verificação: os testes da sessão local continuam passando; teste do cliente com um servidor falso cobrindo
    queda e reconexão.
- [ ] **T7.6 — Telas: jogar online e lobby** _(req: 1, 2, 4, 9)_ · depende de T7.4, T7.5
  - Verificação: criar uma sala, abrir o link em outro navegador, sentar, começar.
- [ ] **T7.7 — Partida online de ponta a ponta + deploy** _(critérios globais)_ · depende de T7.6
  - Verificação: duas pessoas jogam até o fim; recarregar volta ao lugar; espectador sem mãos; o modo local
    funciona sem o servidor.
- [ ] **T7.8 — Revisão de segurança** _(NFR)_ · depende de T7.7
  - Verificação: checklist secure-coding (rede, tokens, rate limit, CSP/CORS).

## Estratégia de testes
`protocol` e `RoomCore` são puros, com testes de unidade e property-based (vazamento). O adaptador tem testes de
integração no runtime local. A partida de ponta a ponta é verificada com dois navegadores.
