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

1. **Criar o serviço:** no projeto, clique em **+ Service → App**. Dê um nome, por exemplo `gathering-hall`.
2. **Source:** **GitHub**, com o repositório `LucasrsRodrigues/The-Gathering-Commander`, branch `main` e
   Build Path `/`.
3. **Build:** **Dockerfile** (o EasyPanel escolhe sozinho, porque há um `Dockerfile` na raiz).
4. **Environment:** nenhuma variável é obrigatória. As opcionais:

   | Variável | Padrão | Para quê |
   |---|---|---|
   | `ROOM_TTL_HOURS` | `24` | Horas de inatividade até a sala ser apagada |
   | `MAX_ROOMS` | `500` | Número máximo de salas ao mesmo tempo |
   | `ALLOWED_ORIGINS` | (vazio) | Outras origens que podem usar o servidor (o próprio domínio já é aceito) |
   | `CATALOG` | (ligado) | `off` desliga o catálogo próprio; o app passa a usar só o Scryfall |
   | `CATALOG_DB_PATH` | `/data/catalog.db` | Onde fica o banco do catálogo versionado |

5. **Mounts:** adicione um **Volume** com Mount Path `/data`. É onde ficam o `rooms.db`, o `catalog.db`
   (cerca de 160 MB) e, em `/data/raw`, os últimos 7 arquivos baixados do Scryfall.
6. **Domains:** adicione o seu domínio (ou use o domínio automático do EasyPanel) com **porta 8787** e HTTPS
   ligado. O WebSocket funciona pelo mesmo domínio, sem configuração extra.
7. Clique em **Deploy**. Para conferir, abra `https://seu-dominio/api/health`, que deve responder `{"ok":true,...}`.

**Se aparecer "502" ou "Not Found" do EasyPanel:**
- Em **Domains**, confira se a porta é **8787**, e não a 80 que o EasyPanel sugere.
- Em **Deployments**, veja se o build terminou. Em **Logs**, a linha esperada é
  `The Gathering Hall server on :8787`. Se aparecer "Não foi possível abrir o banco das salas", o volume `/data`
  não está montado direito.

**Catálogo de cartas:** uns 5 segundos depois de subir, o servidor baixa o bulk "oracle-cards" do Scryfall
(cerca de 25 MB) e importa. Depois confere a cada 6 horas e só reimporta quando o Scryfall publica um arquivo novo.
O andamento aparece nos Logs, e `/api/catalog/status` mostra quantas cartas há e quando foi o último import.
Enquanto o primeiro import não termina, o app usa o Scryfall direto.

**Atualizações:** cada push na `main` pode disparar o deploy, se o auto deploy estiver ligado no EasyPanel. Se não
estiver, clique em **Deploy**. As salas em andamento continuam, porque são recarregadas do volume.

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
