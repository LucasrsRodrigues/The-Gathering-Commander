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
- [ ] **T9.3 — Regras das cartas no preparo e no servidor** _(req: 37, 38)_ · depende de T9.1
  - Escopo:
    - `prepareSeatDeck` preenche `rules` com o catálogo;
    - o `sit` do servidor substitui `rules` pelo catálogo, ou apaga quando ele não existe.
  - Verificação: um cliente que manda `rules` falsas (Sol Ring com 10 manas) joga com as regras do catálogo.

## Onda 1 — Tempo
- [ ] **T9.4 — Políticas e `ruleBlocked` / `ruleBent`** _(req: 32, 33)_ · depende de T9.2
  - Escopo: `checkPolicies`, os três níveis por área e os eventos no log.
  - Verificação: a mesma ação em `block`, `warn` e `off` dá erro, aviso e silêncio.
- [ ] **T9.5 — `playLand`, `castSpell` (sem custo ainda) e movimento manual restrito** _(req: 1–6)_ · depende de T9.4
  - Verificação:
    - feitiço na manutenção bloqueado;
    - segundo terreno bloqueado;
    - instantânea e Flash no turno do outro permitidos;
    - comandante segue o tipo;
    - arrastar da mão para o campo em estrito dá a mensagem certa.
- [ ] **T9.6 — Pedido de exceção** _(req: 33–36)_ · depende de T9.4
  - Escopo: `requestException`, `answerException`, `cancelException`, os modos `auto`/`vote` e `judgeAction`.
  - Verificação:
    - online, com 3 jogadores: uma recusa cancela, todos aprovando aplica, quem pediu pode desistir;
    - local aprova sozinho;
    - uma ação inválida por outro motivo não vira exceção.
- [ ] **T9.7 — Mesa: jogar e lançar, toast de bloqueio, diálogo de exceção** · depende de T9.5, T9.6
  - Verificação: partida local e online jogável só com o fluxo novo; leitor de tela anuncia o motivo do bloqueio.

## Onda 2 — Mana
- [ ] **T9.8 — Reserva, `activateMana`, `declareMana`, escolha de cor e esvaziar por etapa** _(req: 7–11)_ · depende de T9.5
  - Verificação:
    - Command Tower usa a identidade do comandante;
    - terreno de dor tira 1 de vida só na cor;
    - Elfo recém-chegado não gera mana;
    - a reserva esvazia ao mudar de etapa;
    - fitness de conservação de mana.
- [ ] **T9.9 — Custo, taxa de comandante e pagamento** _(req: 12, 14, 15)_ · depende de T9.8
  - Verificação:
    - híbrida, phyrexiana (com vida) e X;
    - taxa aumenta a cada lançamento da zona de comando;
    - custo desconhecido vira manual com aviso;
    - Dark Ritual gera {B}{B}{B} ao resolver.
- [ ] **T9.10 — `planPayment` e `castSpell { payWith }` atômico** _(req: 13)_ · depende de T9.9
  - Verificação:
    - escolhe cor fixa antes de "qualquer cor";
    - Signet pago com outra fonte;
    - `null` quando não dá;
    - menos de 5 ms com 30 fontes.
- [ ] **T9.11 — Mesa: HUD da reserva, clicar para gerar mana, confirmação do pagamento** · depende de T9.10
  - Verificação: lançar uma criatura de 4 com o pagamento automático é feito em 2 cliques.

## Onda 3 — Combate
- [ ] **T9.12 — P/T atual, dano marcado, `adjustPT` e ações baseadas em estado** _(req: 22–24, 26)_ · depende de T9.2
  - Verificação:
    - contadores +1/+1 e −1/−1 se anulam;
    - Indestructible sobrevive;
    - Deathtouch mata com 1;
    - planeswalker com 0 vai para o cemitério;
    - o cleanup limpa dano e ajustes.
- [ ] **T9.13 — Declarar atacantes e bloqueadores** _(req: 17–19)_ · depende de T9.12
  - Verificação:
    - enjoo, Haste, Defender, Vigilance;
    - Flying, Reach, Menace;
    - multiplayer: só os atacados bloqueiam e todos precisam declarar;
    - sem atacantes, o combate pula.
- [ ] **T9.14 — Proposta de dano, `assignDamage` e aplicação** _(req: 20–22)_ · depende de T9.13
  - Verificação:
    - First strike e Double strike com duas etapas;
    - Trample com Deathtouch;
    - Lifelink;
    - dano de comandante somado sem duplicar a vida;
    - ajuste fora das regras recusado;
    - fitness "dano proposto é legal".
- [ ] **T9.15 — Cleanup com descarte** _(req: 25)_ · depende de T9.2
  - Verificação: com 9 cartas e máximo 7, pede 2; a escolha não vaza para os outros antes de ser feita.
- [ ] **T9.16 — Mesa: modo de ataque, modo de bloqueio e painel de dano (DOM primeiro)** · depende de T9.14
  - Verificação: critério de aceite da fase, com uma partida de 2 jogadores até a morte por combate sem ajuste
    manual de vida.

## Onda 4 — Paradas automáticas
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
