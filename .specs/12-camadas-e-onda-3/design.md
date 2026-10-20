# Design — 12 · Camadas e automação, onda 3 (fase 3d)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| domain-driven-design | Camadas são o coração das regras de Magic | Linguagem das regras (camada, timestamp, dependência, característica); efeitos contínuos como dados, nunca funções no estado |
| clean-architecture | 83 leituras espalhadas viram uma porta só | `characteristics()` é a única leitura; o resto do motor depende dela, não da carta impressa (fitness) |
| evolutionary-architecture | Mudança grande num motor que já joga | Primeiro trocar as leituras sem mudar resultado (todos os testes iguais), depois ligar as camadas; medição guiando o leitor |
| testing | Camadas erram em silêncio | Exemplos das próprias regras como testes; propriedade "sem efeitos contínuos = características impressas"; replay determinístico |
| software-architecture-metrics | Custo por ação | Orçamento de 2 ms por ação com 100 permanentes; cache por estado |

## Visão geral
```
carta impressa (CardRules) ─┐
efeitos contínuos ──────────┼─► characteristics(state) ─► Map<ObjectId, Characteristics>
  · estáticas das permanentes (rules.statics)              (camadas 1→7, timestamp, dependência)
  · efeitos resolvidos com duração (state.effects)               │
  · anexos (attachedTo)                                          ▼
                                       combate · mana · alvos · filtros · ações de estado · visão
```
- `layers.ts` (novo) calcula as características de todos os objetos do campo numa passada, porque dependência é
  entre efeitos, não por objeto.
- Fora do campo (mão, pilha, cemitério), as características são as impressas, mais as definidas por habilidade.

## Características (packages/engine/src/layers.ts)
```ts
interface Characteristics {
  name: string
  types: CardType[]; subtypes: string[]; supertypes: Supertype[]
  colors: ManaColor[]                   // a cor de verdade (CR 105.2), não a identidade
  keywords: Keyword[]
  abilities: AbilitySet                 // as habilidades que o objeto tem agora (estáticas, ativadas, gatilhos, mana)
  power: number | null; toughness: number | null
  controller: PlayerId
  copyOf?: ObjectId                     // camada 1, para o registro e a prévia
}

function characteristics(state: GameState): ReadonlyMap<ObjectId, Characteristics>
function charsOf(state: GameState, id: ObjectId): Characteristics
```
- **Cache:**
  - estados são imutáveis depois do `reduce`, então o cálculo fica num `WeakMap<GameState, …>`;
  - dentro de uma ação, o `Tx` guarda o cálculo e o descarta a cada escrita (`tx.object()`, `tx.battlefield()`…).
- **Base** (antes das camadas):
  - a carta impressa;
  - a cor vem do custo de mana e do indicador de cor (campo novo `colors` em `CardRules`, preenchido pelo leitor a
    partir do Scryfall);
  - o controlador base é o de hoje (`obj.controller`), definido pela zona.
- **Troca das leituras:** cada leitura atual passa a usar `charsOf`. São estas:
  - `typesOf`, `hasKeyword`, `isCreature`, `powerOf`, `toughnessOf`;
  - `matchesFilter`;
  - `obj.controller` em combate e mana;
  - os campos `power`, `toughness` e `card` da visão.

  Uma fitness proíbe ler `card.rules.{types,subtypes,supertypes,keywords,power,toughness,colors}` fora de
  `layers.ts`, `deriveRules.ts` e `cards.ts`.

## Efeitos contínuos
```ts
type Layer = 1 | 2 | 3 | 4 | 5 | 6 | '7a' | '7b' | '7c' | '7d'

interface ContinuousEffect {
  id: string
  source: ObjectId | null            // de onde vem (para "enquanto", dependências e o registro)
  timestamp: number                  // CR 613.7
  layer: Layer
  cda?: boolean                      // característica definida por habilidade (604.3): primeiro na camada
  affects: Affected
  change: Change
  until?: Duration                   // ausente = enquanto a fonte existir (estática)
}

type Affected =
  | { kind: 'self' }
  | { kind: 'attached' }                                // o que a fonte equipa ou encanta
  | { kind: 'objects'; filter: Filter }                 // "Creatures you control", "Other Elves you control"
  | { kind: 'ids'; ids: ObjectId[] }                    // travado na resolução (CR 611.2c)

type Change =
  | { kind: 'copy'; of: ObjectId }                                  // 1
  | { kind: 'control'; to: PlayerId | 'sourceController' }          // 2
  | { kind: 'addTypes' | 'setTypes'; types?: CardType[]; subtypes?: string[] }   // 4
  | { kind: 'setColors' | 'addColors'; colors: ManaColor[] }        // 5
  | { kind: 'addKeywords'; keywords: Keyword[] } | { kind: 'loseAllAbilities' }  // 6
  | { kind: 'setPT'; power: Value; toughness: Value }               // 7a (cda) ou 7b
  | { kind: 'modifyPT'; power: Value; toughness: Value }            // 7c
  | { kind: 'switchPT' }                                            // 7d

type Duration = { kind: 'endOfTurn' } | { kind: 'whileAttached' } | { kind: 'whileSourceOnBattlefield' }
```
- **De onde vêm:**
  - **estáticas:** `CardRules.statics?: StaticAbility[]` viram efeitos a cada cálculo, com o timestamp da
    permanente;
  - **efeitos resolvidos:** um `pump` "até o fim do turno" ou um "ganha voar até o fim do turno" entram em
    `state.effects`, com o timestamp da resolução e a lista de objetos travada (611.2c);
  - os `ptMods` manuais de hoje viram efeitos `modifyPT` da camada 7c (`migrateState`);
  - os marcadores +1/+1 e −1/−1 são aplicados na 7c, como manda 613.4c.
- **Algoritmo**, por camada, na ordem de 613.1. Em cada camada:
  1. separar os efeitos que ainda valem (fonte no campo, duração em vigor, objetos afetados existindo);
  2. aplicar primeiro os de característica definida por habilidade, em ordem de timestamp;
  3. para os outros, repetir até acabar:
     - entre os que faltam, escolher o de menor timestamp que não dependa de nenhum outro que falta;
     - se todos dependem de algum (ciclo), escolher o de menor timestamp (613.8b);
  4. aplicar.
- **Dependência** (613.8a), testada literalmente: A depende de B quando estão na mesma camada (ou A numa camada que
  B afeta, como tipo antes de habilidade) e aplicar B antes muda uma destas coisas:
  - se A existe;
  - em que A se aplica;
  - o que A faz.

  O teste é feito numa cópia das características parciais. São poucos efeitos por partida, então a conta é
  pequena.
- **Camada 6 tira habilidades:** quando um objeto perde as habilidades, as estáticas dele deixam de gerar efeitos
  nas camadas seguintes, mas não nas que já foram aplicadas (613.5). O algoritmo recalcula a lista de efeitos ao
  entrar em cada camada.
- **Regras do jogador:** "no maximum hand size" e "an additional land" não são características de objeto. Saem de
  `playerRules(state, player)`, calculado das mesmas estáticas.

## Anexos
- `GameObject.attachedTo?: ObjectId`. Sair do campo solta tudo o que estava anexado (o que fica no campo).
- **Equipar:**
  - é uma habilidade ativada do leitor, com o custo de "Equip {N}", só como feitiço;
  - o alvo é "criatura que você controla";
  - o efeito é `{ kind: 'attach', to: 'target' }`.
- **Aura:**
  - `CardRules.enchant?: Filter`;
  - ao lançar, o alvo é pedido como numa mágica com alvo, usando o mesmo filtro;
  - ao resolver, ela entra anexada (303.4f).
- **Ações baseadas em estado:**
  - Aura sem objeto, ou em objeto que não serve ao `enchant`: vai para o cemitério (704.5m);
  - equipamento em algo que não é criatura: solta (704.5n);
  - uma permanente nunca fica anexada a si mesma (o alvo exclui a fonte).
- **Mesa:**
  - o `layoutTable` põe a permanente anexada logo atrás do objeto, deslocada como no Arena;
  - o clique nela continua abrindo o menu dela;
  - a prévia mostra "Equipando: X" e "Encantando: Y".

## Entrar no campo com escolha ("As this enters…")
- Essas escolhas acontecem durante a mudança de zona, antes de a permanente existir no campo (614.12). São a única
  substituição desta onda, e o resto das substituições continua fora.
- **Modelo:** `CardRules.asEnters?: EnterChoice[]`:
  - `payLife` (shock lands);
  - `chooseType` (Cavern of Souls, Herald's Horn);
  - `copy` (Clone: "You may have this creature enter as a copy of…", com filtro);
  - `tappedUnless` (Condition).
- `moveObject(..., 'battlefield')` de um objeto com `asEnters` cria a decisão `enterChoice`. A resposta termina a
  entrada e só depois enfileira os gatilhos de entrar. O `tappedUnless` não pergunta nada: a condição é avaliada na
  hora. As condições:
  - controlar N ou mais terras (outras, básicas);
  - ter N ou mais oponentes;
  - controlar terra com um subtipo.
- **A escolha fica guardada:** em `GameObject.chosen?: { type?: string; copyOf?: ObjectId }`, para as estáticas que
  falam dela ("creatures of the chosen type").

## Modos
- `Ability.modes?: { min: number; max: number; options: Ability[] }`. "Choose one —" é 1..1 e "Choose one or
  more —" é 1..N, com bullets lidos frase a frase pelos padrões existentes.
- **No motor:**
  - `castSpell { modes?: number[] }`;
  - os alvos vêm na ordem dos modos escolhidos;
  - o item guarda os modos, e a resolução aplica só esses (CR 700.2).
- **Na mesa:** um painel "Escolha um" com os textos, antes da faixa de alvos.

## Contramágicas
- `Effect { kind: 'counter'; what: 'target' }`, com `TargetSpec { kind: 'object'; zone: 'stack'; filter }`. Mágicas
  na pilha já são alvos válidos desde o épico 11.
- **Na resolução:**
  - a mágica alvo vai para o cemitério do dono (701.5a) sem resolver;
  - um comandante pode voltar à zona de comando como hoje;
  - um item de habilidade sai da pilha.
- `CardRules.uncounterable?: true` ("This spell can't be countered.") faz o `counter` não ter efeito naquela mágica
  (701.5b).

## Ciclagem e habilidades na mão
- `ActivatedAbility.from?: 'battlefield' | 'hand'` (padrão: campo).
- Ciclagem:
  - custo `{ mana, discard: 'self' }`, efeito "draw a card";
  - "Cycling {N}" e as variantes com tipo ("Swampcycling", com busca) vêm do leitor de palavras-chave.
- O menu da carta na mão lista "Ciclar {2}". A ação é o `activateAbility` de sempre.

## Gatilhos
- `CardRules.triggers?: TriggeredAbility[]`:
  ```ts
  interface TriggeredAbility extends Ability {
    on: 'dies' | 'attacks' | 'upkeep' | 'endStep' | 'enters'   // enters = de outra coisa ("whenever another …")
    filter?: Filter                                            // de quem: "this", "another creature you control"
    self?: boolean                                             // "When this creature dies / attacks"
  }
  ```
  O `etb` do épico 11 continua, para "this enters".
- **Detecção:**
  - depois de cada ação, o motor olha os eventos da ação: `zoneChanged` campo→cemitério, `attackersDeclared` e
    `stepStarted`;
  - os gatilhos de todas as permanentes no campo que casam entram na fila `state.triggers` do épico 11.
- **Morrer olha para trás** (603.10): os gatilhos de quem morreu e a pergunta "era uma criatura?" usam as
  características de antes da mudança de zona. O `Tx` guarda as do último cálculo de cada objeto que sai do campo.
- **Ordem** (603.3b): quando um jogador tem dois ou mais gatilhos na fila ao mesmo tempo, a decisão `orderTriggers`
  pede a ordem. O padrão sugerido é a do texto, e um clique confirma. Depois vêm os alvos de cada um
  (`chooseTargets`, como hoje).

## "Você pode…"
- `Effect` ganha `optional?: true` (CR 603.5: a escolha é na resolução).
- **Na resolução:**
  - o interpretador para, como na busca, com a decisão `confirmOptional { text }`;
  - "Sim" aplica o efeito, "Não" pula;
  - os efeitos seguintes que dependem dele ("If you do, …") são pulados juntos (`ifYouDo` no modelo).
- **Leitor:** "you may <efeito>." e "you may <efeito>. If you do, <efeito>." Reclamation Sage e Solemn Simulacrum
  passam a ser automáticas.

## Leitor (oracle/)
- **Padrões novos:**
  - estáticas;
  - "Equip {N}";
  - "Enchant <x>";
  - "As this enters…";
  - "enters tapped unless…";
  - "Cycling {N}";
  - modos;
  - "Counter target …";
  - "can't be countered";
  - gatilhos (dies, attacks, upkeep, end step, another enters);
  - "you may".
- **Estáticas reconhecidas:**
  - "Equipped/Enchanted creature gets +N/+N [and has <palavras-chave>]";
  - "Creatures you control get…" e "Other <subtipo> creatures you control get…";
  - "<…> have <palavras-chave>";
  - "You control enchanted creature/permanent";
  - "Enchanted land is a <subtipo>" (camada 4);
  - "You have no maximum hand size";
  - "You may play an additional land on each of your turns".
- **Regra do épico 11:** na dúvida, manual. Uma estática não reconhecida deixa a carta parcial.

## Interface (apps/web)
- A visão (`ObjectView`) passa a trazer `types`, `keywords`, `colors`, `power`, `toughness`, `controller` e
  `attachedTo`, todos calculados. A mesa e a prévia leem daí.
- **Prévia:**
  - "Agora: 3/3 (impressa 2/2), Voar (das Botas)";
  - "Controlada por Ana (dona: Bia)", como já mostra;
  - "Cópia de X".
- **Painéis novos:**
  - modos;
  - escolha ao entrar: pagar vida, tipo de criatura ou o que copiar (com o modo alvo para a cópia);
  - ordem dos gatilhos (lista com ↑↓);
  - "Sim / Não".
- **Mesa:** anexos encaixados embaixo do objeto; "Equipar" e "Ciclar" no menu da carta.

## Migração e compatibilidade
- `migrateState`:
  - `ptMods` vira `state.effects` (camada 7c, até o fim do turno);
  - `effects` vazio quando não há;
  - os campos novos dos objetos são opcionais.
- `CardRules.colors` ausente: o leitor deriva do custo, o que basta para as cartas sem indicador de cor.
- Todos os testes de motor do épico 11 têm que passar sem mudar o resultado. Esse é o portão das tarefas da onda A.

## Riscos
- **A troca das 83 leituras quebra algo sutil.** Mitigação:
  - a onda A troca as leituras sem nenhum efeito contínuo e exige os mesmos resultados em todos os testes;
  - uma propriedade compara, em estados aleatórios, `charsOf` com a carta impressa.
- **Desempenho:** cache por estado, cálculo só do campo e orçamento medido no teste.
- **Dependências raras e erradas:** testes com os exemplos de 613.8. Na dúvida, o leitor não gera efeitos que mudam
  tipo ou habilidade de outros (Blood Moon e Humility entram, mas cada uma com teste).
