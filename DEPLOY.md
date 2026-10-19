# Deploy na VPS

O app (arquivos estáticos) e o servidor online rodam na mesma VPS, atrás do **Caddy**, que cuida do HTTPS
sozinho. O servidor guarda as salas num arquivo SQLite, num volume do Docker.

```
navegador ──HTTPS──► Caddy ─┬─ /            → app (apps/web/dist)
                            ├─ /api/*       → servidor Node :8787
                            └─ /ws          → servidor Node :8787 (WebSocket)
```

## Pré-requisitos
- Uma VPS com Docker e Docker Compose (Ubuntu 24.04 ou parecido, com 1 GB de RAM).
- Um domínio (ou subdomínio) apontando para o IP da VPS: um registro `A` para `jogo.seudominio.com`.
- Portas 80 e 443 liberadas no firewall.

## 1. Build do app com o endereço do servidor
No seu computador ou na VPS, a partir da raiz do repositório:

```bash
cp apps/web/.env.production.example apps/web/.env.production
```

Edite `apps/web/.env.production` com o seu domínio (`https://` e `wss://`). Esse endereço também entra na
Content-Security-Policy do app.

```bash
npm ci
```

```bash
npm run build -w @gathering-hall/web
```

## 2. Configurar o domínio
Em `deploy/Caddyfile`, troque `jogo.seudominio.com` pelo seu domínio.

## 3. Subir na VPS
Copie o repositório para a VPS (com `apps/web/dist` já gerado) e, na raiz:

```bash
PUBLIC_ORIGIN=https://jogo.seudominio.com docker compose -f deploy/docker-compose.yml up -d --build
```

Confira:

```bash
curl https://jogo.seudominio.com/api/health
```

## Operação
- **Logs:** `docker compose -f deploy/docker-compose.yml logs -f server`
- **Atualizar:** `git pull`, refaça o build do app (passo 1) e rode o `up -d --build` de novo. As salas em andamento
  continuam: elas são recarregadas do SQLite.
- **Backup das salas:** o volume `rooms` contém `rooms.db`. Como as salas expiram em 24 h, o backup é opcional.
- **Limites** (variáveis do serviço `server`):

  | Variável | Padrão | Efeito |
  |---|---|---|
  | `ROOM_TTL_HOURS` | 24 | Horas de inatividade antes de a sala ser apagada |
  | `MAX_ROOMS` | 500 | Número máximo de salas ao mesmo tempo |

  Além disso, cada IP pode criar até 20 salas por hora e cada conexão pode mandar até 20 mensagens por segundo.

## Segurança
- **O servidor só aceita conexões da origem definida em `PUBLIC_ORIGIN`.** Outros sites não conseguem abrir
  WebSocket nem criar salas.
- **Os tokens de lugar ficam só no navegador de cada jogador.** O servidor guarda apenas o hash (SHA-256).
- **Não há contas nem dados pessoais:** só o apelido escolhido na sala.
- **Mantenha a VPS atualizada** (`unattended-upgrades`) e o Docker em dia.

## Desenvolvimento local
```bash
npm run dev -w @gathering-hall/server
```

```bash
npm run dev
```

O servidor sobe em `http://localhost:8787` e aceita as origens `http://localhost:5180` e `http://localhost:5173`.
