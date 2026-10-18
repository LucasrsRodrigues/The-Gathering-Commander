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
- [ ] **T3.13 — Revisão de segurança e acessibilidade** _(NFR)_
  - Verificação: checklist secure-coding (input, hosts, sem HTML) e navegação por teclado no HUD.

## Estratégia de testes
Lógica (sessão, layout, parser, catálogo) com Vitest. A cena 3D é verificada manualmente no navegador,
com roteiro de aceite. Um teste e2e (Playwright) fica para depois da fase 1.

## Pendências conhecidas (v0)
- T3.13 (revisão formal de segurança e acessibilidade) ainda não foi feita.
- Sem comandante marcado na lista, o app usa o primeiro lendário encontrado em vez de perguntar (req 2).
- Arrastar da mão para a mesa e arrastar para as pilhas 3D ainda não existem: usam clique e menu (ADR-03.3).
- Desempenho em tablet real ainda não foi medido.
