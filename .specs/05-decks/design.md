# Design — 05 · Decks (fase 2a)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| ux-design | O editor é usado com frequência e deve ser rápido | Fogg B=MAP: adicionar a 1 clique ou Enter; feedback imediato (curva e validação ao vivo); defaults sensatos (filtro de identidade ligado) |
| domain-driven-design | Supporting subdomain | Transaction script simples; o deck referencia cartas por id (`oracleId`), não copia dados |
| clean-architecture | Armazenamento e Scryfall são detalhes | Portas `DeckRepository` e `CatalogPort`; o editor não conhece IndexedDB nem Scryfall |
| secure-coding | Busca e importação são input externo | Limites, allowlist de host, render só como texto |
| dataviz | Curva de mana e cores | Gráfico simples e acessível, consistente com os tokens do app |

## Estrutura (`apps/web/src`)
```
decks/
  model.ts              Deck, DeckCard, estatísticas (puras)
  repository.ts         DeckRepository (porta) + IndexedDbDeckRepository (adaptador) + versão de schema
  importExport.ts       texto → Deck (usa parseDecklist + catálogo) / Deck → texto
  parseDecklist.ts      (já existe)
  samples.ts            (já existe)
catalog/
  catalog.ts            CatalogPort ganha: search, autocomplete, printings, facts (CardFacts do épico 04)
  scryfall.ts           adaptador estendido (search, autocomplete, prints) + rate limiter compartilhado
screens/
  DeckLibraryScreen.tsx lista de decks
  DeckEditorScreen.tsx  busca | lista do deck por tipo | painel (stats, validação, bracket)
  SetupScreen.tsx       seletor por lugar: deck salvo / exemplo / colar
```

## Modelo
```ts
DeckCard { oracleId: string; scryfallId?: string; name: string; count: number }
Deck {
  schemaVersion: 1, id, name, presetId?: string,
  commanders: DeckCard[], cards: DeckCard[], createdAt, updatedAt
}
```
- O deck guarda só **referências e nomes**. Os dados (tipo, custo, cores, imagem) vêm do cache do catálogo pelo
  `oracleId`. Não duplicamos dados da Wizards no armazenamento do usuário além do necessário.
- `deckStats(deck, facts)` é pura: curva por valor de mana (0–7+), cores, tipos, total.

## Catálogo: porta estendida
```ts
CatalogPort {
  resolve(names)                         // já existe
  autocomplete(prefix): string[]         // GET /cards/autocomplete
  search(query, page): CardResult[]      // GET /cards/search (sintaxe Scryfall)
  printings(oracleId): Printing[]        // GET /cards/search?q=oracleid:…&unique=prints
  facts(oracleIds): CardFacts[]          // fatos para validação (do cache ou de /cards/collection)
}
```
- **Rate limiter único** para todas as chamadas: até 10 por segundo, fila e cancelamento de buscas obsoletas
  (AbortController).
- O cache do catálogo passa a guardar `CardFacts` (identidade de cor, Oracle, keywords, legalidade, Game Changer,
  valor de mana).
- Ao migrar a versão do cache, entradas antigas sem esses campos são rebuscadas.

## Armazenamento
- **IndexedDB** para os decks: aguenta muitos decks, enquanto `localStorage` tem cerca de 5 MB. Os presets continuam
  no `localStorage` (são pequenos).
- O schema é versionado (`schemaVersion`). As migrações ficam no adaptador.
- **Desfazer exclusão:** a exclusão é lógica por 10 segundos (toast com "Desfazer") e só depois vira definitiva.

## Fluxos de UX
1. **Biblioteca → Novo deck → escolher comandante** (busca com filtro `is:commander`) → o editor abre filtrado pela
   identidade de cor.
2. **Editor:**
   - Enter na busca adiciona o primeiro resultado; clique adiciona; clique direito abre a escolha de arte.
   - A lista é agrupada por tipo, com +/− por carta.
   - O painel lateral mostra curva, cores, validação (violações clicáveis, que destacam as cartas) e bracket.
3. **Testar:** goldfish de 1 lugar com o deck atual.
4. **Setup:** o seletor por lugar lista os decks salvos com indicador de validade contra o preset escolhido. Se o
   preset bloquear, o lugar fica marcado e "Começar" fica desabilitado, com o motivo (épico 04, T4.9).

## Decisões
- **ADR-05.1 — Deck referencia `oracleId`, não guarda dados de carta.** Mantém o armazenamento pequeno, sempre
  atual (errata) e alinhado ao catálogo versionado do épico 01.
- **ADR-05.2 — IndexedDB atrás de `DeckRepository`.** Quando o online chegar, entra um adaptador remoto
  (sincronização) sem mudar o editor.
- **ADR-05.3 — Exportação só em texto de lista.** Nada de PDF ou imagem para impressão, conforme a Fan Content
  Policy (sem proxies).

## Riscos
- **Rate limit do Scryfall com busca ao vivo** → debounce, cancelamento, cache de resultados por consulta e limiter
  global.
- **IndexedDB indisponível** (modo privado de alguns navegadores) → aviso e fallback em memória, sem perder a sessão.
