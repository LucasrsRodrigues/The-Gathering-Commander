# Deploy

O jogo inteiro roda em **um único container**: o servidor Node entrega o app web, a API (`/api`) e o WebSocket
(`/ws`) na mesma origem. O `Dockerfile` na raiz do repositório já faz o build do app e do servidor.

```
navegador ──HTTPS──► proxy do EasyPanel (Traefik) ──► container :8787
                                                       ├─ /       app web (estático)
                                                       ├─ /api/*  criar sala, health
                                                       └─ /ws     WebSocket das salas
```

As salas ficam num arquivo SQLite em `/data`, que precisa ser um volume para sobreviver a novos deploys.

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
sozinho; com as contas (próxima fase), o backup passa a guardar decks de jogadores e fica obrigatório.

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

## Outro host com Docker
```bash
docker build -t gathering-hall .
```

```bash
docker run -d --name gathering-hall -p 8787:8787 -v gathering-hall-data:/data --restart unless-stopped gathering-hall
```

Coloque um proxy com HTTPS na frente (Caddy, Traefik, Nginx) que repasse os headers `X-Forwarded-*`. O container
já sobe com `TRUST_PROXY=1`. Se a porta 8787 ficar exposta direto, sem proxy, defina `TRUST_PROXY=0`.

## Segurança
- **O servidor só aceita a própria origem** (e as listadas em `ALLOWED_ORIGINS`). Outros sites não conseguem abrir
  WebSocket nem criar salas.
- **Limites:** cada IP pode criar até 20 salas por hora, cada conexão pode mandar até 20 mensagens por segundo, e
  mensagens e decks têm tamanho máximo.
- **Tokens de lugar:** ficam só no navegador de cada jogador. O servidor guarda apenas o hash (SHA-256).
- **Sem contas e sem dados pessoais:** só o apelido escolhido na sala.
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

Sem `DATABASE_URL`, o servidor usa um Postgres embutido (PGlite) em `apps/server/data/pg`, sem instalar nada, e o
catálogo próprio fica desligado (o app usa o Scryfall direto). Para testar o catálogo localmente, aponte
`DATABASE_URL` para um Postgres (por exemplo, `docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16`) ou
use `CATALOG=on` (o PGlite precisa de cerca de 2 GB de memória para importar o catálogo).
