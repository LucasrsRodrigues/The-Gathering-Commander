# Design — 09 · Regras de turno e tempo (fase 3a)

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| domain-driven-design | Regras do jogo são o domínio central | Linguagem do CR nos nomes; políticas (`timing`, `mana`, `combat`) separadas das ações |
| clean-architecture | Motor puro, texto Oracle é detalhe externo | O motor só lê `CardRules` estruturado; o parser de Oracle fica fora do `reduce` |
| evolutionary-architecture | Scripts de carta virão na 3c | Rigor por área e pedido de exceção como válvula; `CardRules` com espaço para crescer; fitness functions novas |
| security | Online com servidor autoritativo | Regras das cartas vêm do catálogo do servidor, nunca do cliente |

## Visão geral
```
Catálogo (Oracle, custo, P/T, keywords)
        │  deriveCardRules()           ← parser puro, fora do reduce
        ▼
CardRef.rules: CardRules  ──►  createGame / sit (servidor sobrescreve com o catálogo)
                                        │
                                        ▼
reduce(state, action) ── políticas: timing · mana · combat  (block | warn | off)
        │                         └─ bloqueou? → requestException → votação → ação de juiz
        ▼
turn.ts (etapas, paradas automáticas) · combat.ts (proposta de dano) · mana.ts (reserva, custo, pagamento)
        │
        ▼
stateBased.ts (dano letal, lealdade 0, resistência 0) ── eventos ── viewFor
```

## Dados das cartas: `CardRules`
Novo campo opcional em `CardRef`. A ausência significa "sem dados": a carta continua jogável, com custo manual.

```ts
interface CardRules {
  types: CardType[]            // 'land' | 'creature' | 'artifact' | 'enchantment' | 'planeswalker' | 'instant' | 'sorcery' | 'battle'
  supertypes: ('legendary' | 'basic' | 'snow')[]
  subtypes: string[]           // usados para os tipos básicos de terreno (Forest → G)
  cost: ManaCost | null        // null = sem custo (terrenos) ; { unknown: true } = símbolo não suportado
  power: number | null         // '*' vira null + flag variablePT
  toughness: number | null
  variablePT?: boolean
  loyalty: number | null
  keywords: Keyword[]          // só as que o motor entende; o resto é ignorado
  manaAbilities: ManaAbility[]
  hasUnrecognizedMana?: boolean // tem "Add" no texto, mas nenhum padrão bateu → mana declarada
  entersTapped?: boolean
  spellMana?: ManaAmount       // instantâneas/feitiços que só geram mana
  colorIdentity: Color[]
}

type Keyword = 'flash' | 'haste' | 'vigilance' | 'defender' | 'flying' | 'reach' | 'menace'
             | 'trample' | 'firstStrike' | 'doubleStrike' | 'deathtouch' | 'lifelink' | 'indestructible'

interface ManaCost {
  generic: number
  colored: Partial<Record<Color | 'C', number>>
  hybrid: [Color, Color][]      // {W/U}
  twoBrid: Color[]              // {2/W}
  phyrexian: Color[]            // {G/P}
  x: number                     // quantos {X}
  unknown?: boolean
}

interface ManaAbility {
  produces: ManaOption          // { fixed: ManaAmount } | { oneOf: Color[] } | { anyColor: true } | { commanderIdentity: true }
  extraCost?: { generic: number } // "{1}, {T}: Add {U}{B}" (Signets)
  selfDamage?: number           // terrenos de dor
  requiresTap: true
}
```

### Parser de Oracle (`packages/engine/src/deriveRules.ts`)
- É uma função pura `deriveCardRules(facts) → CardRules`, que recebe tipo, custo, texto, P/T, lealdade e keywords
  do Scryfall.
- É exportada pelo pacote, mas **não é importada** por `reduce`, `turn`, `combat` nem `mana`. Uma fitness function
  garante isso.
- É usada pelo app (`prepareSeatDeck`) e pelo servidor (`sit`).
- O parser trabalha linha a linha do texto Oracle e só reconhece frases completas. Padrões da v1, todos em inglês:

  | Padrão | Exemplos |
  |---|---|
  | `{T}: Add {G}.` / `{T}: Add {C}{C}.` | Básicos sem tipo, Sol Ring |
  | `{T}: Add {R} or {G}.` / `{T}: Add {W}, {U}, or {B}.` | Duais, tri-lands |
  | `{T}: Add one mana of any color.` | Birds of Paradise |
  | `{T}: Add one mana of any color in your commander's color identity.` | Command Tower, Arcane Signet |
  | `{N}, {T}: Add {X}{Y}.` | Signets |
  | `… Add {R} or {G}. This land deals 1 damage to you.` | Terrenos de dor (a dor só na opção colorida) |
  | `This land enters tapped.` / `… enters the battlefield tapped.` (frase sozinha) | Tap-lands |
  | Instantânea/feitiço com o texto inteiro `Add {B}{B}{B}.` | Dark Ritual |

  Qualquer outra frase com `Add {` marca `hasUnrecognizedMana`. O texto é comparado por padrões estruturais, nunca
  por nome de carta.
- Os tipos básicos na linha de tipo geram as habilidades intrínsecas (CR 305.6), mesmo sem texto.
- O Scryfall escreve o nome da própria carta no texto ("Caves of Koilos deals 1 damage to you"). Antes de comparar,
  o parser troca esse nome por um marcador, e assim os padrões não dependem de nenhum nome.

### Confiança online
- No `sit`, o servidor resolve os nomes no catálogo (épico 01) e **substitui** `card.rules` de cada carta por
  `deriveCardRules(catálogo)`.
- Carta fora do catálogo vai para `rules: undefined` (sem dados).
- Sem catálogo (`CATALOG=off`), o servidor apaga todas as `rules` do cliente. As salas passam a usar custo manual
  e o rigor de mana vira aviso. Isso é melhor do que confiar no cliente.

## Estado novo no motor
```ts
GameState {
  schemaVersion: 2
  options: { exceptionApproval: 'auto' | 'vote' }        // 'auto' no jogo local, 'vote' online
  // ...
}
PlayerState {
  manaPool: ManaPool                                     // { W, U, B, R, G, C }
  landsPlayed: number                                    // zera no início do turno do jogador
  lastTurnStarted: number                                // para o enjoo de invocação
  stops: StopSettings
  passUntil: null | 'endOfTurn' | 'myTurn'
}
GameObject {
  damage: number
  deathtouchDamage: boolean
  controlledSince: number                                // número do turno em que ficou sob este controlador
  ptMods: { power: number; toughness: number }[]         // até o fim do turno
  attacking?: { target: PlayerId | ObjectId }
  blocking?: ObjectId
}
TurnState { ...; combat: CombatState | null; firstStrikeDealt: boolean }
Ruleset {
  ...;
  landsPerTurn: number                                   // 1
  timingRules: RuleLevel; manaRules: RuleLevel; combatRules: RuleLevel // 'block' | 'warn' | 'off'
}
PendingDecision |=
  | { kind: 'declareBlockers'; players: PlayerId[] }     // atacados que ainda não declararam
  | { kind: 'confirmDamage'; player: PlayerId; proposal: DamageProposal }
  | { kind: 'discard'; player: PlayerId; count: number }
  | { kind: 'chooseManaColor'; player: PlayerId; objectId: ObjectId; options: ManaColor[] }
  | { kind: 'exception'; requester: PlayerId; action: Action; reason: string; approvals: PlayerId[] }
```
- `RuleLevel` passa a existir no motor. `formats` reaproveita como `Enforcement` (mesmo literal).
- `schemaVersion: 2`, com migração `migrateState(v1) → v2`:
  - os campos novos recebem valores neutros;
  - os três níveis viram `off` (req. 39).
  - O `SqliteRoomStore` migra na leitura.

## Ações novas
| Ação | Política | Observação |
|---|---|---|
| `playLand { objectId }` | timing | Da mão (ou da zona de comando, se um dia houver) para o campo; aplica `entersTapped` |
| `castSpell { objectId, x?, payWith?: ManaActivation[] }` | timing + mana | Ativa as fontes em `payWith`, calcula o custo (com a taxa), paga da reserva e põe na pilha. É atômica |
| `activateMana { objectId, abilityIndex, color? }` | mana | Vira a fonte e põe a mana na reserva. Sem `color` numa opção múltipla, abre `chooseManaColor` |
| `declareMana { objectId, mana }` | mana | Só para fonte com `hasUnrecognizedMana`; vira a fonte e registra "mana declarada" |
| `declareAttackers { attacks: { attacker, target }[] }` | combat | Só o jogador ativo, na etapa `declareAttackers` |
| `declareBlockers { blocks: { blocker, attacker }[] }` | combat | Um por jogador atacado |
| `assignDamage { proposal }` | combat | Ajuste e confirmação da proposta pelo jogador ativo |
| `discard { objectIds }` | — | Responde ao `discard` pendente |
| `adjustPT { objectId, power, toughness }` | livre | Até o fim do turno; vai para o log |
| `setStops { stops }` / `passUntil { until }` | livre | Preferência do próprio jogador |
| `requestException { action, reason }` | — | Vale para qualquer ação que uma política bloqueou |
| `answerException { approve }` / `cancelException` | — | Votação; `cancelException` só para quem pediu |

**Movimento manual com rigor de tempo estrito:** `moveObject` de mão/comando para campo ou pilha devolve
`useCastOrPlay`, uma mensagem que aponta para "jogar terreno", "lançar" ou "pedir exceção". Os outros movimentos
continuam livres (req. 6).

## Políticas
Cada ação passa por `checkPolicies(state, action) → Finding[]`. Uma finding tem `area`, `code` e `message`.

| `level` da área | O que acontece |
|---|---|
| `block` | O `reduce` devolve o erro `ruleBlocked` com as findings, e a UI oferece o pedido de exceção |
| `warn` | A ação acontece e emite o evento `ruleBent { area, code, message }`, que entra no log |
| `off` | A área não é checada |

A exceção aprovada aplica a ação **pulando as políticas** e emite `judgeAction { requester, action, reason }`.
Se a ação falhar por outro motivo (objeto sumiu, por exemplo), o pedido é encerrado com erro e nada muda.

**Timing:**
- terreno: jogador ativo, fase principal, pilha vazia e `landsPlayed < landsPerTurn`;
- feitiço: além disso, prioridade;
- instantânea ou Flash: só prioridade.

**Mana:**
- `costOf(card, x, tax)`;
- `canPay(pool, cost)` usa um matching simples:
  1. paga as coloridas;
  2. paga as híbridas pela cor que sobrar;
  3. paga as phyrexianas com mana ou com 2 de vida (prefere mana);
  4. paga o genérico com o que restar.
- Custo `unknown` ou carta sem dados vira custo manual: não cobra e emite `ruleBent` com `manualCost`.

**Combat:** as validações dos requisitos 18 e 19.

## Pagamento automático (`planPayment`)
- `planPayment(state, player, cost) → ManaActivation[] | null` é pura, exportada para a UI e para o bot.
- Escolhe as fontes virando primeiro as menos flexíveis: cor fixa antes de "qualquer cor" e terreno antes de
  artefato.
- Respeita o enjoo de invocação e o custo extra dos Signets.
- É uma busca gulosa com backtracking limitado: 30 fontes cabem com folga nos 5 ms.
- A UI mostra as fontes destacadas. O jogador confirma, e a UI manda `castSpell { payWith }`.

## Combate (`combat.ts`)
1. **`beginCombat`:** prioridade normal.
2. **`declareAttackers`:**
   - a etapa espera a ação `declareAttackers` do jogador ativo (uma lista vazia é permitida);
   - os atacantes são virados, salvo Vigilance;
   - sem atacantes, o motor pula para `endCombat` (CR 508.8).
3. **`declareBlockers`:**
   - o motor abre o pendente `declareBlockers` com os jogadores atacados (por eles ou pelos planeswalkers deles);
   - cada um manda o seu `declareBlockers`, e o motor valida Flying, Reach, Menace e criaturas viradas;
   - quando todos declararem, o motor propõe a ordem de dano entre bloqueadores e dá prioridade.
4. **`combatDamage`:**
   - Se algum atacante ou bloqueador tiver First strike ou Double strike, há uma etapa de dano de First strike
     (CR 510.4). Ela é controlada por `firstStrikeDealt`.
   - Em cada etapa, `proposeDamage(state)` gera a `DamageProposal`. É uma lista de
     `{ source, assignments: { to, amount }[] }`, com estas regras:
     - letal primeiro, na ordem dos bloqueadores;
     - Deathtouch faz 1 contar como letal;
     - Trample manda o resto para o alvo;
     - atacante sem bloqueio vai para o alvo;
     - atacante bloqueado cujo bloqueador sumiu não causa dano, salvo Trample.
   - O pendente `confirmDamage` vai para o jogador ativo. `assignDamage` aceita ajustes **dentro das regras**: a
     soma igual ao poder, letal antes de passar ao próximo e Trample só com o letal atribuído. O motor valida isso
     de novo.
   - Ao aplicar, o motor:
     - marca o dano;
     - tira lealdade e vida;
     - aplica Lifelink;
     - aplica o dano de comandante pelo fluxo atual (`commanderDamage`, sem duplicar a vida);
     - roda as ações baseadas em estado.
5. **`endCombat`:** limpa `attacking`/`blocking`.

**P/T atual:** `base + contadores (+1/+1, −1/−1, se anulam) + Σ ptMods`. Para planeswalkers, a lealdade é o contador
`loyalty`, iniciado com `rules.loyalty` ao entrar no campo.

## Ações baseadas em estado (adições ao `stateBased.ts`)
CR 704.5f–i:
- criatura com resistência ≤ 0 vai para o cemitério;
- criatura com dano ≥ resistência ou com `deathtouchDamage`, sem Indestructible, é destruída;
- planeswalker com lealdade 0 vai para o cemitério.

O comandante continua emitindo `commanderMayReturn`. Tudo é feito em laço até estabilizar, como hoje.

## Etapas e paradas (`turn.ts`)
- **Início do turno:** `landsPlayed = 0` e `lastTurnStarted = turn.number`.
- **Fim de cada etapa:** a reserva de mana esvazia, com o evento `manaEmptied` só se havia mana.
- **Cleanup:**
  - se a mão do ativo for maior que `maxHandSize`, o motor abre o pendente `discard`;
  - depois, limpa `damage`, `deathtouchDamage` e `ptMods` e passa o turno.
- **Paradas automáticas:**
  - Em `givePriority`, o motor checa `shouldAutoPass(state, player)`. Ela é verdadeira quando:
    - não há pendente;
    - a pilha está vazia, ou o topo é do próprio jogador e `stops.passAfterOwnSpell` está ligado;
    - a etapa não está nas paradas do jogador, ou `passUntil` está ativo.
  - Se for verdadeira, o motor passa a prioridade pelo jogador, sem evento de "passou" no log para não poluir.
  - Isso é um laço limitado pelo número de jogadores × etapas.
  - `passUntil` é cancelado quando outro jogador põe algo na pilha ou quando o jogador é atacado.
  - O padrão está nos requisitos 30 e 31.
  - No jogo local com vários jogadores no mesmo aparelho, as paradas valem por lugar.

## Exceções
- `requestException { action, reason }` só é aceita quando `checkPolicies` dessa ação dá `block`. Não serve para
  ações inválidas por outro motivo.
- **`options.exceptionApproval`:**
  - `'auto'`: aplica a ação na hora e emite `judgeAction`.
  - `'vote'`: abre o pendente `exception`, que é público. Cada outro jogador vivo responde, e quem pediu pode
    cancelar. Uma recusa encerra. Com todos aprovando, a ação é aplicada pulando as políticas.
- Enquanto o pedido estiver aberto, as outras ações são recusadas com `pendingException`. Só valem as respostas e o
  cancelamento.
- O servidor não tem timeout para isso na v1. Quem pediu pode desistir.

## Protocolo e servidor
- `ActionIntent` ganha as ações novas. O protocolo valida a forma de cada uma (limites de tamanho de lista: 200
  ataques e bloqueios, 60 ativações). A semântica fica com o motor.
- **`sit`:** substitui `rules` pelas do catálogo (ver Confiança online).
- **`createGame`:** a sala passa `options.exceptionApproval = 'vote'`; o jogo local passa `'auto'`.
- **Regras da sala:** o `presetCodec` aceita `landsPerTurn` (1–5) e `timingRules`/`manaRules`/`combatRules`.

## Web (mesa)
- **Mão:**
  - arrastar para o campo vira `playLand` (terreno) ou `castSpell` (resto) com o pagamento automático;
  - um clique abre o menu "Jogar", "Lançar", "Lançar com X…" e "Lançar pagando à mão".
- **Mana:**
  - clicar num terreno ou fonte desvirada vira `activateMana`, com um seletor de cor quando houver opção;
  - um HUD da reserva fica perto do retrato do jogador.
- **Pagamento:** o confirmar destaca as fontes que serão viradas e permite trocar alguma antes de confirmar.
- **Combate:**
  - **Ataque:** um modo de ataque clica nas criaturas e no alvo (retrato do oponente ou planeswalker), com setas
    na mesa 3D. Tem "Atacar com todos" e "Sem ataque".
  - **Bloqueio:** um modo de bloqueio arrasta o bloqueador até o atacante.
  - **Dano:** um painel mostra a proposta (quem morre, quanto de vida cai, o dano de comandante) e permite
    redistribuir com +/−. O botão é "Confirmar dano".
- **Exceção:** um toast de bloqueio com "Fazer mesmo assim" abre o diálogo com o motivo. O pedido aparece para os
  outros com "Aprovar" e "Recusar".
- **Opções da partida:**
  - grade de paradas (etapas × meu turno/turno dos outros);
  - botões "Passar até o fim do turno" e "Passar até o meu turno" na barra de prioridade.
- **Ajuste de P/T:** fica no menu da criatura ("+1/+1 até o fim do turno", "Ajustar P/T…").
- **Log:** as linhas novas são "jogou terreno", "lançou … (pagou {2}{G})", "mana declarada", "ataques", "bloqueios",
  "dano", "regra contornada (aviso)" e "ação de juiz".

## Fitness functions novas
1. **O parser fica fora do núcleo:** nenhum arquivo do motor importa `deriveRules`; só o `index.ts` reexporta.
2. **Sem nomes de carta no parser:** os testes usam o texto Oracle real, e a varredura de nomes atual cobre
   `deriveRules.ts`.
3. **Conservação de mana:** em estados aleatórios, a mana gasta mais a que sobra na reserva é igual à mana gerada
   (property-based).
4. **Dano proposto é legal:** para combates aleatórios, `assignDamage(proposeDamage(s))` é sempre aceito, e a soma
   do dano de cada fonte é igual ao poder dela.
5. **Migração:** todo estado v1 gerado nos testes atuais migra para v2 e continua serializável e com replay
   determinístico.
6. **Paradas não travam:** de qualquer estado, passar prioridade repetidamente chega ao próximo turno em menos de N
   passos.

## Riscos e mitigações
- **Estrito sem scripts trava cartas que mudam regras.** A mitigação é o pedido de exceção; o preset pode ir para
  `warn` por área.
- **Parser de Oracle erra uma fonte de mana.** O padrão desconhecido cai em "mana declarada", e não em mana errada;
  os testes usam o texto real das ~50 fontes mais jogadas em Commander, vindo do catálogo.
- **Partida online travada por pedido sem resposta.** Quem pediu pode cancelar. Numa fase seguinte, há o timeout
  configurável.
- **Mudança grande no `GameState`.** A migração v1 → v2 tem teste dedicado. As salas em andamento abrem com as
  regras novas `off`.
- **Combate é a parte mais cara de UI na mesa 3D.** A entrega vem por ondas: a primeira versão de ataque e bloqueio
  usa painéis DOM, e as setas 3D vêm depois.
