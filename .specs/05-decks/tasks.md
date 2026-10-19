# Tasks — 05 · Decks (fase 2a)

- [x] **T5.1 — Modelo de deck + estatísticas puras** _(req: 4, 5)_
  - Verificação: testes de `deckStats` (curva, cores, tipos) e de identidade por `oracleId`.
- [x] **T5.2 — `DeckRepository` (IndexedDB) + migrações + fallback em memória** _(req: 8, NFR resiliência)_
  - Verificação: testes com IndexedDB simulado (fake-indexeddb): salvar, listar, excluir com desfazer, migrar
    schema.
- [x] **T5.3 — Catálogo estendido: autocomplete, busca, impressões, fatos + rate limiter** _(req: 2, 3, 5)_
  - Verificação: testes com fetch falso: limite de 10/s respeitado, busca obsoleta cancelada, `CardFacts`
    preenchidos, cache migrado.
- [x] **T5.4 — Importar e exportar texto** _(req: 6, 7)_ · depende de T5.1, T5.3
  - Verificação: lista do Moxfield → deck → texto equivalente; comandante ausente → candidatos elegíveis.
- [x] **T5.5 — Biblioteca e editor de deck (UI)** _(req: 1–4, 9)_ · depende de T5.2, T5.3, T4.3–T4.6
  - Verificação: montar 100 cartas por teclado e mouse; validação e bracket ao vivo; "Testar" abre o goldfish.
- [x] **T5.6 — Seletor de deck no setup** _(req: 10)_ · depende de T5.5
  - Verificação: os 4 lugares com decks salvos diferentes; deck inválido sinalizado conforme o preset.
- [ ] **T5.7 — Revisão de segurança e acessibilidade do editor** _(NFR)_
  - Verificação: checklist secure-coding; navegação completa por teclado; contraste AA (testes de contraste já
    existentes).

## Estratégia de testes
Lógica pura (estatísticas, import/export, repositório, catálogo) com Vitest. As telas são verificadas no navegador
com o roteiro dos critérios de aceite.

## Notas da implementação (T5.1–T5.6)
- **Desvios do design:**
  - Os fatos de carta vêm de `resolve` (por nome) e de `resolvePrintings` (por impressão). Não foi necessário um
    `facts(oracleIds)` separado.
  - O cache do catálogo continua no `localStorage` (v2, até 2.500 entradas). Se crescer demais, migrar para
    IndexedDB.
- **"Testar" (goldfish) nunca bloqueia:** mostra quantos problemas o deck tem, mas abre a mesa. Testar um deck pela
  metade é justamente o objetivo do goldfish. O bloqueio vale para "Começar partida" no setup (T4.9).
- **Setup com lista colada sem comandante:** usa o primeiro candidato elegível e avisa. O editor permite escolher
  (`commanderCandidates`).
- **Decks de exemplo conferidos contra o Scryfall:** a validação achou 3 cartas fora da identidade de cor, que
  foram trocadas. Hoje os 4 exemplos passam nas regras oficiais.
- T5.7 (revisão formal de segurança e acessibilidade do editor) ainda pendente. O código já usa o diálogo com foco
  preso, os rótulos ARIA e a allowlist de hosts da T3.13.
