# Design — 08 · Contas opcionais e nuvem (fase 3b)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| clean-architecture | Trocar de banco sem mexer no domínio | Portas assíncronas (`RoomStore`, `CatalogStore`, `AccountStore`, `CloudStore`); o RoomCore continua puro e síncrono |
| security | Login, sessão e dados de usuários | OAuth com `state` + PKCE, cookie `HttpOnly`/`Secure`/`SameSite=Lax`, segredos só no ambiente, dados mínimos |
| data-architectures | Sincronização entre aparelhos | Última escrita vence por documento, marcas de exclusão, `updatedAt` vindo do cliente e validado |
| evolutionary-architecture | Banco novo em produção | Migrações versionadas e transferência dos dados antigos no primeiro start; fitness de "o mesmo teste roda nos dois bancos" |

## Visão geral
```
Navegador ──(cookie de sessão)──► /api/auth/*  ──► Discord / Google (OAuth + PKCE)
   │                               /api/me, /api/sync, /api/decks, /api/presets, /api/games
   │  IndexedDB/localStorage = cache local (e único lugar, sem login)
   ▼
Servidor (container único) ── Db (porta) ──► Postgres (produção, DATABASE_URL)
                                         └─► PGlite (desenvolvimento e testes, arquivo no /data)
```

## Banco
### Porta `Db`
```ts
interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}
```
Há dois adaptadores:
- `PgDb`, sobre o pacote `postgres`: pool pequeno (5), timeouts e `ssl` opcional por variável;
- `PgliteDb`, sobre `@electric-sql/pglite`, persistido em `dirname(DB_PATH)/pg` ou em memória nos testes.

Os dois falam o mesmo SQL, já que o PGlite é Postgres.

### Migrações
- Ficam em `apps/server/migrations/NNNN-nome.sql` e são aplicadas em ordem no start, cada uma na sua transação.
- A tabela `schema_migration(id, applied_at)` registra o que já rodou.
- Uma migração aplicada nunca é editada: muda-se o schema com uma nova.

### Schema
```sql
-- salas (o snapshot continua JSON: o RoomCore é a fonte da forma)
room(id text primary key, snapshot jsonb not null, last_active timestamptz not null)

-- catálogo (mesmas tabelas do épico 01, com jsonb e índices)
card_current, oracle_version, legality_version, game_changer_version, import_run, catalog_meta

-- contas
app_user(id uuid primary key, display_name text not null, avatar_url text, created_at timestamptz, deleted_at timestamptz)
identity(provider text, provider_user_id text, user_id uuid references app_user, primary key (provider, provider_user_id))
session(id_hash text primary key, user_id uuid references app_user on delete cascade, created_at, expires_at, last_seen)

-- nuvem
cloud_deck(user_id uuid, id text, data jsonb, updated_at timestamptz, deleted boolean, primary key (user_id, id))
cloud_preset(user_id uuid, id text, data jsonb, updated_at timestamptz, deleted boolean, primary key (user_id, id))

-- histórico
game(id uuid primary key, room_id text, started_at, ended_at, preset jsonb, initial jsonb, actions jsonb, winners text[])
game_player(game_id uuid references game on delete cascade, seat int, player_id text, user_id uuid null,
            name text, commanders text[], lost boolean, loss_reason text)
```

### Transferência do SQLite
- No start, a migração de dados roda uma vez só, marcada em `catalog_meta`.
- Se `rooms.db` existir no volume e a tabela `room` estiver vazia, as salas são copiadas, com os snapshots já
  migrados pelo `migrateState`.
- O catálogo não é copiado: o import roda do zero (cerca de 15 s) e reaplica `history/commander.json`.
- Os arquivos SQLite antigos ficam no volume até uma versão seguinte, para dar margem de volta.

### Stores assíncronos e o RoomCore
- `RoomStore` e `CatalogStore` viram assíncronos.
- O **RoomCore continua puro e síncrono**. Quem faz I/O é o `server.ts`, que:
  1. carrega a sala (assíncrono) antes de entregar mensagens;
  2. no `sit`, resolve o deck no catálogo **antes** de chamar a sala e entrega à sala um deck já com regras e uma
     lista de violações. As deps `checkDeck` e `cardRules` passam a receber dados prontos, sem I/O;
  3. depois de cada mensagem, salva o snapshot (assíncrono, em fila por sala, para não gravar fora de ordem).
- A importação do catálogo grava em lotes de 1000 cartas com `INSERT … ON CONFLICT`, numa transação.

## Login
### Fluxo (Discord e Google, OAuth 2.0 Authorization Code + PKCE)
1. `GET /api/auth/:provider/start`:
   - gera `state` e `code_verifier`;
   - guarda os dois num cookie curto, assinado e `HttpOnly` (10 min);
   - redireciona ao provedor com `code_challenge` e escopo mínimo: `identify` no Discord, `openid profile` no Google.
2. `GET /api/auth/:provider/callback`:
   - confere o `state`;
   - troca o `code` pelo token com o `code_verifier`;
   - lê o perfil (id, nome, avatar);
   - **descarta o token do provedor**;
   - acha ou cria `identity` e `app_user` (ou liga a identidade à conta já logada);
   - cria a sessão e redireciona para `/#/conta`.
3. `POST /api/auth/logout` apaga a sessão. `DELETE /api/me` exclui a conta (req. 9). `GET /api/me/export` devolve o
   JSON (req. 10).

### Configuração
- **Segredos:** `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` e `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- **Endereço público:** `PUBLIC_URL`, para montar o callback.
- **Assinatura de cookies:** `SESSION_SECRET`.
- Um provedor sem variáveis fica desligado, e o botão dele some (`GET /api/auth/providers`).

### Sessão
- O cookie `gh_session` leva um id aleatório de 32 bytes; o banco guarda só o sha256 (como nos tokens de sala).
- A validade é de 30 dias. `last_seen` é atualizado no máximo uma vez por hora, e a validade se renova com o uso.
- As rotas que mudam dados exigem a sessão **e** a mesma origem (a regra de origem que já existe).
  `SameSite=Lax` cobre o resto do CSRF.
- O rate limit usa o `WindowLimiter` existente: 20 inícios de login por minuto por IP e 120 chamadas de nuvem por
  minuto por usuário.

## Nuvem
### API
- `GET /api/sync?since=<iso>` → `{ decks: Doc[], presets: Doc[], now }`, onde `Doc = { id, data | null, updatedAt, deleted }`.
- `PUT /api/decks/:id` `{ data, updatedAt }` → `200 { doc }`:
  - aceita quando `updatedAt` é mais novo que o guardado (última escrita vence);
  - responde `409 { doc }` com a versão do servidor quando a dele é mais nova.
- `DELETE /api/decks/:id` `{ updatedAt }` grava a marca de exclusão com a mesma regra.
- As rotas `/api/presets` funcionam igual.

Validação:
- os decks passam pelo mesmo validador do IndexedDB (`repository.ts`, que vira compartilhado);
- os presets passam pelo `presetCodec`;
- limites do req. 15;
- um `updatedAt` mais de 5 minutos no futuro vira "agora", para um relógio errado não dominar.

### Cliente
- `CloudDeckRepository implements DeckRepository` (e o mesmo para presets) envolve o repositório local:
  - **lê do local**, sem esperar a rede;
  - **grava no local e enfileira** o envio;
  - **sincroniza** ao abrir o app, ao voltar o foco e a cada 2 minutos.
- Um `409` atualiza o local com a versão do servidor e mostra o aviso do req. 13.
- **Primeiro login:** sobe tudo o que o local tem e a conta não tem; conflitos seguem a mesma regra.
- **Sair:** pergunta "manter uma cópia neste navegador?" (req. 16).
- O `Services` do App ganha `account` (estado da sessão) e troca o repositório conforme a sessão.

## Salas e histórico
- No `hello`, se a conexão tem sessão, o servidor anexa o `userId`. O RoomCore guarda `userId` no `Member`, como dado
  opaco: o núcleo continua sem saber de contas.
- Voltar com a mesma conta de outro aparelho encontra o membro pelo `userId` e devolve o mesmo token de sala.
- No fim da partida (`status: ended`), o servidor grava `game` e `game_player` a partir do snapshot: estado inicial,
  ações, sentados e resultado. Isso é assíncrono e não bloqueia a sala.
- Tela "Minhas partidas" (`GET /api/games?cursor=`, paginada): data, mesa, comandantes e vitória ou derrota.

## Web
- O topo ganha um botão "Entrar", que abre a escolha do provedor, ou, com sessão, o avatar com um menu (Minha conta,
  Minhas partidas, Sair).
- A tela "Minha conta" mostra os provedores ligados, os botões "Ligar Google/Discord", "Baixar meus dados" e
  "Excluir conta" (com confirmação digitada) e o estado da sincronização.
- A CSP passa a permitir só as imagens de avatar dos provedores (`cdn.discordapp.com` e
  `lh3.googleusercontent.com`). O login é por redirecionamento, sem scripts de terceiros.

## Fitness functions novas
1. **Mesmo comportamento nos dois bancos:** a suíte de stores roda contra o PGlite e, quando `TEST_DATABASE_URL`
   existir, contra um Postgres real (CI pode ligar depois).
2. **Núcleo sem I/O:** `room/room.ts` continua sem importar stores, banco ou rede (teste que varre imports).
3. **Nada de segredo no cliente:** o build da web não contém `CLIENT_SECRET` nem `SESSION_SECRET` (teste de varredura
   do `dist`).
4. **Última escrita vence:** em sequências aleatórias de gravações de dois "aparelhos", o servidor termina com a versão
   de maior `updatedAt`, e os dois clientes convergem.

## Riscos e mitigações
- **Postgres a mais para operar.** O PGlite cobre o desenvolvimento, o DEPLOY explica o serviço no EasyPanel, e o
  backup é o `pg_dump` agendado (passo a passo no DEPLOY).
- **Migração em produção dar errado.** Os SQLite antigos ficam no volume, a transferência é idempotente, e sem
  `DATABASE_URL` o servidor sobe com PGlite.
- **Configurar OAuth é fora do código.** O passo a passo com prints vai no DEPLOY. Sem as chaves, o jogo funciona e
  só o botão de login some.
- **Relógios diferentes entre aparelhos na última escrita vence.** O servidor limita datas no futuro, e o aviso de
  versão descartada deixa claro o que aconteceu.
