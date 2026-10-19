# Design — 04 · Regras e formatos (fase 2a)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| domain-driven-design | É um bounded context próprio (supporting) | Linguagem própria (formato, preset, violação, bracket); value objects imutáveis; nada de regra de deck no motor |
| clean-architecture | Validação é regra de negócio pura | Pacote puro; o catálogo entra por dados já resolvidos (DIP) |
| evolutionary-architecture | Banlists e brackets mudam várias vezes por ano | Dados datados em vez de código; fitness function contra nomes de carta |
| secure-coding | Presets importados são input não confiável | Validação de schema por allowlist e limites |

## Estrutura
```
packages/formats/            @gathering-hall/formats — puro, depende só dos tipos do engine
  src/format.ts              CommanderFormat: versões oficiais (parâmetros + regras de deck)
  src/preset.ts              Preset = formato base + overrides + níveis; resolvePreset() → { ruleset, deckRules }
  src/validate.ts            validateDeck(deck, cards, deckRules) → Violation[]
  src/rules/*.ts             uma regra por arquivo: size, singleton, commander, pairing, colorIdentity, banned
  src/bracket.ts             suggestBracket(deck, cards, lists) → { bracket, reasons }
  src/presetCodec.ts         exportar/importar preset (JSON + validação de schema)
  data/                      listas datadas (histórico), quando necessárias
```
`apps/web` passa a depender de `@gathering-hall/formats`. O motor **não** depende dele.

## Modelo
```ts
// Fatos de carta de que a validação precisa: vêm do catálogo (ACL), nunca do Scryfall direto.
CardFacts { oracleId, name, typeLine, oracleText, colorIdentity: Color[], keywords: string[],
            legalCommander: 'legal' | 'banned' | 'not_legal', gameChanger: boolean }

Enforcement = 'block' | 'warn' | 'off'
DeckRules {
  deckSize: number                       // 100
  singleton: Enforcement
  colorIdentity: Enforcement
  commanderEligibility: Enforcement
  pairing: Enforcement
  banlist: { source: 'official' | 'none' | 'custom'; extraBans: string[]; unbans: string[]; level: Enforcement }
  sizeLevel: Enforcement
}

Preset {
  id, name, createdAt,
  base: { formatId: 'commander', version: string },
  ruleset?: Partial<Ruleset>,             // overrides do motor
  deckRules?: Partial<DeckRules>,         // overrides de deck
}
resolvePreset(preset) → { ruleset: Ruleset, deckRules: DeckRules }   // oficial + overrides

Violation { rule: RuleId, level: 'block' | 'warn', message: string, cards: string[] }
```
- Os níveis `off` não geram violação. Os níveis vêm do preset, então a mesma regra pode bloquear num grupo e só
  avisar em outro.
- **Banidas na fase 2a:** `official` usa `legalCommander === 'banned'` (dado do Scryfall, sempre atual).
  `extraBans` e `unbans` são nomes normalizados definidos pelo grupo. São dados do usuário, não do código.

## Regras de deck (cada uma pura e testável)
| Regra | Fonte do dado |
|---|---|
| Tamanho | `deckSize` + quantidade de comandantes |
| Singleton | Básicos pelo `typeLine` (`Basic`). Exceções pelo Oracle: "A deck can have any number of cards named" e "up to N cards named" |
| Elegibilidade | `typeLine` com Legendary + Creature, ou Oracle "can be your commander" (CR 903.3) |
| Pareamento | `keywords`/Oracle: Partner, "Partner with X", Friends forever, "Choose a Background" + Background, "Doctor's companion" + Doctor |
| Identidade de cor | `colorIdentity` de cada carta ⊆ união dos comandantes (CR 903.4) |
| Banidas | `legalCommander`, `extraBans`, `unbans` |

Referências de design (ideias, não código):
- XMage `AbstractCommander` (todas as regras numa classe de 1.252 linhas): nós dividimos em uma regra por arquivo.
- Forge (formatos como dados).

## Bracket sugerido
`suggestBracket` devolve `{ bracket, reasons[] }` a partir de:
- quantidade de Game Changers (`gameChanger`);
- destruição em massa de terrenos;
- turnos extras.

As duas últimas são detectadas por padrões do Oracle, com listas de apoio datadas em `data/` se for necessário.
Os limiares seguem as definições oficiais de bracket, conferidas na implementação. **Combos de duas cartas ficam
de fora da 2a** (precisam de fonte de dados).

## Persistência e compartilhamento
- Os presets ficam no navegador (`localStorage`, com versão e try/catch), na porta `PresetRepository` do app web.
- **Exportar:** JSON compacto em texto, para colar no WhatsApp ou Discord.
- **Importar:** `presetCodec.decode` valida o schema:
  - tipos e chaves conhecidas (as desconhecidas são descartadas);
  - limites (vida de 1 a 999, mão de 0 a 15, `extraBans` com no máximo 200 nomes de até 200 caracteres);
  - recusa o texto inteiro se algo estiver inválido.

## Decisões
- **ADR-04.1 — Estado atual do Scryfall, histórico em dados.** Evita manter banlist e Game Changers à mão (risco de
  ficar desatualizado). O preço é depender do Scryfall para o "agora", mitigado pela ACL do catálogo.
- **ADR-04.2 — Pacote separado do motor.** Regras de construção de deck não são regras de jogo: mudam por motivos
  diferentes (CCP). O motor continua sem saber de onde vem o seu `Ruleset`.
- **ADR-04.3 — Nível por regra em vez de "modo estrito" global.** Grupos reais misturam: "identidade de cor é sagrada,
  tamanho 99 tanto faz".

## Riscos
- **Campos do Scryfall mudarem** (por exemplo, `game_changer`) → a ACL isola; testes do adaptador com JSON fixo.
- **Definições oficiais de bracket mudarem** → os limiares ficam em dados versionados, não espalhados no código.
