# Tasks — 08 · Contas opcionais e nuvem (fase 3b)

Quatro ondas, cada uma com deploy seguro: a onda 0 não muda nada para quem joga, e as outras só aparecem com as
chaves de login configuradas.

## Onda 0 — Postgres
- [x] **T8.1 — Porta `Db`, adaptadores Postgres e PGlite, migrações** _(req: 1, 2, 4)_
  - Escopo:
    - `Db` com `query`/`transaction`;
    - `PgDb` (`postgres`) e `PgliteDb`;
    - runner de migrações com `schema_migration`;
    - escolha por `DATABASE_URL`.
  - Verificação:
    - migrações idempotentes;
    - uma migração com erro não deixa nada pela metade;
    - os testes rodam sem banco externo.
  - Feito:
    - `apps/server/src/db/`: porta `Db`, `PostgresDb` (`postgres` 3.4.9, pool de 5) e `PgliteDb`
      (`@electric-sql/pglite` 0.5.8, em memória ou no diretório `pg` dos dados);
    - `migrate` aplica `migrations/NNNN-nome.sql` em ordem, cada uma numa transação;
    - os testes rodam no PGlite e repetem a suíte num Postgres real quando há `TEST_DATABASE_URL`.
- [x] **T8.2 — Stores assíncronos: salas e catálogo no Postgres** _(req: 1)_ · depende de T8.1
  - Escopo:
    - `RoomStore` e `CatalogStore` assíncronos;
    - import do catálogo em lotes;
    - o `server.ts` carrega a sala e resolve o deck no catálogo antes do RoomCore;
    - fila de gravação por sala.
  - Verificação:
    - toda a suíte atual do servidor passa no PGlite;
    - import real do bulk em menos de 1 minuto;
    - fitness "núcleo sem I/O".
  - Feito:
    - migração `0001-rooms-and-catalog.sql`;
    - `DbRoomStore` e `CatalogStore` assíncronos sobre a porta `Db`, com a importação em lotes de 1000 via `unnest`
      e nomes resolvidos numa consulta só;
    - `CatalogCache`: uma visão síncrona do catálogo para o RoomCore, aquecida pelo servidor antes do `sit` e do
      `configure`;
    - fila por sala no `server.ts` (carregar, preparar, processar, gravar e só então responder);
    - fitness: os arquivos de `room/` não importam banco, rede nem Node e não têm código assíncrono.
  - Medido (importação real do bulk, 34.998 cartas): cerca de 8 s no PGlite.
  - **Risco para a T8.3:** o PGlite chega a cerca de 1,5 GB de memória numa importação completa, porque a transação
    fica inteira dentro do WebAssembly. Em produção, o caminho é Postgres (`DATABASE_URL`). Sem ele, o deploy
    precisa avisar ou desligar a importação automática.
- [x] **T8.3 — Transferência dos dados antigos e deploy** _(req: 3)_ · depende de T8.2
  - Escopo:
    - copiar as salas do `rooms.db` no primeiro start;
    - reimportar o catálogo;
    - DEPLOY com o serviço Postgres no EasyPanel, `DATABASE_URL` e backup com `pg_dump`.
  - Verificação:
    - uma sala salva no SQLite abre depois da migração;
    - rodar duas vezes não duplica nada;
    - sem `DATABASE_URL`, o servidor sobe com PGlite.
  - Feito:
    - `importLegacyRooms` copia as salas do `rooms.db` uma vez, marcada em `catalog_meta`, sem tocar no arquivo antigo;
    - o catálogo é reimportado do Scryfall;
    - **decisão:** sem `DATABASE_URL` (PGlite), o catálogo próprio fica desligado, a não ser que `CATALOG=on`, porque
      o PGlite precisa de cerca de 2 GB para o catálogo inteiro (medido: cerca de 1,8 GB, igual com ou sem lotes);
    - o DEPLOY explica o Postgres no EasyPanel, a `DATABASE_URL` interna, a mudança de SQLite e o backup.
  - Verificado: o servidor real sobe no PGlite, copia as salas antigas e responde no `/api/health`.

## Onda 1 — Conta
- [x] **T8.4 — OAuth (Discord e Google) com PKCE, sessão por cookie** _(req: 5–8)_ · depende de T8.1
  - Verificação:
    - `state` errado é recusado;
    - o callback só redireciona para o próprio site;
    - o cookie sai com `HttpOnly`/`Secure`/`SameSite=Lax`;
    - nenhum token do provedor é guardado;
    - provedor sem chaves fica desligado;
    - ligar o segundo provedor na mesma conta funciona.
  - Testes: provedores falsos (servidor HTTP local fazendo o papel do Discord e do Google).
  - Feito:
    - migração `0002-accounts.sql` (`app_user`, `identity`, `session`);
    - `AccountStore`, provedores com PKCE S256, cookie de estado assinado (HMAC, 10 min) e cookie de sessão
      (`HttpOnly`, `SameSite=Lax`, `Secure` com HTTPS, 30 dias renovados);
    - rotas `/api/auth/providers`, `/start`, `/callback`, `/api/me` e `/api/auth/logout`;
    - login ligado só com `PUBLIC_URL`, `SESSION_SECRET` e as chaves de pelo menos um provedor;
    - `APP_URL` separado de `PUBLIC_URL` para o app de desenvolvimento em outra porta;
    - avatar aceito só dos hosts do Discord e do Google, e nome de exibição limpo e limitado;
    - uma identidade que já é de outra conta não é ligada (`conta-em-uso`), e nada é mesclado sem querer;
    - testes rodam no PGlite e no Postgres real.
- [x] **T8.5 — Sair, excluir conta, exportar dados** _(req: 9, 10)_ · depende de T8.4
  - Verificação:
    - excluir apaga conta, sessões e nuvem e anonimiza o histórico;
    - a exportação traz decks, presets e partidas;
    - fazem as duas coisas só com sessão e mesma origem.
  - Feito:
    - `DELETE /api/me` exige sessão, a mesma origem e `{ "confirm": "excluir minha conta" }`, apaga a conta (as
      identidades e as sessões de todos os aparelhos caem junto) e limpa o cookie;
    - `GET /api/me/export` baixa um JSON com conta, provedores ligados e sessões; exige sessão (é um download por
      navegação, então não exige a mesma origem; outro site não consegue ler a resposta);
    - "partes da conta" (`AccountStore.register`): decks na nuvem (T8.7) e histórico (T8.10) entram na exportação e
      na exclusão sem mexer aqui; o histórico vai registrar uma exclusão que anonimiza em vez de apagar.
- [x] **T8.6 — Web: "Entrar", menu da conta, tela "Minha conta"** _(req: 5, 9, 10)_ · depende de T8.4
  - Verificação:
    - sem chaves no servidor, nada de login aparece;
    - com chaves, o fluxo funciona no navegador;
    - excluir pede confirmação digitada.
  - Feito:
    - `AccountClient` (provedores, conta, sair, excluir, links de entrar e de exportar), que valida o que vem do
      servidor (avatar só dos hosts dos provedores);
    - "Entrar" e o menu da conta no canto da barra, que somem quando o servidor não tem login ou não responde;
    - tela "Minha conta" em `#/conta`, com as mensagens de erro do login (`?erro=`);
    - a CSP libera as fotos de perfil do Discord e do Google.
  - Verificado no navegador, com um provedor falso que aprova na hora e o servidor real:
    - entrar pelo Discord e voltar logado em `#/conta` (com o cookie entre as portas do desenvolvimento);
    - ligar o Google na mesma conta;
    - a mensagem de erro do provedor aparece certa;
    - excluir a conta com a confirmação digitada e voltar ao estado sem conta.

## Onda 2 — Nuvem
- [x] **T8.7 — API de sincronização com "última escrita vence" e marcas de exclusão** _(req: 11, 13–15)_ · depende de T8.4
  - Verificação:
    - `409` com a versão do servidor quando a dele é mais nova;
    - limites de quantidade e tamanho;
    - data no futuro limitada;
    - fitness "última escrita vence".
  - Feito:
    - migração `0003-cloud.sql` com uma tabela `cloud_doc` para decks e presets;
    - `updated_at` é a hora da edição no aparelho (limitada a 5 min no futuro); `changed_at` é a hora do servidor e
      serve para o "o que mudou desde", para um relógio errado nunca esconder mudanças;
    - a escrita é numa transação com `FOR UPDATE`, então dois aparelhos não ganham ao mesmo tempo;
    - o tipo `Deck` e o `sanitizeDeck` foram para o `formats`, e o servidor valida decks e presets como o app;
    - a nuvem entra na exportação e na exclusão da conta pelas "partes da conta".
- [x] **T8.8 — Repositórios de nuvem no app, primeiro login e sair** _(req: 11–13, 16)_ · depende de T8.7
  - Verificação:
    - o app abre e edita sem rede (cache local) e sincroniza quando a rede volta;
    - o primeiro login sobe os decks locais;
    - o aviso de versão descartada aparece;
    - sair pergunta se mantém a cópia local.
  - Critério de aceite: o deck criado no computador aparece no tablet e volta editado.
  - Feito:
    - `CloudSync`: o navegador continua sendo o cache (IndexedDB e localStorage); a nuvem é sincronizada por cima,
      sem travar nada quando a rede cai;
    - cada sincronização baixa o que mudou desde a última (`since`) e depois sobe as edições pendentes; um `409`
      adota a versão do servidor, e uma edição local mais antiga descartada mostra um aviso;
    - `CloudDeckRepository` e `CloudPresetRepository` envolvem os repositórios locais e avisam a sincronização a cada
      salvar ou excluir (com espera curta para juntar edições seguidas); presets ganham a hora da edição;
    - sincroniza ao entrar, a cada 2 minutos e quando a janela volta ao foco; as listas abertas recarregam quando
      chega algo novo;
    - "Sair" pergunta se mantém uma cópia neste navegador ou apaga daqui (a nuvem fica intacta).
  - Testes: uma nuvem falsa com a mesma regra do servidor e dois aparelhos simulados (primeiro login, outro
    aparelho, edição offline que perde e que ganha, exclusão, sair mantendo ou limpando).

## Onda 3 — Salas e histórico
- [x] **T8.9 — Conta ligada ao lugar nas salas** _(req: 17)_ · depende de T8.4
  - Verificação:
    - com a mesma conta, outro aparelho volta ao mesmo lugar;
    - sem conta, nada muda;
    - o RoomCore recebe só o `userId` opaco.
  - Feito:
    - o servidor lê a sessão no `upgrade` do WebSocket e no `POST /api/rooms` e passa ao RoomCore só o id da conta;
    - o `Member` guarda o `userId`, que nunca sai no lobby;
    - no `hello`, o token da sala vale primeiro; a conta encontra o lugar quando o aparelho não tem token, ou quando
      o token dele é de um membro parado (sem lugar e sem ser o anfitrião);
    - um membro que entrou por token fica ligado à primeira conta com que volta;
    - quem cria a sala logado é anfitrião em qualquer aparelho com a mesma conta;
    - o app manda o cookie ao criar a sala; o WebSocket já manda sozinho.
  - Decisão: o servidor guarda só o hash do token, então não dá para "devolver o mesmo token". A conta passa a ser
    a credencial da sala para aquele lugar, sem emitir um token novo.
- [ ] **T8.10 — Histórico de partidas e "Minhas partidas"** _(req: 18, 19)_ · depende de T8.2, T8.9
  - Verificação:
    - uma partida online entre duas contas aparece para as duas, com o resultado certo;
    - partidas sem conta também são gravadas (sem vínculo);
    - a listagem é paginada.

## Fechamento
- [ ] **T8.11 — Revisão de segurança e privacidade**
  - Escopo:
    - OAuth, cookies, CSRF e rate limits;
    - fitness "nada de segredo no cliente";
    - texto de privacidade no Sobre e no LEGAL.md (o que é guardado, por quê, como apagar).
- [ ] **T8.12 — README, DEPLOY (criar os apps OAuth no Discord e no Google, passo a passo) e roadmap**

## Estratégia de testes
- Os stores e as rotas rodam no PGlite em memória, o mesmo SQL do Postgres. Com `TEST_DATABASE_URL`, rodam também num
  Postgres real.
- O OAuth é testado com provedores falsos locais. Nunca há chamadas reais ao Discord ou ao Google nos testes.
- A sincronização tem testes de propriedade com dois clientes simulados.
- Na web, o fluxo de login e a sincronização são conferidos no navegador com um provedor falso em desenvolvimento.
