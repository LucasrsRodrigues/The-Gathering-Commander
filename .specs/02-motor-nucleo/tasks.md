# Tasks — 02 · Motor de regras (núcleo)

Fase 1 em ordem de dependência. TDD: cada task começa pelos testes.

- [x] **T2.1 — Tipos e PRNG** _(req: 25)_
  - O que fazer: `types.ts` (estado, ações, eventos, erros, ruleset) e `rng.ts` (mulberry32 + shuffle).
  - Verificação: shuffle com a mesma seed dá a mesma ordem; com seeds diferentes, ordens diferentes.
- [x] **T2.2 — createGame** _(req: 1, 2)_ · depende de T2.1
  - O que fazer: monta objetos e zonas, comandantes na zona de comando, embaralha, compra as mãos, abre o mulligan.
  - Verificação: 4 jogadores × 100 cartas; mãos de 7; vida 40; mesma seed → estado idêntico.
- [x] **T2.3 — Núcleo do reduce + erros** _(req: 16)_ · depende de T2.2
  - O que fazer: despacho por tipo, validação comum (partida acabou, jogador existe, jogador perdeu), `Result`.
  - Verificação: ação inválida devolve erro e o estado de entrada continua idêntico.
- [x] **T2.4 — Mulligan London** _(req: 3, 4, 5)_ · depende de T2.3
  - Verificação: os fluxos keep, mulligan, mulligan → keep → bottom terminam iniciando o turno 1.
- [x] **T2.5 — Turno e prioridade** _(req: 6–11, 13)_ · depende de T2.4
  - Verificação: ciclo completo de turnos com 4 jogadores; untap e draw automáticos; pular a compra no 1v1;
    o modo relaxed avança direto.
- [x] **T2.6 — Zonas e ações de objeto** _(req: 12, 14, 15)_ · depende de T2.3
  - Verificação: mover, virar, contadores, tokens, comprar, moer; restrição por controlador; resolução da pilha
    por tipo.
- [x] **T2.7 — Commander: taxa, dano e retorno** _(req: 17, 18, 19)_ · depende de T2.6
  - Verificação: a taxa vira 2, depois 4; 21 de dano do mesmo comandante elimina; 21 de comandantes diferentes,
    não; evento de retorno emitido.
- [x] **T2.8 — SBA de derrota e fim de jogo** _(req: 20, 21, 22)_ · depende de T2.5
  - Verificação: vida 0, veneno 10 e concessão eliminam; o último vivo vence; a rotação pula os eliminados.
- [x] **T2.9 — Visão filtrada e eventos por jogador** _(req: 23, 24)_ · depende de T2.6
  - Verificação: teste property-based (sequências aleatórias de ações) — nenhuma visão contém carta de mão alheia
    nem de grimório.
- [x] **T2.10 — Replay e fitness functions** _(req: 25, NFR)_ · depende de todas
  - Verificação: replay de uma partida scriptada = estado original; teste de pureza de imports; teste sem nomes
    de carta.

## Estratégia de testes
- Vitest com testes unitários por handler.
- Uma partida scriptada de ponta a ponta.
- Property-based simples (gerador de ações aleatórias válidas com seed) para invariantes:
  - nenhum objeto em duas zonas;
  - o total de objetos se conserva, fora tokens;
  - não há vazamento de informação oculta;
  - o estado continua serializável.

## Pendências conhecidas
- A cobertura de testes (meta ≥ 90%) ainda não foi medida: falta configurar `@vitest/coverage-v8`.
