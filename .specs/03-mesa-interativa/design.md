# Design — 03 · Mesa interativa

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| ux-design | É o diferencial do produto | Fogg B=MAP: ações frequentes a 1 clique (virar, passar); feedback imediato; carga cognitiva baixa (o HUD mostra só o essencial); progresso visível (etapas) |
| clean-architecture | A UI é detalhe; o motor é o centro | Humble object na cena 3D; portas para catálogo e motor |
| domain-driven-design | Catálogo externo com modelo próprio | ACL: o Scryfall vira `CardRef`; o resto do app não conhece o formato do Scryfall |
| secure-coding | Decklist colada e chamadas de rede | Parser com limites, allowlist de hosts, sem HTML injetado |

## Estrutura (`apps/web/src`)
```
app/          App, roteamento simples entre telas (setup | jogo | sobre)
session/      GameSession: estado atual + histórico (undo) + dispatch + log; hooks React
catalog/      CatalogPort + ScryfallCatalog (ACL, lotes, cache)
decks/        parser de decklist + decks de exemplo
table/        cena r3f: Table, CardMesh, Piles, CameraRig (foco), layout.ts (puro)
hud/          PlayerPanels, PhaseBar, StackPanel, Hand, CardPreview, CardMenu, ZoneViewer, GameLog, Curtain, Toast
screens/      SetupScreen, GameScreen, AboutScreen
legal/        FanContentNotice
```

## Fluxo de dados
```
evento de input (3D ou DOM) ──► session.dispatch(action)
     session: reduce(state, action) ── erro ──► toast com o motivo
                                    └─ ok ──► histórico.push(state); state = novo; log += eventos
     React re-renderiza: viewFor(state, seatAtual) ──► mesa 3D + HUD
```
- **A sessão é a única que conhece o motor.** Mesa e HUD recebem uma `PlayerView` e uma função `dispatch`.
- **Undo** é por sessão: o histórico de estados imutáveis vira uma pilha. É barato porque os estados compartilham
  estrutura.
- **Seat atual**:
  - goldfish → sempre o lugar 0;
  - hot-seat → o jogador que precisa agir (decisão pendente → prioridade → ativo).

## Mesa 3D (r3f)
- **Reaproveita o que o spike validou:** câmera em perspectiva, uma geometria compartilhada, material por imagem
  (1 draw call por carta), easing em `useFrame`, sombras opcionais.
- **Layout (`layout.ts`)**, função pura `(view, seat) → posições`:
  - o lugar local fica à frente;
  - os outros, na ordem dos lugares, ficam em colunas ao fundo;
  - fileiras para criatura, outros e terreno;
  - `arrangement` sobrescreve a posição automática.
- **Pilhas:** grimório, cemitério, exílio e comando de cada jogador como montes 3D ao lado da área dele, com a
  contagem num rótulo. Clicar abre o `ZoneViewer` em DOM.
- **Foco no oponente:** o `CameraRig` tem dois alvos, visão geral e área do jogador X, e interpola entre eles.
  No foco, a câmera se aproxima até as cartas ficarem legíveis.
- **Seleção vs. arrasto vs. toque longo:** o limiar de 6 px e os 450 ms validados no spike.

## HUD (DOM)
- `PlayerPanels`: um cartão por jogador, com vida em destaque e veneno e dano de comandante em chips. O cartão do
  jogador ativo ganha borda; o de quem tem prioridade ganha um brilho.
- `PhaseBar`: as 12 etapas agrupadas em 5 fases (como no Arena), com a etapa atual destacada e o botão primário
  contextual: "Manter / Mulligan", "Passar", "Avançar".
- `StackPanel`: lateral direita, com o topo em cima e um botão "Adicionar habilidade".
- `Hand`: leque na parte de baixo, como no spike. Clique abre a ação "Jogar".
- `CardMenu`: menu contextual posicionado no ponteiro, navegável por teclado.
- `Curtain`: cobre a tela inteira no hot-seat.
- `Toast`: mensagens de erro do motor, que somem sozinhas.

## Catálogo mínimo (ACL)
```ts
interface CatalogPort { resolve(names: string[]): Promise<{ found: Map<string, CardRef & CardImages>, missing: string[] }> }
```
- **ScryfallCatalog:**
  - `POST /cards/collection` em lotes de 75, com 100 ms entre lotes;
  - para cartas dupla-face, usa `card_faces[0]`;
  - cache no `localStorage` com chave versionada e try/catch.
- Os nomes são normalizados (trim, aspas tipográficas) antes da busca.

## Parser de decklist
- Linhas `N Nome`, `Nx Nome`, `Nome`. Remove `(SET) 123`, `*F*` e `*E*`.
- Seções `Commander`/`Comandante` ou o sufixo `*CMDR*` marcam o comandante. Também ignora `Sideboard` e
  `Maybeboard`.
- Limites: até 300 linhas e até 200 caracteres por linha. Nada é interpretado como HTML.
- **Sem comandante marcado:** a tela de setup pede para escolher entre os lendários da lista.

## Decisões
- **ADR-03.1 — Estado do jogo fora do React e da cena.** A sessão guarda o estado e os componentes leem a visão
  derivada. Isso evita re-renderizar a cena a cada hover, usando stores externos como no spike.
- **ADR-03.2 — Cortina de hot-seat na UI, não no motor.** Quem vê o quê é uma questão de apresentação local.
  A segurança de verdade (online) vem de `viewFor` no servidor.
- **ADR-03.3 — Menu contextual em vez de arrastar para as pilhas na v1.** Arrastar entre 3D e DOM é frágil.
  O menu funciona igual no mouse e no toque. Arrastar para as pilhas 3D vem depois.

## Riscos
- **Legibilidade das cartas de oponentes no tablet** → foco no oponente e ampliação.
- **Rate limit do Scryfall** → lotes, intervalo e cache.
- **Muitas texturas na memória do tablet** → `small` na mesa; `large` só na ampliação.
