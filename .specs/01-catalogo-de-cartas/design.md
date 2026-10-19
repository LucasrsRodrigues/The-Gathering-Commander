# Design — 01 · Catálogo de cartas versionado (fase 2b)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| data-architectures | Dados que mudam no tempo | Bitemporalidade simples (`valid_from`/`valid_to`), raw imutável + modelo curado, ingestão idempotente |
| domain-driven-design | Contexto genérico com fonte externa | ACL sobre o Scryfall; o modelo próprio (Oracle × Printing) não vaza o formato deles |
| evolutionary-architecture | Formato do Scryfall muda | O raw guardado permite reprocessar; fitness function de idempotência |
| clean-architecture | Ingestão e API são detalhes | Núcleo puro `diffCatalog(anterior, novo) → versões`; os adaptadores fazem I/O |

## Visão geral
```
Job diário (Cron) ──► baixa bulk do Scryfall ──► [raw: arquivo com data no armazenamento de objetos]
        │
        ▼
  normaliza (ACL) ──► diffCatalog() ──► [banco: versões com vigência]
                                                │
                     API de leitura ◄───────────┘──► CatalogPort do app / validação no servidor 07
```

## Modelo de dados (SQL)
```sql
oracle_version(oracle_id, valid_from, valid_to NULL, hash, name, type_line, oracle_text, mana_cost,
               color_identity, keywords, power, toughness, loyalty, PRIMARY KEY (oracle_id, valid_from))
printing(scryfall_id PRIMARY KEY, oracle_id, set_code, collector_number, released_at, image_small,
         image_normal, image_large, first_seen)
legality_version(oracle_id, format, status, valid_from, valid_to NULL, source)   -- 'scryfall' | URL do anúncio
game_changer_version(oracle_id, valid_from, valid_to NULL, source)
import_run(id, started_at, finished_at, bulk_updated_at, cards_seen, versions_created, status)
```
- **Consulta "na data D":** `valid_from <= D AND (valid_to IS NULL OR valid_to > D)`.
- O `hash` é calculado sobre os campos de regra normalizados. Mudanças só de arte ou de preço não criam versão.

## Ingestão
- **Bulk do Scryfall:** "oracle_cards" para as versões e "default_cards" para as impressões. A URL vem de
  `/bulk-data`, com allowlist de host.
- **Arquivos grandes** (centenas de MB): parse em streaming, em lotes de 1.000 cartas por transação.
- **Núcleo puro:** `diffCatalog(current: Map<oracleId, Version>, incoming: Card[]) → { open: Version[], close: {oracleId, validTo}[] }`.
  É testado com fixtures pequenas.
- **Arquivos de dados históricos** (`data/commander/banlist-history.json`, `game-changers-history.json`): entradas
  `{ name, status, from, to?, source }` carregadas na mesma tabela, com `source` = URL do anúncio.
- **Onde roda:**
  - Cloudflare: Cron Trigger + R2 + D1. Se o limite de memória do Worker não comportar o streaming, o job roda
    num GitHub Actions agendado que escreve no D1 pela API.
  - Servidor próprio: cron + Postgres + disco.

## API de leitura
```
GET /catalog/resolve?names=...            → CatalogCard[] (mesmo formato do adaptador atual)
GET /catalog/oracle/:oracleId?at=YYYY-MM-DD
GET /catalog/printings/:oracleId
GET /catalog/legality/commander?at=YYYY-MM-DD  → banidas + Game Changers na data
```
- Respostas com `Cache-Control` (o "atual" por 1 h, o "na data D" passada por 1 ano) e rate limit por IP.
- **No app:** `GatheringHallCatalog implements CatalogPort`, com fallback para `ScryfallCatalog` em caso de erro
  ou timeout. Imagens continuam vindo do CDN do Scryfall (allowlist já existente).

## Integração com o épico 04/07
- `Preset.deckRules.banlist` ganha um `asOf?: string` opcional. `resolvePreset` não muda; quem valida busca os
  fatos "na data" no catálogo.
- O servidor online (07) chama a validação do pacote `formats` com fatos do catálogo próprio antes de aceitar
  `sit` com deck.

## Decisões
- **ADR-01.1 — Versionar só campos de regra.** Arte, preço e impressões novas não são "mudança de carta". Isso
  evita milhares de versões inúteis.
- **ADR-01.2 — Raw imutável guardado.** Se o formato do Scryfall mudar, ou se errarmos a normalização,
  reprocessamos sem perder o histórico.
- **ADR-01.3 — Catálogo e online na mesma hospedagem.** A mesma decisão do ADR-07.1 vale aqui.

## Riscos
- **Histórico curto no começo** → arquivos de dados retroativos para banlist e Game Changers. Errata antiga fica
  fora de escopo.
- **Bulk grande demais para o runtime** → plano B com GitHub Actions agendado.
- **Mudança de formato do Scryfall** → testes do adaptador com fixtures reais e raw guardado para reprocessar.
