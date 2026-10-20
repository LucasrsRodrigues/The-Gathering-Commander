# Design — 11 · Automação de cartas (fase 3c)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| domain-driven-design | O núcleo do jogo: o que as cartas fazem | Efeitos como dados (linguagem ubíqua: efeito, valor, filtro, alvo); o motor interpreta; nada de função dentro do estado |
| evolutionary-architecture | A cobertura cresce por anos | Peças genéricas + exceções por carta; medição de cobertura guiando cada onda; fitness "nunca automática sem entender tudo" |
| clean-architecture | Leitor, regras e interface separados | Leitor (Oracle → regras) puro no `engine`; interpretador no `reduce`; a mesa só escolhe alvos e mostra eventos |
| testing | Erro de leitura joga errado | Cada frase com teste do Oracle real; testes de propriedade (alvo ilegal anula, replay determinístico) |

## Visão geral
```
texto Oracle ──► deriveCardRules (leitor, packages/engine) ──► CardRules { …, effects, coverage }
                     ▲                                               │
packages/cards/overrides (exceções por oracleId) ─────────────────────┘
                                                                     ▼
reduce: castSpell → chooseTargets → pilha → resolveTop → applyEffects → eventos → registro / mesa
```
- O leitor roda onde as regras são feitas hoje: no app (Scryfall) e no servidor (catálogo). As duas pontas usam a
  mesma função.
- As exceções ficam num pacote novo `packages/cards`, previsto desde a visão geral. São dados por `oracleId`, nunca
  chaves de nome no motor.

## Modelo (packages/engine/src/types.ts)
```ts
// Quanto: fixo, X, força/resistência de algo, ou uma contagem.
type Value =
  | { kind: 'fixed'; n: number }
  | { kind: 'x' }                                          // o X pago
  | { kind: 'power' | 'toughness'; of: 'self' | 'target' }
  | { kind: 'count'; what: Filter; zone: 'battlefield' | 'hand' | 'graveyard' }
  | { kind: 'counters'; counter: string; of: 'self' }

// Quais: o filtro de objetos (alvos, contagens, buscas).
interface Filter {
  types?: CardType[]; notTypes?: CardType[]; subtypes?: string[]; supertypes?: Supertype[]
  controller?: 'you' | 'opponent' | 'any'; colors?: ManaColor[]; tapped?: boolean; other?: boolean
}

type TargetSpec =
  | { kind: 'object'; filter: Filter; count: number; upTo?: boolean }
  | { kind: 'player'; who: 'any' | 'opponent' }
  | { kind: 'any' }                                         // "any target": criatura, planeswalker ou jogador

type Who = 'you' | 'target' | 'each opponent' | 'each player' | 'controller of target'

type Effect =
  | { kind: 'draw'; who: Who; amount: Value }
  | { kind: 'damage'; to: 'target' | 'each opponent' | 'each creature'; amount: Value }
  | { kind: 'gainLife' | 'loseLife'; who: Who; amount: Value }
  | { kind: 'destroy' | 'exile' | 'bounce'; what: 'target' | { all: Filter } }
  | { kind: 'counters'; what: 'target' | 'self' | { each: Filter }; counter: string; amount: Value }
  | { kind: 'pump'; what: 'target' | 'self' | { each: Filter }; power: Value; toughness: Value } // até o fim do turno
  | { kind: 'token'; token: TokenDef; amount: Value; tapped?: boolean }
  | { kind: 'mill' | 'discard'; who: Who; amount: Value }
  | { kind: 'search'; filter: Filter; to: 'hand' | 'battlefield'; tapped?: boolean; amount: Value } // onda 2
  | { kind: 'scry' | 'surveil'; amount: Value }                                                     // onda 2
  | { kind: 'addMana'; produces: ManaProduction }

interface Ability { targets?: TargetSpec[]; effects: Effect[]; text: string }   // text: a frase, para o registro
interface ActivatedAbility extends Ability { cost: AbilityCost; sorcerySpeed?: boolean }
interface AbilityCost { mana?: ManaCost; tap?: boolean; sacrifice?: Filter | 'self'; discard?: number; life?: number }

CardRules {
  …                                    // o que já existe
  spell?: Ability                       // instantâneas e feitiços
  etb?: Ability[]                       // "quando entra no campo"
  activated?: ActivatedAbility[]        // onda 2
  coverage: 'automated' | 'partial' | 'manual'
  manualText?: string[]                 // as frases que ficaram com o jogador
}
ManaProduction += { kind: 'dynamic'; color: ManaType; amount: Value }   // Marwyn, Priest of Titania
```
- **Tudo é dado.** O estado continua serializável, e o replay continua sendo "o mesmo estado + as mesmas ações".
- **Fichas:** `TokenDef` com nome, tipos, P/R, cores, palavras-chave e habilidades de mana. Há Treasure, Food e Clue
  prontas; Treasure tem a habilidade de mana "{T}, sacrifique".

## Leitor (deriveRules.ts → oracle/)
- O Oracle é quebrado em frases (por linha, depois por ponto, respeitando parênteses de lembrete).
- Cada frase passa por uma **lista de padrões** (`oracle/patterns.ts`). Cada padrão:
  - reconhece uma forma de frase ("Draw N cards.", "~ deals N damage to any target.", "Destroy target
    creature.", "When ~ enters, …", "{T}: Add an amount of {G} equal to ~'s power.");
  - devolve a peça do modelo.
- O nome da carta vira `~` antes de comparar, como no próprio Oracle.
- **Frase não reconhecida** = manual. A carta é:
  - automática se todas as frases foram reconhecidas;
  - parcial se algumas foram;
  - manual se nenhuma foi.

  Frases que são só lembrete, como "(This creature can't attack…)", não contam.
- As **palavras-chave** já tratadas pelo motor (Voar, Atropelar…) contam como reconhecidas.
- **Exceções:** `packages/cards/overrides/<oracleId>.json` traz a carta inteira ou só `effects`/`activated`, com um
  comentário do nome. Um teste confere que cada exceção é válida para o modelo e que o `oracleId` existe no
  catálogo de testes.

## Motor
### Conjurar e alvos
- `castSpell` lê `rules.spell.targets`. Se houver, o motor cria a decisão pendente
  `{ kind: 'chooseTargets', player, for: StackItem, specs }`, e a ação nova `chooseTargets { targets }` a responde.
  Só depois disso a mágica vai para a pilha e os custos são pagos (ordem do CR 601.2: alvos antes de pagar).
- Os alvos válidos vêm de `legalTargets(state, spec, controller)`, pura, que a mesa usa para destacar.
- O `StackItem` passa a guardar `targets` e `abilityRef` (qual habilidade da carta), ainda como dados.

### Resolver
- `resolveTop`:
  - se o item tem habilidade automatizada e não foi marcado manual, `applyEffects(tx, item)` aplica os efeitos em
    ordem;
  - antes, refaz a checagem de alvos (ilegais são ignorados; todos ilegais anula: evento `fizzled`);
  - depois, a carta vai para o cemitério ou para o campo, como hoje.
- Cada efeito emite eventos que já existem (`lifeChanged`, `objectMoved`, `counterChanged`…) ou novos (`damageDealt`
  de efeito, `tokenCreated`), para o registro dizer o que aconteceu. As ações baseadas em estado rodam em seguida,
  como sempre.
- **"Quando entra no campo":**
  - ao entrar, cada `etb` vira um item `ability` na pilha, controlado por quem controla a permanente;
  - se tiver alvo, pede `chooseTargets` antes de entrar na pilha, e sem alvo válido a habilidade sai sem efeito
    (CR 603.3d);
  - vários gatilhos do mesmo jogador entram na ordem do texto. A ordem livre fica para a onda 3.
- **"Resolver à mão":**
  - a ação `resolveManually { stackItemId }` marca o item;
  - na resolução, só move a carta, como hoje;
  - passa pela política de exceções (online, os outros aprovam), porque muda o resultado do jogo.

### Mana variável
- `ManaProduction` ganha `dynamic`. O `plan.ts` (pagamento automático) calcula o valor na hora (a força atual da
  Marwyn, o número de Elfos para Priest of Titania), e a fonte entra no plano como as fixas.
- Gaea's Cradle e Elvish Archdruid ficam cobertas pela mesma peça (`count` com filtro).

### Habilidades ativadas (onda 2)
- O menu da carta lista `rules.activated` como "Ativar: {2}, {T}: Ganhe 1 de vida por Elfo".
- A ação `activateAbility { objectId, index, targets? }`:
  - paga o custo: mana pelo pagamento automático; {T}, sacrificar, descartar e vida direto;
  - checa as regras de tempo com a política existente;
  - põe o item na pilha.
- A busca no grimório cria a decisão `searchLibrary`, que o seletor da interface responde (só as cartas válidas são
  clicáveis) e que termina embaralhando. A vidência cria `scry`, com topo e fundo.

## Interface (apps/web)
- **Modo alvo na mesa:**
  - quando há `chooseTargets` para mim, as cartas válidas brilham na mesa 3D, e os jogadores válidos brilham nos
    painéis;
  - clicar marca o alvo, e uma faixa mostra "Escolha 1 alvo para Lightning Bolt · Confirmar · Cancelar";
  - cancelar devolve a carta para a mão sem pagar.

  Por teclado e leitor de tela, a mesma faixa lista os alvos válidos como botões.
- **Registro:** as frases vêm dos eventos, como "Lightning Bolt causou 3 de dano a Krenko" ou "Wellwisher: você ganhou
  4 de vida (4 Elfos)".
- **Prévia:** o selo de cobertura e, se for parcial, "Manual:" com as frases que ficaram com o jogador.
- **Editor:**
  - selo por carta na lista;
  - "82 de 100 automáticas" no painel de estatísticas, com o número clicável que destaca as manuais.
- **Item na pilha:** a pilha mostra "automático", e o menu do item tem "Resolver à mão".

## Medição de cobertura (apps/server)
- O import do catálogo passa a guardar `edhrec_rank`, numa coluna nova da migração 0006.
- `npm run coverage -w @gathering-hall/server` lê as cartas do catálogo por ranking, roda o leitor e imprime:
  - a porcentagem de automáticas, parciais e manuais nas top 1.000 e 5.000;
  - as 30 frases não reconhecidas mais frequentes, normalizadas (números viram N, nomes viram ~).

  É o que escolhe os padrões da onda seguinte.
- O README ganha a linha de cobertura atual.

## Decisões
- **ADR-11.1 — Efeitos como dados interpretados pelo motor.** Mantém o estado serializável, o replay determinístico
  e o servidor autoritativo. Uma função por carta quebraria as três coisas.
- **ADR-11.2 — Na dúvida, manual.** Um padrão só reconhece formas exatas. Frase com variação desconhecida fica
  manual, e a medição mostra o que vale a pena cobrir.
- **ADR-11.3 — Alvos antes de pagar (CR 601.2c).** Cancelar na escolha de alvos é seguro e não gasta mana.
- **ADR-11.4 — Exceções por `oracleId` em `packages/cards`.** O motor nunca compara nomes (fitness existente). As
  exceções são dados e passam pelo mesmo validador do modelo.
- **ADR-11.5 — "Resolver à mão" passa pela política de exceções.** É o mesmo caminho do "Fazer mesmo assim": nada
  muda o jogo sem os outros saberem.

## Fitness functions
- Nenhuma carta é automática com frase não reconhecida: para cada carta de teste, as frases reconhecidas mais as
  `manualText` cobrem o Oracle inteiro.
- O motor não compara nomes de carta (já existe, e vale para o leitor).
- Replay: uma partida com mágicas automatizadas, reaplicada do estado inicial, dá o mesmo estado final.
- Alvo ilegal: em testes de propriedade, remover o alvo antes de resolver sempre anula a mágica (todos ilegais) ou
  ignora o alvo (parte ilegal).

## Riscos
- **Erro de leitura joga errado** → padrões exatos, teste por frase com o Oracle real, "Resolver à mão" e o selo
  "parcial" deixando claro o que é manual.
- **Mudança de texto Oracle (errata)** → o leitor roda a cada import. Uma frase que deixa de casar só vira manual,
  nunca errada.
- **Interface de alvos na mesa 3D** → raycast já existe para hover e clique. Destacar é mudar o material, como o
  realce de violação. Testar no tablet junto com a medição pendente do épico 10.
- **Explosão de padrões** → a medição prioriza pelo uso real, e cada onda fecha com a meta medida, não com "todas as
  cartas".
