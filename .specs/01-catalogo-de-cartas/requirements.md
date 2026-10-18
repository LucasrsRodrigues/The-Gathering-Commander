# Requirements — 01 · Catálogo de cartas (esboço, fase 2)

> Esboço. Detalhar `design.md` e `tasks.md` quando a fase 2 começar. Na fase 1 existe só o catálogo mínimo do
> épico 03 (resolver nomes no Scryfall + cache).

## Objetivo
Um catálogo de cartas **versionado no tempo**, alimentado por fontes públicas (Scryfall bulk data e MTGJSON),
que separa a carta abstrata (Oracle) das impressões e guarda o histórico de errata.

## Escopo
- **Dentro:**
  - importação diária com diff por hash;
  - Oracle Card × Printing × Faces;
  - versões de Oracle com vigência;
  - busca por nome, tipo, cores e identidade de cor;
  - rulings;
  - imagens por referência (sem redistribuir).
- **Fora:** preços, coleção pessoal, e imagens ou dumps de dados no repositório.

## Requisitos (rascunho EARS)
1. QUANDO a importação rodar, o sistema DEVE gravar o JSON bruto da fonte com data e criar uma nova versão de uma
   carta só se o hash dos campos de regra mudar.
2. O sistema DEVE identificar cada carta abstrata pelo `oracle_id` e cada impressão pelo id do Scryfall.
3. O sistema DEVE responder "qual era o texto Oracle desta carta na data D".
4. O sistema DEVE oferecer busca com tolerância a erro de digitação e em português, quando houver nome impresso
   traduzido.
5. O sistema DEVE expor o catálogo por uma porta (`CatalogPort`), para que o Scryfall seja substituível (ACL).

## Notas de design
- Postgres com colunas fixas para o essencial e JSONB para o resto, mais o JSON bruto (ver conversa de 2026-10-18).
- O XMage valida as cartas contra o MTGJSON. Faremos o mesmo para os scripts de carta da fase 3.
