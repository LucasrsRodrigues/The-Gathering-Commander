# Design — 02 · Motor de regras (núcleo)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| domain-driven-design | Core subdomain com regras ricas | `GameState` como aggregate único (fronteira de consistência da partida); eventos de domínio no passado; linguagem das CR |
| clean-architecture | O motor é o anel mais interno | Nada de framework; a UI e o futuro servidor dependem dele, nunca o contrário |
| evolutionary-architecture | A automação cresce por anos | Fitness functions; extensão por novos handlers de ação (OCP) |
| secure-coding | Ações virão da rede no futuro | Validar toda ação, deny by default, visão filtrada |
| clean-code | Muita lógica de regra | Funções pequenas por ação; nomes do domínio; testes F.I.R.S.T. |

## Visão geral
```
createGame(config) ──► GameState
reduce(state, action) ──► { ok: true, state, events } | { ok: false, error }
viewFor(state, playerId) ──► PlayerView        (filtra informação oculta)
replay(initial, actions) ──► GameState          (determinismo)
```
É uma função pura no estilo reducer, com estado normalizado. Toda aleatoriedade vem de `state.rng`
(PRNG com seed). Não há relógio: o tempo de UI, como animação, fica fora do motor.

**Por que não o modelo do XMage e do Forge:** os dois bloqueiam uma thread esperando input. Aqui, o que o motor
espera vira dado: `state.pending` (decisão pendente) e `state.priority` (quem pode agir). Assim o estado pode ser
salvo, transmitido ou simulado a qualquer momento (ADR-002, ADR-003).

## Modelo de estado (resumo)
```ts
GameState {
  schemaVersion, engineVersion, ruleset: Ruleset, rng: number, nextId: number, timestamp: number,
  status: 'mulligan' | 'playing' | 'ended',
  seats: PlayerId[]                          // ordem dos lugares
  players: Record<PlayerId, PlayerState>     // vida, veneno, dano de comandante, mulligans, lost
  objects: Record<ObjectId, GameObject>      // toda carta/token da partida
  zones: Record<PlayerId, { library, hand, graveyard, exile, command: ObjectId[] }>
  battlefield: ObjectId[]
  stack: StackItem[]                         // topo = último
  turn: { number, active: PlayerId, step: Step }
  priority: { player: PlayerId, passed: PlayerId[] } | null
  pending: PendingDecision | null            // mulligan, fundo do grimório...
  winners: PlayerId[] | null
}
GameObject { id, owner, controller, card: CardRef, zone, tapped, faceDown, counters, isToken,
             isCommander, commanderCasts, arrangement?: { x, z }, timestamp }
CardRef { name, scryfallId?, oracleId?, typeLine?, imageKey? }   // ponteiro para o catálogo
```
- **Normalização:** objetos por id; as zonas guardam só listas ordenadas de ids. Mover = tirar de uma lista e pôr em
  outra. Barato e fácil de comparar.
- **`arrangement`** é uma dica de posição na mesa (o sandbox deixa arrastar livremente). Fica no estado porque, no
  online, todos precisam ver a mesma arrumação.
- **Timestamps** (CR 613.7) já existem para a fase 3 (camadas).

## Ações (comandos)
União discriminada `Action = { type, player, ... }`. Os handlers ficam em módulos por área
(`turn.ts`, `zones.ts`, `mulligan.ts`, `commander.ts`, `players.ts`). Cada handler valida e depois aplica.

| Grupo | Ações |
|---|---|
| Mulligan | `keepHand`, `mulligan`, `bottomCards` |
| Prioridade | `passPriority`, `advanceStep` (só no modo relaxed, pilha vazia, jogador ativo) |
| Zonas | `moveObject {objectId, to, position?, faceDown?}`, `draw {count}`, `mill {count}`, `shuffleLibrary` |
| Objetos | `tap`, `untap`, `turnFaceDown`/`turnFaceUp`, `addCounter {counter, delta}`, `createToken`, `setArrangement` |
| Jogador | `adjustLife {target, delta}`, `adjustPoison`, `commanderDamage {target, commanderId, amount, alsoLife}`, `concede` |
| Pilha | `putAbilityOnStack {description, sourceId?}` (manual). Para conjurar, basta mover a carta para a zona `stack` |

O pipeline de cada ação é `validate → apply → checkStateBasedActions → eventos`. As ações baseadas em estado
(derrota) rodam depois de toda ação, como no CR 704.3.

## Prioridade (CR 117)
- Depois de qualquer ação do jogador com prioridade: `priority = { player: ele, passed: [] }`.
- `passPriority`: acrescenta o jogador a `passed` e passa para o próximo vivo na ordem APNAP. Se todos os vivos
  passaram, então:
  - pilha não vazia → resolve o topo, `priority = { player: ativo, passed: [] }`;
  - pilha vazia → avança a etapa.
- **Untap e cleanup** não dão prioridade (CR 502.4, 514.3). O motor avança direto.

## Resolução manual da pilha (fase 1)
- Um objeto de carta resolve para o campo de batalha se `typeLine` tiver Artifact, Creature, Enchantment,
  Planeswalker, Land ou Battle (CR 608.3). Caso contrário, vai para o cemitério do dono.
- Um item de habilidade manual sai da pilha.
- Sem `typeLine`, o objeto vai para o campo (o sandbox permite corrigir depois).

## Visão filtrada (informação oculta)
`viewFor(state, viewer)` monta a visão assim:
- Objetos no grimório e objetos na mão de outros jogadores **não aparecem**. A visão traz só as contagens.
- Objetos virados para baixo que o viewer não controla aparecem com `card: null`.
- A ordem do grimório nunca é exposta.

A mesma regra vale para os eventos (`eventsFor`). Uma compra de outro jogador vira apenas
"jogador X comprou 1 carta". Essa é a base de segurança do online e do bot sem trapaça.

## Determinismo e replay
- O PRNG (mulberry32) guarda o seu estado em `state.rng`. O embaralhamento (Fisher-Yates) consome desse estado.
- Ids são sequenciais (`nextId`), sem `Math.random` e sem `Date.now` no motor.
- `replay(initial, actions)` = `actions.reduce(reduce)`. A fitness function compara com o estado original.

## Ruleset (parâmetros)
```ts
Ruleset { id: 'commander', version, startingLife: 40, startingHandSize: 7, maxHandSize: 7,
          commanderDamageLimit: 21, poisonLimit: 10, commanderTaxIncrement: 2,
          mulligan: 'london', freeMulligans: 1,
          autoUntap: true, autoDraw: true, autoLoss: true,
          priorityMode: 'relaxed' | 'strict', restrictToController: false }
```
Os presets e as regras da casa (épico 04) só produzem valores desse tipo. O motor não sabe de onde eles vieram.

## Fase 3 (esboço, detalhar depois)
- **Cartas como dados:** schema tipado (JSON) de habilidades, com gatilho, custo, efeito, filtro e alvo,
  versionado pelo hash do Oracle. As ideias vêm do Forge (dados) e do XMage (composição); a tipagem é nossa.
- **Biblioteca de mecânicas** ligada aos números das CR.
- **Camadas (613)** com grafo de dependência (ideia do Forge) e timestamps.
- **Efeitos de substituição (614–616)** com escolha do jogador afetado.
- **Decisões tipadas** no `pending`: escolher alvos, ordenar gatilhos, pagar mana. É o protocolo mínimo do XMage
  (UUID/boolean/string/integer/mana) com tipos.
- **Cobertura por carta:** automated / partial / manual. Cartas manuais continuam usando as ações do sandbox.

## Decisões
- **ADR-02.1 — Um único aggregate (`GameState`) por partida.** Toda regra precisa de consistência forte sobre o
  jogo inteiro (prioridade, pilha, SBA). Dividir criaria transações entre aggregates.
- **ADR-02.2 — Erros como valor (`Result`), não exceção.** Ação inválida é um caso normal (a UI mostra o motivo),
  não um defeito.
- **ADR-02.3 — Zonas como listas de ids, ordenadas do fundo para o topo.** O topo do grimório é o último elemento,
  o que torna comprar um `pop` simples.

## Riscos
- **O estado cresce com o log de eventos** → os eventos são retornados por ação, não guardados no estado. O log
  da partida fica na sessão.
- **A dica de posição (`arrangement`) mistura UI e domínio** → aceito para o sandbox compartilhado. É opcional e
  ignorada pelas regras.
