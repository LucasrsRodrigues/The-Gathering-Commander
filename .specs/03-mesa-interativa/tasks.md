# Tasks — 03 · Mesa interativa

Construída em paralelo com o épico 02: cada task usa só o que o motor já oferece.

- [x] **T3.1 — App shell + aviso legal** _(req: 20)_ · depende de T0.1
  - O que fazer: Vite + React + r3f em `apps/web`; telas setup, jogo e sobre; tokens de cor; `FanContentNotice`.
  - Verificação: o app abre e o aviso aparece no setup e no sobre.
- [x] **T3.2 — Catálogo Scryfall + cache** _(req: 3)_
  - Verificação: teste com fetch falso cobrindo lotes de 75, cache acertado e nomes faltantes.
- [x] **T3.3 — Parser de decklist + decks de exemplo** _(req: 2)_
  - Verificação: testes com formatos do Moxfield, Archidekt e texto simples; limites respeitados.
- [x] **T3.4 — Sessão (dispatch, histórico, undo, log, seat atual)** _(req: 15, 16, 17, 18)_ · depende de T2.3
  - Verificação: testes da sessão: undo volta exatamente; erro não altera o estado; seat atual correto.
- [x] **T3.5 — Tela de setup** _(req: 1)_ · depende de T3.2, T3.3, T2.2
  - Verificação: iniciar 4 lugares com decks de exemplo.
- [x] **T3.6 — Mesa 3D: layout, cartas, virar, arrastar, ampliar** _(req: 4–7)_ · depende de T3.4
  - Verificação: teste unitário do `layout.ts`; verificação manual no navegador.
- [x] **T3.7 — HUD: jogadores, etapas, pilha, mão** _(req: 11–14)_ · depende de T2.5
  - Verificação: passar prioridade e avançar etapas pela barra; vida, veneno e dano funcionando.
- [x] **T3.8 — Mulligan na UI** _(req: 1 / épico 02 req 4–5)_ · depende de T2.4
- [x] **T3.9 — Menu da carta + pilhas + visor de zonas** _(req: 8, 9)_ · depende de T2.6
- [x] **T3.10 — Foco no oponente** _(req: 10)_
- [x] **T3.11 — Hot-seat com cortina** _(req: 18, 19)_
- [x] **T3.12 — Log e toasts** _(req: 15, 16)_
- [x] **T3.13 — Revisão de segurança e acessibilidade** _(NFR)_
  - Verificação: checklist secure-coding (input, hosts, sem HTML) e navegação por teclado no HUD.

## Estratégia de testes
Lógica (sessão, layout, parser, catálogo) com Vitest. A cena 3D é verificada manualmente no navegador,
com roteiro de aceite. Um teste e2e (Playwright) fica para depois da fase 1.

## Pendências conhecidas (v0)
- Sem comandante marcado na lista, o app usa o primeiro lendário encontrado em vez de perguntar (req 2).
- Arrastar da mão para a mesa e arrastar para as pilhas 3D ainda não existem: usam clique e menu (ADR-03.3).
- Desempenho em tablet real ainda não foi medido.

## Revisão T3.13 — segurança e acessibilidade (2026-10-18)
Checklist da skill secure-coding (OWASP Top 10 / ASVS) aplicado às superfícies do app (entrada de
lista, rede, render, ações do motor) e revisão WCAG 2.2 AA do HUD DOM. A mesa 3D (canvas) ficou fora
do escopo de acessibilidade; o visor de zonas passou a ser a alternativa em DOM para ela.

### Segurança
| # | Achado | Correção | Teste |
|---|--------|----------|-------|
| S1 | `reduce` confiava no formato da ação: tipo desconhecido virava no-op e ainda passava a prioridade; campos com tipo errado (lista que não é array, booleanos em texto) podiam lançar exceção fora do `GameError`. | `checkShape` no início do `reduce` (tipos de ação em allowlist, ids string) e checagem de `position`, `faceDown`, `tapped`, `alsoLife` e `objectIds`. Novo erro `invalidAction`. | `engine/test/validation.test.ts` |
| S2 | Busca de ids por `record[id]` resolvia membros herdados: `player: 'constructor'` ou `objectId: 'toString'` passavam pelas checagens. Marcador `__proto__` lia `Object.prototype` (CWE-1321). | Busca só por propriedade própria (`Object.hasOwn`) em jogadores, objetos e marcadores; nomes reservados de marcador são recusados. | idem |
| S3 | Vida, veneno, dano e marcadores aceitavam qualquer inteiro (até `MAX_SAFE_INTEGER`); posições aceitavam qualquer número finito. | Limite de ±10.000 por ação, contador de marcador com teto, coordenadas em ±1.000. | idem |
| S4 | `createToken` copiava o `CardRef` inteiro vindo do cliente (campos extras e textos sem limite). | Só os campos conhecidos são copiados, cada um com 1 a 200 caracteres. | idem |
| S5 | Parser de lista: sem teto de caracteres nem de total de cartas (99 cópias × 300 linhas ≈ 30 mil objetos); aceitava caracteres de controle e de bidi override. | `MAX_CHARS` 12.000 (igual ao `maxLength` do textarea), `MAX_CARDS` 250, linhas com caracteres de controle ou bidi são recusadas, entrada que não é string é recusada. | `parseDecklist.test.ts` |
| S6 | Scryfall: URLs de imagem vindas da resposta e do cache em `localStorage` eram usadas sem checagem; o cache não era validado (qualquer script na origem pode escrevê-lo). | `catalog/hosts.ts`: allowlist exata, `https://api.scryfall.com` para a API e `https://cards.scryfall.io` para imagens (sem porta, sem credenciais). Resposta e cache passam por validação de formato (id UUID, textos com limite); cache em objeto sem protótipo e com teto de 5.000 entradas. | `scryfall.test.ts` |
| S7 | `fetch` sem opções de endurecimento. | `credentials: 'omit'`, `redirect: 'error'`, `referrerPolicy: 'no-referrer'` e timeout de 20 s. | idem |
| S8 | Sem Content-Security-Policy. | CSP em `<meta>` no `index.html`: `default-src 'self'`, scripts só da origem, estilos e fontes do Google Fonts, `img-src` com o CDN do Scryfall, `connect-src` com a API, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`. O dev server remove a meta (plugin em `vite.config.ts`), porque o HMR precisa de script inline. Verificado no build (`vite preview`): partida completa sem violações. | manual |
| S9 | Uso de `innerHTML` / `dangerouslySetInnerHTML` / `eval`. | Nenhum encontrado; todo texto vindo de fora é renderizado como nó de texto do React. | — |

### Acessibilidade
| # | Achado | Correção |
|---|--------|----------|
| A1 | Na troca de jogador (cortina), a mão do próximo jogador ficava no DOM: Tab e leitor de tela alcançavam as cartas por trás da cortina. | Mesa e HUD ficam `inert` com a cortina; a mão nem é renderizada; atalhos globais ficam desligados; a cortina é `aria-modal` e prende o foco. |
| A2 | Menu da carta: Tab saía do menu, o foco não voltava para quem o abriu, o título e os subtítulos eram lidos como itens. | Foco preso, setas com volta, Home/End, Escape fecha só o menu, o foco volta para a origem; título com `aria-hidden` e grupos com `role="group"`. |
| A3 | Visor de zonas sem `aria-modal`, sem foco preso e sem volta do foco; Escape no menu aberto por cima também fechava o visor. | `aria-modal`, foco preso, volta do foco e `closeTopmost()`: Escape fecha uma camada por vez. |
| A4 | Pelo teclado não dava para chegar ao campo de batalha, ao grimório nem à zona de comando (só pelo clique na mesa 3D). | Botões Campo e Comando no painel do jogador (o visor de zonas lista o campo por controlador) e Grimório no próprio painel, que abre o menu do grimório. |
| A5 | Itens da pilha eram `<li>` clicáveis sem foco. | Viraram botões com rótulo (topo, carta, controlador). |
| A6 | Menu de contexto da mão só abria com o botão direito; ativado pelo teclado, o menu abria no canto (0, 0). | Atalho `M` (e Shift+F10) com `aria-keyshortcuts`; `menuAnchor` posiciona o menu ao lado do elemento. |
| A7 | Rótulos pobres: "Aumentar vida" repetido em todos os painéis; vida lida só como número; carta virada ou com marcadores sem estado; seleção do fundo do grimório sem estado. | Rótulos com o nome do jogador e da fonte de dano; "Vida" para leitor de tela; `cardLabel` descreve se a carta está virada e seus marcadores; `aria-pressed` na seleção; a mão é um `role="group"`. |
| A8 | A visualização ampliada só aparecia com o mouse. | Também aparece no foco (mão, visor, pilha). |
| A9 | Espaço (ação principal) disparava em `select`, `summary` e itens de menu. | `isInteractiveTarget` ignora qualquer controle; Ctrl/Cmd+Z não age dentro de campos de texto. |
| A10 | Foco visível: os itens do menu removiam o contorno (indicador 1,14:1), e os botões em contêiner com `overflow: hidden` tinham o anel cortado. | O anel dourado (≥ 7,6:1) volta em todos, desenhado para dentro onde haveria corte. |
| A11 | Contraste: os textos já passavam AA (o pior caso era `--muted` sobre `--surface-hi`, 6,17:1), mas as bordas de controles (`--line-strong`) ficavam em cerca de 2:1. | Novo token `--control-border` (≥ 3:1, WCAG 1.4.11) em inputs, botões, steppers e segmentados; placeholder com `--muted`. O teste `ui/contrast.test.ts` lê os tokens de `index.css` e quebra se algum par cair abaixo de AA. |
| A12 | O fim de jogo não recebia foco nem era anunciado. | `role="alert"` e foco em "Nova partida". |

### Pendências que ficam
- `frame-ancestors`, HSTS e `X-Content-Type-Options` não funcionam em `<meta>`: precisam ser headers HTTP do host quando houver deploy.
- `--surface` é translúcido sobre a mesa 3D; o contraste foi medido sobre as superfícies sólidas. Uma imagem de carta clara atrás de um painel pode reduzir o contraste real.
- O canvas 3D continua sem alternativa textual própria; o caminho acessível é pelo painel e pelo visor de zonas. Mover cartas no campo com o teclado (arranjo livre) não existe.
- Falta revisar com leitor de tela real (VoiceOver/NVDA); a verificação foi por teclado e pela árvore de acessibilidade.

