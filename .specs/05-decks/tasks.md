# Tasks — 05 · Decks (fase 2a)

- [ ] **T5.1 — Modelo de deck + estatísticas puras** _(req: 4, 5)_
  - Verificação: testes de `deckStats` (curva, cores, tipos) e de identidade por `oracleId`.
- [ ] **T5.2 — `DeckRepository` (IndexedDB) + migrações + fallback em memória** _(req: 8, NFR resiliência)_
  - Verificação: testes com IndexedDB simulado (fake-indexeddb): salvar, listar, excluir com desfazer, migrar
    schema.
- [ ] **T5.3 — Catálogo estendido: autocomplete, busca, impressões, fatos + rate limiter** _(req: 2, 3, 5)_
  - Verificação: testes com fetch falso: limite de 10/s respeitado, busca obsoleta cancelada, `CardFacts`
    preenchidos, cache migrado.
- [ ] **T5.4 — Importar e exportar texto** _(req: 6, 7)_ · depende de T5.1, T5.3
  - Verificação: lista do Moxfield → deck → texto equivalente; comandante ausente → candidatos elegíveis.
- [ ] **T5.5 — Biblioteca e editor de deck (UI)** _(req: 1–4, 9)_ · depende de T5.2, T5.3, T4.3–T4.6
  - Verificação: montar 100 cartas por teclado e mouse; validação e bracket ao vivo; "Testar" abre o goldfish.
- [ ] **T5.6 — Seletor de deck no setup** _(req: 10)_ · depende de T5.5
  - Verificação: os 4 lugares com decks salvos diferentes; deck inválido sinalizado conforme o preset.
- [ ] **T5.7 — Revisão de segurança e acessibilidade do editor** _(NFR)_
  - Verificação: checklist secure-coding; navegação completa por teclado; contraste AA (testes de contraste já
    existentes).

## Estratégia de testes
Lógica pura (estatísticas, import/export, repositório, catálogo) com Vitest. As telas são verificadas no navegador
com o roteiro dos critérios de aceite.
