# Deploy

O jogo inteiro roda em **um único container**: o servidor Node entrega o app web, a API (`/api`) e o WebSocket
(`/ws`) na mesma origem. O `Dockerfile` na raiz do repositório já faz o build do app e do servidor.

```
navegador ──HTTPS──► proxy do EasyPanel (Traefik) ──► container :8787
                                                       ├─ /       app web (estático)
                                                       ├─ /api/*  salas, catálogo, login, nuvem, histórico
                                                       └─ /ws     WebSocket das salas
```

Salas, catálogo, contas, decks na nuvem e histórico ficam num Postgres (um serviço à parte no EasyPanel). O volume
`/data` guarda os arquivos baixados do Scryfall e, sem Postgres, um banco local.

## EasyPanel

0. **Banco (Postgres):** no mesmo projeto, clique em **+ Service → Postgres** e dê um nome, por exemplo `db`.
   Depois de criado, copie a **Internal Connection URL** (algo como `postgres://postgres:senha@projeto_db:5432/projeto`).
   Ela vai na variável `DATABASE_URL` do app (passo 4). A URL interna não sai da rede do EasyPanel e dispensa SSL.
1. **Criar o serviço:** no projeto, clique em **+ Service → App**. Dê um nome, por exemplo `gathering-hall`.
2. **Source:** **GitHub**, com o repositório `LucasrsRodrigues/The-Gathering-Commander`, branch `main` e
   Build Path `/`.
3. **Build:** **Dockerfile** (o EasyPanel escolhe sozinho, porque há um `Dockerfile` na raiz).
4. **Environment:**

   | Variável | Padrão | Para quê |
   |---|---|---|
   | `DATABASE_URL` | (vazio) | **Recomendada.** URL do Postgres (passo 0). Sem ela, o servidor usa um banco local (PGlite) no volume e deixa o catálogo próprio desligado |
   | `DATABASE_SSL` | (vazio) | `1` para exigir SSL (Postgres fora do EasyPanel) |
   | `ROOM_TTL_HOURS` | `24` | Horas de inatividade até a sala ser apagada |
   | `MAX_ROOMS` | `500` | Número máximo de salas ao mesmo tempo |
   | `ALLOWED_ORIGINS` | (vazio) | Outras origens que podem usar o servidor (o próprio domínio já é aceito) |
   | `PUBLIC_URL` | (vazio) | Endereço público do site (ex.: `https://seu-dominio`). Necessário para o login |
   | `SESSION_SECRET` | (vazio) | Segredo de 32+ caracteres para assinar cookies do login (gere com `openssl rand -base64 48`) |
   | `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | (vazio) | Liga "Entrar com Discord" (veja [Login com Discord e Google](#login-com-discord-e-google)) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | (vazio) | Liga "Entrar com Google" |
   | `CATALOG` | ligado com Postgres | `off` desliga o catálogo próprio (o app usa só o Scryfall); `on` força com PGlite (precisa de ~2 GB de memória) |

5. **Mounts:** adicione um **Volume** com Mount Path `/data`. Com Postgres, ele guarda só os últimos 7 arquivos
   baixados do Scryfall (`/data/raw`, cerca de 25 MB cada). Sem Postgres, guarda também o banco local (`/data/pg`).
6. **Domains:** adicione o seu domínio (ou use o domínio automático do EasyPanel) com **porta 8787** e HTTPS
   ligado. O WebSocket funciona pelo mesmo domínio, sem configuração extra.
7. Clique em **Deploy**. Para conferir, abra `https://seu-dominio/api/health`, que deve responder `{"ok":true,...}`.

**Se aparecer "502" ou "Not Found" do EasyPanel:**
- Em **Domains**, confira se a porta é **8787**, e não a 80 que o EasyPanel sugere.
- Em **Deployments**, veja se o build terminou. Em **Logs**, a linha esperada é
  `The Gathering Hall server on :8787 (postgres; …)`.
- "Não foi possível conectar ao Postgres": confira a `DATABASE_URL` (use a URL **interna**) e se o serviço do banco
  está no ar. "Não foi possível abrir o banco local": o volume `/data` não está montado direito.

**Mudando de SQLite para Postgres (deploys de antes de outubro de 2026):**
1. crie o Postgres (passo 0) e ponha a `DATABASE_URL` no app;
2. faça o deploy;
3. no primeiro start, o servidor copia as salas do `/data/rooms.db` antigo (os Logs dizem quantas) e reimporta o
   catálogo do Scryfall em cerca de 15 s;
4. os arquivos `rooms.db` e `catalog.db` ficam no volume, intactos, como caminho de volta. Depois de alguns dias,
   podem ser apagados.

**Backup do banco:** no serviço do Postgres no EasyPanel, aba **Backups**, agende um backup diário (o EasyPanel
guarda num destino S3 que você configura). Para um backup na mão, pelo terminal do serviço:
`pg_dump -U postgres -Fc nome_do_banco > /tmp/gathering-hall.dump`. As salas duram 24 h e o catálogo se reconstrói
sozinho, mas com as contas ligadas o banco guarda os decks dos jogadores e o histórico: aí o backup é obrigatório.

**Catálogo de cartas:** uns 5 segundos depois de subir, o servidor baixa o bulk "oracle-cards" do Scryfall
(cerca de 25 MB) e importa. Depois confere a cada 6 horas e só reimporta quando o Scryfall publica um arquivo novo.
O andamento aparece nos Logs, e `/api/catalog/status` mostra quantas cartas há e quando foi o último import.
Enquanto o primeiro import não termina, o app usa o Scryfall direto.

**Deploy automático:** o GitHub Actions publica sozinho a cada push na `main`, mas só depois que lint,
typecheck, testes e build passam. Assim, um commit quebrado não chega ao site. Para ligar:
1. No EasyPanel, abra o serviço, vá em **Deployments** e copie a **Deploy Webhook** URL.
2. No GitHub, abra o repositório e vá em **Settings → Environments → devel**. Crie lá o secret
   `EASYPANEL_DEPLOY_URL` e cole a URL como valor.
3. Deixe o **Auto Deploy** do EasyPanel desligado; senão cada push faz dois deploys, e um deles sem passar
   pelas checagens.

Sem o secret, o passo de deploy só é pulado. Para publicar na mão, clique em **Deploy** no EasyPanel. As salas em
andamento continuam, porque são recarregadas do volume.

## Login com Discord e Google
O login é **opcional** e fica desligado até haver as chaves de pelo menos um provedor. Ele precisa de três coisas
no app do EasyPanel:
- `PUBLIC_URL`: o endereço do site, exatamente como aparece no navegador, com `https://` e sem `/` no fim. Por
  exemplo, `https://the-gathering-commander-app.yexuz7.easypanel.host`;
- `SESSION_SECRET`: gere com `openssl rand -base64 48` e cole. Se trocar, todo mundo precisa entrar de novo;
- as chaves de um provedor ou dos dois (abaixo).

O endereço de retorno de cada provedor é sempre `PUBLIC_URL` + `/api/auth/<provedor>/callback`.

### Discord
1. Abra o [Discord Developer Portal](https://discord.com/developers/applications) e clique em **New Application**.
   Dê o nome que vai aparecer na tela de autorização, por exemplo "The Gathering Hall".
2. No menu **OAuth2**:
   - copie o **Client ID** para `DISCORD_CLIENT_ID`;
   - clique em **Reset Secret** e copie o valor para `DISCORD_CLIENT_SECRET`. Ele só aparece uma vez.
3. Ainda em **OAuth2 → Redirects**, clique em **Add Redirect**, cole
   `https://seu-dominio/api/auth/discord/callback` e clique em **Save Changes**.
4. Não é preciso criar bot nem mudar mais nada. O jogo pede só o escopo `identify` (id, nome e foto; sem e-mail).

### Google
1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (seletor no topo → **New Project**).
2. Abra **Google Auth Platform** (o antigo "OAuth consent screen") e clique em **Get started**:
   - **App Information:** nome do app e um e-mail de suporte;
   - **Audience:** **External**;
   - **Contact Information:** seu e-mail. Aceite os termos e clique em **Create**.
3. Em **Data Access**, não é preciso adicionar escopos: o jogo usa só `openid` e `profile`, que não precisam de
   verificação do Google.
4. Em **Audience**, clique em **Publish app** para sair do modo de teste. Em teste, só os e-mails listados como
   "test users" conseguem entrar.
5. Em **Clients → Create client**:
   - **Application type:** **Web application**;
   - **Authorized redirect URIs:** adicione `https://seu-dominio/api/auth/google/callback`. As "JavaScript origins"
     não são necessárias.
6. Clique em **Create**, copie o **Client ID** para `GOOGLE_CLIENT_ID` e o **Client secret** para
   `GOOGLE_CLIENT_SECRET`. Guarde o secret na hora: o Google pode não mostrá-lo de novo.

### Conferir
Depois do deploy:
- os Logs mostram `contas: login com discord e google`;
- `https://seu-dominio/api/auth/providers` responde a lista;
- o botão **Entrar** aparece no canto da barra do app.

Se os Logs disserem "contas: desligadas", falta o `PUBLIC_URL` ou o `SESSION_SECRET` tem menos de 32 caracteres.

**Erros comuns:**
- "redirect_uri inválido" no Discord ou `redirect_uri_mismatch` no Google: o endereço cadastrado no provedor não é
  igual a `PUBLIC_URL` + `/api/auth/<provedor>/callback`. Confira `https` e se não sobrou uma `/` no fim;
- "O login demorou demais ou veio de outra aba": o cookie do login (10 minutos) se perdeu. Isso acontece, por
  exemplo, quando o login começa num domínio e volta para outro. Use o mesmo domínio do `PUBLIC_URL`.

**Segredos:** as chaves ficam só nas variáveis do EasyPanel. Nunca vão para o repositório nem para o app no
navegador (uma fitness function confere isso). Se uma vazar, gere outra no portal do provedor e troque a variável.

## Outro host com Docker
```bash
docker build -t gathering-hall .
```

```bash
docker run -d --name gathering-hall -p 8787:8787 -v gathering-hall-data:/data --restart unless-stopped gathering-hall
```

Coloque um proxy com HTTPS na frente (Caddy, Traefik, Nginx) que repasse os headers `X-Forwarded-*`. O container
já sobe com `TRUST_PROXY=1`. Se a porta 8787 ficar exposta direto, sem proxy, defina `TRUST_PROXY=0`.

## Atualizando para o editor de decks (épico 10)
Não há variável nova:
- a migração `0005-deck-share.sql` (links públicos) roda sozinha no start;
- os decks antigos viram o formato v2 quando são lidos, no app e no servidor, sem perder nada;
- o cache de cartas do navegador (`gh-catalog-v4`) é refeito uma vez, para guardar a edição e o número de cada
  impressão;
- o import por link faz o servidor acessar `archidekt.com` e `api2.moxfield.com` por HTTPS. Se o host bloquear
  saída para a internet, libere esses dois domínios, ou o import por link fica indisponível (colar o texto continua
  funcionando);
- o Moxfield hoje recusa leitura por servidor (403): o app mostra isso e oferece colar o texto exportado de lá.

## Segurança
- **O servidor só aceita a própria origem** (e as listadas em `ALLOWED_ORIGINS`). Outros sites não conseguem abrir
  WebSocket nem criar salas.
- **Import por link e páginas públicas:**
  - só links do Archidekt e do Moxfield, com a URL da API montada pelo servidor, sem seguir redirecionamentos,
    timeout de 10 s e até 2 MB;
  - 10 importações por minuto por IP;
  - páginas públicas de deck com 120 consultas por minuto por IP, sem o id da conta.
- **Limites:** cada IP pode criar até 20 salas por hora, cada conexão pode mandar até 20 mensagens por segundo, e
  mensagens e decks têm tamanho máximo.
- **Tokens de lugar:** ficam só no navegador de cada jogador. O servidor guarda apenas o hash (SHA-256).
- **Contas opcionais:**
  - OAuth com PKCE e `state` num cookie assinado;
  - sessão em cookie `HttpOnly`/`SameSite=Lax`/`Secure`, guardada só como hash;
  - nenhum token do provedor é guardado;
  - escritas exigem a mesma origem;
  - limites de login (20 por minuto por IP), de rotas da conta (120 por minuto por IP) e de nuvem (120 por minuto
    por conta).

  O que é guardado e como apagar está no [LEGAL.md](LEGAL.md#privacidade).
- **Headers:** HTTPS com HSTS atrás do proxy, `nosniff`, `X-Frame-Options: DENY`, CSP no app.

## Desenvolvimento local
```bash
npm run dev -w @gathering-hall/server
```

```bash
npm run dev
```

O servidor sobe em `http://localhost:8787` e aceita o app de desenvolvimento (`http://localhost:5180` e
`http://localhost:5173`), configurado em `apps/web/.env`.

Para testar o login localmente, crie um app OAuth de desenvolvimento, com retorno em
`http://localhost:8787/api/auth/discord/callback`. Depois, suba o servidor com:
- `PUBLIC_URL=http://localhost:8787`;
- `APP_URL=http://localhost:5180`, para onde o navegador volta depois do login;
- um `SESSION_SECRET`;
- as chaves do provedor.

Os testes nunca chamam o Discord nem o Google: usam provedores falsos locais.

Sem `DATABASE_URL`, o servidor usa um Postgres embutido (PGlite) em `apps/server/data/pg`, sem instalar nada, e o
catálogo próprio fica desligado (o app usa o Scryfall direto). Para testar o catálogo localmente, aponte
`DATABASE_URL` para um Postgres (por exemplo, `docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16`) ou
use `CATALOG=on` (o PGlite precisa de cerca de 2 GB de memória para importar o catálogo).
