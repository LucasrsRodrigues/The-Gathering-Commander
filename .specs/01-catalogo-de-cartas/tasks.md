# Tasks — 01 · Catálogo de cartas versionado (fase 2b)

Começa depois do T7.4 (mesma hospedagem e mesmo pipeline de deploy).

- [x] **T1.1 — Núcleo `diffCatalog` puro + hash de campos de regra** _(req: 2, 3)_
  - Verificação: rodar duas vezes sem mudança não cria nada; uma errata simulada abre uma versão e fecha a anterior;
    mudança só de arte é ignorada.
- [x] **T1.2 — Schema do banco + migrações** _(req: 2–4)_
  - Verificação: consultas "atual" e "na data D" com dados de teste.
- [x] **T1.3 — Ingestão do bulk (streaming, lotes, raw guardado)** _(req: 1, NFR integridade)_ · depende de T1.1, T1.2
  - Verificação: importação completa em ambiente de teste; falha simulada no meio não deixa versões pela metade.
- [x] **T1.4 — Arquivos de dados históricos (banlist e Game Changers)** _(req: 9)_ · depende de T1.2
  - Verificação: cada entrada com `source`; carregamento idempotente.
- [x] **T1.5 — API de leitura + cache + rate limit** _(req: 4, 5)_ · depende de T1.3
  - Verificação: resolver 100 nomes em menos de 200 ms; "banidas na data D".
- [x] **T1.6 — `GatheringHallCatalog` no app, com fallback para o Scryfall** _(req: 6)_ · depende de T1.5
  - Verificação: com a API desligada, o app continua funcionando pelo Scryfall.
- [x] **T1.7 — Validação de deck no servidor online** _(req: 7)_ · depende de T1.5 e T7.2
  - Verificação: um deck inválido para o preset da sala não consegue sentar (ou é marcado, se o nível for `warn`).
- [x] **T1.8 — Banlist por data nos presets** _(req: 8)_ · depende de T1.5
  - Verificação: um preset com `asOf` antigo valida pela banlist daquela data.

## Desvios do design
- **Sem tabela de printings:** o catálogo guarda só o bulk "oracle-cards" (uma linha por carta). Printings e artes
  continuam vindo do Scryfall direto, que já resolve isso bem. Isso evita um bulk de ~500 MB.
- **Carta desconhecida no servidor só avisa:** se o catálogo ainda não tem uma carta (set lançado hoje), a validação
  da sala marca como aviso e não bloqueia, igual ao app.
- **Trocar as regras da sala** tira do lugar quem tiver um deck que deixou de passar; a pessoa pode sentar de novo.

## Estratégia de testes
O núcleo de diff é puro, testado com fixtures pequenas. A ingestão tem teste de integração com um bulk reduzido.
A API é testada com contrato (formato `CatalogCard`, igual ao adaptador atual).
