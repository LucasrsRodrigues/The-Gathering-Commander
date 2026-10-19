# Tasks — 09 · Regras de turno e tempo (fase 3a)

Quatro ondas. Cada uma termina jogável, com commit próprio. A ordem importa: tempo, depois mana, depois combate,
depois paradas.

## Onda 0 — Base
- [x] **T9.1 — `CardRules` e parser de Oracle** _(req: 9, 10, 15, 16, 24, 37)_
  - Escopo:
    - tipos `CardRules`, `ManaCost` e `ManaAbility`;
    - `deriveCardRules(facts)` em `packages/engine/src/cards/`;
    - parse do custo do Scryfall (`{2}{G}{G}`, `{X}`, `{W/U}`, `{2/W}`, `{G/P}`, símbolo desconhecido);
    - tipos básicos intrínsecos, padrões de mana, "enters tapped", mana de mágica, `*` no P/T.
  - Verificação:
    - testes com o texto Oracle real de ~50 fontes de mana populares em Commander (fixture extraída do catálogo);
    - frase desconhecida vira `hasUnrecognizedMana`;
    - fitness: o parser não é importado pelo núcleo e não tem nomes de carta.
  - Feito: o parser ficou em `src/deriveRules.ts`, sem subpasta, porque a fitness de pureza só aceita imports `./`.
    A fixture tem 115 cartas reais. Além do planejado, o parser reconhece "Pay N life", "N mana of any one color",
    o dano ao virar (City of Brass) e linhas que concedem habilidade a outras cartas, que são ignoradas.
    Não tratados nesta fase:
    - "doesn't untap" (Mana Vault);
    - mana de gatilho (Lotus Cobra);
    - fontes que dependem de escolha ou de outras cartas (Coldsteel Heart, Exotic Orchard), que viram mana declarada.
- [x] **T9.2 — Estado v2 e migração** _(req: 32, 39)_ · depende de T9.1
  - Escopo:
    - campos novos em `GameState`, `PlayerState` e `GameObject`;
    - `Ruleset.landsPerTurn` e `Ruleset.enforcement`;
    - `RuleLevel`;
    - `options.exceptionApproval`;
    - `migrateState`;
    - `SqliteRoomStore` migra na leitura;
    - `presetCodec` aceita os campos novos.
  - Verificação:
    - fitness: todo estado v1 dos testes migra, serializa e faz replay;
    - uma sala salva antes da mudança abre com as regras novas `off`.
  - Feito, com dois desvios:
    - os níveis viraram campos simples do `Ruleset` (`timingRules`, `manaRules`, `combatRules`), em vez do objeto
      `enforcement`, para encaixar direto no codec e no editor de presets;
    - os controles no editor de presets entram junto com cada onda (T9.7, T9.11, T9.16), para não mostrar opções
      que ainda não fazem nada.
- [x] **T9.3 — Regras das cartas no preparo e no servidor** _(req: 37, 38)_ · depende de T9.1
  - Escopo:
    - `prepareSeatDeck` preenche `rules` com o catálogo;
    - o `sit` do servidor substitui `rules` pelo catálogo, ou apaga quando ele não existe.
  - Verificação: um cliente que manda `rules` falsas (Sol Ring com 10 manas) joga com as regras do catálogo.
  - Feito:
    - a validação do protocolo já descartava `rules` vindas do cliente, e a sala também as remove por conta própria;
    - o catálogo do servidor passou a servir custo, P/T e lealdade;
    - `CARD_FORMAT` força uma reimportação no primeiro start depois do deploy (cerca de 15 s);
    - o cache local do app passou para `gh-catalog-v3`.

## Onda 1 — Tempo
- [x] **T9.4 — Políticas e `ruleBlocked` / `ruleBent`** _(req: 32, 33)_ · depende de T9.2
  - Escopo: `checkPolicies`, os três níveis por área e os eventos no log.
  - Verificação: a mesma ação em `block`, `warn` e `off` dá erro, aviso e silêncio.
  - Feito:
    - a regra do req. 5 (mão ou comando para o campo ou a pilha só por "Jogar"/"Lançar") já entrou aqui, como
      primeira política;
    - **o padrão das três áreas fica `off` por enquanto.** Cada área vira `block` na tarefa de UI da sua onda, para
      cada deploy continuar jogável (sem os botões novos, a mesa não teria como lançar cartas).
- [x] **T9.5 — `playLand`, `castSpell` (sem custo ainda) e movimento manual restrito** _(req: 1–6)_ · depende de T9.4
  - Verificação:
    - feitiço na manutenção bloqueado;
    - segundo terreno bloqueado;
    - instantânea e Flash no turno do outro permitidos;
    - comandante segue o tipo;
    - arrastar da mão para o campo em estrito dá a mensagem certa.
  - Feito:
    - `playLand` e `castSpell` (com X guardado na pilha) entraram no motor e no protocolo;
    - as políticas de tempo devolvem um código por motivo (`notYourTurn`, `notMainPhase`, `stackNotEmpty`,
      `landLimit`, `noPriority`), que a UI pode usar;
    - pedir a carta da mão de outro jogador responde "carta desconhecida", sem revelar nada.
- [x] **T9.6 — Pedido de exceção** _(req: 33–36)_ · depende de T9.4
  - Escopo: `requestException`, `answerException`, `cancelException`, os modos `auto`/`vote` e `judgeAction`.
  - Verificação:
    - online, com 3 jogadores: uma recusa cancela, todos aprovando aplica, quem pediu pode desistir;
    - local aprova sozinho;
    - uma ação inválida por outro motivo não vira exceção.
  - Feito:
    - o pedido **revela a carta** envolvida (como um "revelar"), porque os outros precisam ver o que aprovam; a UI
      avisa antes de enviar;
    - a ação é testada antes das regras, para que pedir sobre a carta oculta de outro jogador responda igual a
      tentar jogá-la ("carta desconhecida");
    - quem pediu e sai da partida leva o pedido junto;
    - num jogo solo em modo de votação, não há quem aprove, e a ação é aplicada na hora.
- [x] **T9.7 — Mesa: jogar e lançar, toast de bloqueio, diálogo de exceção** · depende de T9.5, T9.6
  - Verificação: partida local e online jogável só com o fluxo novo; leitor de tela anuncia o motivo do bloqueio.

## Onda 2 — Mana
  - Ao terminar: mudar o padrão de `timingRules` para `block` em `COMMANDER_RULESET`. ✓
  - Feito:
    - a mão e os menus usam "Jogar terreno" e "Lançar", e o X é pedido ao lançar;
    - um bloqueio abre um diálogo com o motivo e "Fazer mesmo assim…" (com motivo opcional), em vez de um toast;
    - online, o pedido aparece para os outros com "Aprovar" e "Recusar", e quem pediu pode desistir;
    - o editor de regras da casa ganhou "Hora de jogar" e "Terrenos por turno".
  - Verificado no navegador (jogo local): feitiço na manutenção bloqueado, exceção aplicada e registrada no log,
    segundo terreno bloqueado.
  - Não verificado no navegador: a votação online com duas pessoas, coberta pelos testes do motor e do protocolo.

- [x] **T9.8 — Reserva, `activateMana`, `declareMana`, escolha de cor e esvaziar por etapa** _(req: 7–11)_ · depende de T9.5
  - Verificação:
    - Command Tower usa a identidade do comandante;
    - terreno de dor tira 1 de vida só na cor;
    - Elfo recém-chegado não gera mana;
    - a reserva esvazia ao mudar de etapa;
    - fitness de conservação de mana.
  - Feito, com desvios:
    - a cor vai junto com `activateMana { color }`, em vez de abrir a decisão pendente `chooseManaColor`: a UI
      pergunta a cor antes de enviar, e a ação fica atômica (sem estado intermediário para o online);
    - o custo extra automático só aceita mana genérica (Signets); custo colorido continua como mana declarada;
    - um comandante incolor faz o Command Tower não gerar mana (CR 903.4f);
    - a visão do jogador ganhou a reserva de mana, os terrenos jogados e `summoningSick` por objeto.
- [x] **T9.9 — Custo, taxa de comandante e pagamento** _(req: 12, 14, 15)_ · depende de T9.8
  - Verificação:
    - híbrida, phyrexiana (com vida) e X;
    - taxa aumenta a cada lançamento da zona de comando;
    - custo desconhecido vira manual com aviso;
    - Dark Ritual gera {B}{B}{B} ao resolver.
  - Feito:
    - a busca de pagamento tenta as escolhas de híbrida, {2/C} e phyrexiana (mana antes de vida);
    - carta sem custo de mana (Ancestral Vision) é bloqueada com `noManaCost`, e o caminho é a exceção;
    - carta sem dados é lançada sem cobrança e o log diz "custo pago à mão".
- [x] **T9.10 — `planPayment` e `castSpell { payWith }` atômico** _(req: 13)_ · depende de T9.9
  - Verificação:
    - escolhe cor fixa antes de "qualquer cor";
    - Signet pago com outra fonte;
    - `null` quando não dá;
    - menos de 5 ms com 30 fontes.
  - Feito:
    - o `planPayment` é guloso e depois verificado por simulação: nunca propõe um pagamento errado, no máximo
      diz que não há plano quando um mais esperto existiria;
    - `castSpell { payWith }` vira as fontes e paga numa ação só; se algo falha, nada muda.
- [x] **T9.11 — Mesa: HUD da reserva, clicar para gerar mana, confirmação do pagamento** · depende de T9.10
  - Verificação: lançar uma criatura de 4 com o pagamento automático é feito em 2 cliques.

## Onda 3 — Combate
  - Ao terminar: mudar o padrão de `manaRules` para `block` em `COMMANDER_RULESET`. ✓
  - Feito:
    - clicar numa fonte gera a mana (direto quando há um jeito só; menu quando há escolha ou dor);
    - fontes não reconhecidas oferecem "Declarar {X}";
    - a reserva aparece no painel de cada jogador;
    - lançar mostra quais fontes serão viradas, e "Lançar" confirma;
    - o editor de regras da casa ganhou "Custo de mana".
  - Desvio: o planejador ganhou uma entrada pela `PlayerView` (`planPaymentFromView`), porque o navegador online
    não tem o estado completo; um teste garante que as duas entradas planejam igual.
  - "Trocar uma fonte" no confirmar ficou como "Pagar à mão" (fechar, clicar nas fontes e lançar de novo).
  - Verificado no navegador (jogo local): mana insuficiente bloqueada com o custo, lançamento em 2 cliques e log com
    o pagamento.

- [x] **T9.12 — P/T atual, dano marcado, `adjustPT` e ações baseadas em estado** _(req: 22–24, 26)_ · depende de T9.2
  - Verificação:
    - contadores +1/+1 e −1/−1 se anulam;
    - Indestructible sobrevive;
    - Deathtouch mata com 1;
    - planeswalker com 0 vai para o cemitério;
    - o cleanup limpa dano e ajustes.
  - Feito:
    - além do `adjustPT`, entrou a ação manual `dealDamage` (com Deathtouch opcional) para efeitos sem script
      como Lightning Bolt, e o menu da criatura ganhou atalhos (+1/+1, −1/−1, 1 e 3 de dano);
    - as ações baseadas em estado novas só valem com `combatRules` diferente de `off` e só para cartas com dados e
      P/T fixo (P/T com `*` ou carta sem dados fica com os jogadores);
    - a lealdade usa o marcador "lealdade", que a mesa já usava.
- [x] **T9.13 — Declarar atacantes e bloqueadores** _(req: 17–19)_ · depende de T9.12
  - Verificação:
    - enjoo, Haste, Defender, Vigilance;
    - Flying, Reach, Menace;
    - multiplayer: só os atacados bloqueiam e todos precisam declarar;
    - sem atacantes, o combate pula.
  - Feito:
    - a declaração é uma decisão pendente (`declareAttackers` e `declareBlockers`); enquanto ela espera, só valem
      a própria declaração, mana e sair da partida;
    - sem criaturas desviradas, o motor pula a declaração sozinho (atacante sem criaturas pula o combate; defensor
      sem criaturas não é perguntado);
    - a ordem de dano entre bloqueadores é a ordem da declaração, e o ajuste fica para a T9.14;
    - um pedido de exceção pode ser feito no meio da declaração e, se recusado, a declaração volta a esperar;
    - as políticas só julgam ataques e bloqueios possíveis: o que é impossível falha com o motivo próprio.
- [x] **T9.14 — Proposta de dano, `assignDamage` e aplicação** _(req: 20–22)_ · depende de T9.13
  - Verificação:
    - First strike e Double strike com duas etapas;
    - Trample com Deathtouch;
    - Lifelink;
    - dano de comandante somado sem duplicar a vida;
    - ajuste fora das regras recusado;
    - fitness "dano proposto é legal".
  - Feito:
    - a confirmação é uma decisão pendente do jogador ativo, uma por etapa de dano; uma etapa sem dano a causar
      passa sozinha;
    - um ajuste fora das regras (prevenção, dano a menos) é a política `damageAssignment` e pode ser pedido como
      exceção;
    - atacante bloqueado cujo bloqueador sumiu não causa dano, salvo Trample (CR 509.1h, 702.19e);
    - criatura sem dados ou com `*` recebe "dano letal" indefinido: o jogador ativo distribui à mão.
- [ ] **T9.15 — Cleanup com descarte** _(req: 25)_ · depende de T9.2
  - Verificação: com 9 cartas e máximo 7, pede 2; a escolha não vaza para os outros antes de ser feita.
- [ ] **T9.16 — Mesa: modo de ataque, modo de bloqueio e painel de dano (DOM primeiro)** · depende de T9.14
  - Verificação: critério de aceite da fase, com uma partida de 2 jogadores até a morte por combate sem ajuste
    manual de vida.

## Onda 4 — Paradas automáticas
  - Ao terminar: mudar o padrão de `combatRules` para `block` em `COMMANDER_RULESET`.

- [ ] **T9.17 — `shouldAutoPass`, `setStops`, `passUntil`** _(req: 28–31)_ · depende de T9.5
  - Verificação:
    - padrão estilo Arena;
    - `passUntil` cancela quando alguém lança ou ataca;
    - fitness "paradas não travam";
    - replay determinístico.
- [ ] **T9.18 — Mesa: grade de paradas nas opções e botões de passar** · depende de T9.17
  - Verificação: com as paradas padrão, um turno sem nada a fazer passa com no máximo 2 cliques.

## Fechamento
- [ ] **T9.19 — Revisão de segurança e de vazamento do online com as ações novas**
  - Escopo:
    - limites do protocolo;
    - regras das cartas vindas do servidor;
    - pedidos de exceção não travam a sala para sempre (quem pediu cancela; a sala expira pelo TTL).
- [ ] **T9.20 — Atualizar o roadmap e o README** (o que o jogo automatiza e o que ainda é manual)

## Estratégia de testes
- O motor é testado com unidades por política e por etapa. Há property-based para conservação de mana, legalidade
  do dano e paradas que não travam.
- O parser usa fixtures com o texto Oracle real tirado do catálogo. Elas não vão para o repositório como dump: são
  uma lista curta de frases, cada uma com o resultado esperado.
- O servidor tem testes de `sit` com regras falsas e de exceção por votação.
- A web tem testes dos adaptadores (intents geradas pelo arrastar e pelo menu). A UI de combate é verificada no
  navegador em cada onda.
