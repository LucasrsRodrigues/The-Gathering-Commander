# Tasks — 11 · Automação de cartas (fase 3c)

Quatro ondas e um fechamento:
- a onda 0 monta o modelo e a medição, sem mudar o jogo;
- as ondas 1 e 2 entregam cartas automáticas e entram no ar sozinhas;
- a onda 3 (gatilhos além de "entra no campo") é a próxima depois desta, decidida pela medição.

## Onda 0 — Modelo, leitor e medição
- [x] **T11.1 — Modelo de efeitos no `engine`** _(req: 1)_
  - Escopo:
    - `Value`, `Filter`, `TargetSpec`, `Effect`, `Ability`, `ActivatedAbility`, `TokenDef` (com Treasure, Food e
      Clue);
    - `coverage` e `manualText` em `CardRules`;
    - `ManaProduction.dynamic`;
    - `migrateState` para estados antigos.
  - Verificação:
    - fitness "estado serializável" com regras novas;
    - partidas salvas antigas abrem;
    - cartas sem regras novas jogam como hoje.
  - Feito:
    - em `types.ts`:
      - `Coverage`, `Value`, `Filter`, `TargetSpec`, `Who`, `TokenDef`, `Effect`, `Ability`, `AbilityCost`,
        `ActivatedAbility` e `Target`, tudo como dados;
      - `CardRules` ganhou os campos opcionais `spell`, `etb`, `activated`, `coverage` e `manualText`;
      - `StackItem` ganhou `ability`, `targets` e `manual`;
      - `ManaProduction.dynamic` e `ManaAbility.sacrificeSelf` (para a Treasure);
    - `effects/value.ts`:
      - `evalValue` calcula fixo, X, força ou resistência da origem ou do alvo, marcadores da origem e contagens no
        campo, na mão ou no cemitério;
      - `matchesFilter` filtra por tipo, não-tipo, subtipo, supertipo, controlador, cor, virada, "outra" e ficha;
    - a mana dinâmica já funciona ao ativar a fonte (`production` recebe a origem). O pagamento automático passa a
      usá-la na T11.4;
    - a fitness de imports do motor aceita subpastas, que só podem ir de uma para a outra dentro de `src/`.
  - **Mudança no plano:** `migrateState` não precisou mudar, porque todos os campos novos são opcionais e um estado
    antigo é um estado válido. O teste confirma que um estado salvo volta igual.
  - As `TokenDef` prontas (Treasure, Food, Clue) entram com os efeitos de ficha na T11.6, junto do sacrifício da
    Treasure.
- [x] **T11.2 — Leitor por frases e exceções em `packages/cards`** _(req: 2–4)_ · depende de T11.1
  - Escopo:
    - quebra do Oracle em frases (lembrete fora, nome vira `~`);
    - lista de padrões vazia com a estrutura de teste;
    - cobertura automática, parcial ou manual;
    - `packages/cards/overrides/<oracleId>.json` com validação.
  - Verificação:
    - fitness "nunca automática com frase não reconhecida";
    - uma exceção substitui o leitor;
    - as palavras-chave conhecidas contam como reconhecidas.
  - Feito:
    - `engine/src/oracle/patterns.ts`: o registro de padrões (`LinePattern`, `recognize`), vazio por enquanto. Só o
      leitor o importa (nova fitness);
    - a cobertura é calculada no `deriveCardRules`, linha a linha (a unidade é a linha de habilidade do Oracle, sem
      lembrete):
      - uma linha conta como entendida se um padrão a reconhece ou se o motor já fazia tudo o que ela diz (as
        nossas palavras-chave, a habilidade de mana entendida sem sobra, "entra virado", o dano ao virar, o ritual);
      - o resto vai para `manualText`, como os jogadores leem (com o nome da carta);
      - carta sem texto (vanilla, básico) é automática;
    - `deriveCardRulesWith(facts, patterns)` existe para os testes;
    - pacote novo `packages/cards`:
      - `OVERRIDES` por `oracleId`, ainda vazio, com o formato documentado e o aviso de não copiar scripts de outros
        projetos;
      - `validateRules` confere as exceções contra o modelo;
      - `rulesFor(facts, oracleId)` é o leitor mais a exceção. O app (Scryfall) e o servidor (catálogo) passaram a
        usar o `rulesFor`.
  - **Mudança no design:** o marcador do nome continua sendo o que o leitor do épico 09 já usava ("this card"), e não
    `~`, para os padrões de mana existentes seguirem iguais. Os padrões novos usam o mesmo marcador.
  - Verificado:
    - Sol Ring, Llanowar Elves, Command Tower, Dark Ritual, Forest, Caves of Koilos e Dimir Signet saem automáticas;
    - Evolving Wilds sai manual;
    - "Flying + Ward {2}" sai parcial;
    - fitness: uma frase desconhecida acrescentada a cada carta do fixture nunca a deixa automática.
- [x] **T11.3 — `edhrec_rank` no catálogo e o comando de cobertura** _(req: 16)_ · depende de T11.2
  - Escopo:
    - migração 0006 (coluna `edhrec_rank`) e o import lendo o campo;
    - `npm run coverage -w @gathering-hall/server`: top 1.000 e 5.000, mais as 30 frases não reconhecidas mais
      comuns, normalizadas.
  - Verificação:
    - roda no Postgres local com o bulk real e grava a linha de base;
    - testes com um catálogo pequeno.
  - Feito:
    - migração `0006-edhrec-rank.sql`: coluna `edhrec_rank` em `card_current`, com índice parcial;
    - o import grava o ranking a cada execução (todas as cartas são regravadas), e o `CARD_FORMAT` 3 força um
      reimport no próximo start;
    - `CatalogStore.mostPlayed(limit)`;
    - `catalog/coverage.ts` (puro):
      - conta automáticas, parciais e manuais por top;
      - lista as frases manuais mais comuns, normalizadas: nome vira `~`, números e `{2}` viram `N` e `{N}`;
    - `npm run coverage -w @gathering-hall/server` usa a `DATABASE_URL` ou o PGlite local.
  - **Linha de base (catálogo de 2026-10-19, Postgres 16, 0,5 s para 5.000 cartas):**

    | Top | Automáticas | Parciais | Manuais | Automáticas ou parciais |
    |---|---|---|---|---|
    | 1.000 | 93 (9,3%) | 278 (27,8%) | 629 (62,9%) | 37,1% |
    | 5.000 | 182 (3,6%) | 1.378 (27,6%) | 3.440 (68,8%) | 31,2% |

    As frases manuais mais comuns no top 5.000:
    - Equip {N} (112), Enchant creature (69), Choose N — (59), Draw a card. (34), Cycling {N} (32), Crew N (28);
    - "This spell can't be countered." (23);
    - "This creature enters with X +N/+N counters on it." (18), Draw N cards. (17);
    - "When this land enters, you gain N life." (17), "Equipped creature gets +N/+N." (16);
    - "• Destroy target artifact." (15), Ward {N} (13), "When this land enters, scry N." (13);
    - "You may play an additional land on each of your turns." (13).
  - **Achados para a onda 1:**
    - o Oracle atual escreve "this creature", "this land" e "this spell", e não o nome. Os padrões precisam aceitar
      esses marcadores, além do nome;
    - "automáticas ou parciais" já está em 37% só com o épico 09 (uma palavra-chave basta para "parcial"), então a
      meta passa a ser a das **automáticas**: de 9,3% para pelo menos 20% no top 1.000 (ajustado nos requirements);
    - Equip, Enchant e os modais ("Choose N —") estão no topo, mas cabem nas ondas 2 e 3 (habilidade ativada,
      Aura, modos). A onda 1 fica com "Draw N cards.", dano, destruir e os "entra no campo" de terreno (vida,
      vidência).

## Onda 1 — Mana variável, mágicas e "entra no campo"
- [x] **T11.4 — Mana variável** _(req: 11)_ · depende de T11.1
  - Escopo:
    - padrões "Add an amount of {G} equal to ~'s power", "Add {G} for each Elf you control" e parecidos;
    - `plan.ts` calcula o valor na hora.
  - Verificação:
    - Marwyn, Priest of Titania, Elvish Archdruid e Gaea's Cradle com o Oracle real;
    - o pagamento automático usa a quantidade certa;
    - a Marwyn com mais marcadores gera mais.
  - Feito:
    - o leitor de mana do épico 09 entende:
      - "Add an amount of {G} equal to ~'s power.";
      - "Add {G} for each <tipo ou subtipo> on the battlefield / you control.", com qualquer cor e qualquer custo
        que esse leitor já aceitava. A Cabal Coffers, com {2}, {T}, também entra;
    - o nome curto das lendárias ("Marwyn" em "Marwyn, the Nurturer") passou a ser tratado como o próprio nome, como
      o Oracle escreve;
    - o pagamento automático calcula a quantidade na hora, tanto pelo estado completo (`evalValue`) quanto pela
      visão do jogador na mesa online (`evalValueInView`);
    - `matchesFilter` aceita o objeto completo ou o que o jogador vê dele.
  - **Mudança no design:** essas frases ficaram no leitor de mana, e não na lista de padrões. Como já são
    habilidades de mana, o custo ({T}, {2}) já vem entendido, e a cobertura conta a linha sem duplicar código.
  - Verificado com o Oracle real:
    - Priest of Titania e Gaea's Cradle saem automáticas;
    - Marwyn sai parcial (o gatilho de +1/+1 é da onda 3);
    - Elvish Archdruid sai parcial (o anthem é da onda 3);
    - no jogo, a Marwyn com +2 gera {G}{G}{G}, e com força 0 não gera nada;
    - a Priest conta os Elfos dos dois lados, a Archdruid só os seus;
    - o pagamento de {G}{G}{G}{G} usa só a Marwyn de força 4.
- [ ] **T11.5 — Alvos: decisão `chooseTargets`, `legalTargets` e anulação** _(req: 7, 8)_ · depende de T11.1
  - Verificação:
    - alvos antes de pagar;
    - cancelar não gasta nada;
    - só alvos válidos são aceitos (filtro e controlador);
    - na resolução, alvo ilegal é ignorado e todos ilegais anulam (teste de propriedade).
- [ ] **T11.6 — Interpretador de efeitos e mágicas automáticas** _(req: 5, 10)_ · depende de T11.5
  - Escopo:
    - `applyEffects` para comprar, dano, vida, destruir, exilar, devolver, marcadores, +X/+X, fichas, moer e
      descartar;
    - os padrões do leitor para essas frases em instantâneas e feitiços;
    - os eventos para o registro.
  - Verificação:
    - cada efeito com teste de motor;
    - cada padrão com o Oracle real de 2 cartas;
    - fitness de replay;
    - a parte entendida de uma carta parcial é aplicada, e a manual aparece no registro.
- [ ] **T11.7 — "Quando entra no campo"** _(req: 6)_ · depende de T11.6
  - Verificação:
    - o gatilho vai para a pilha ao entrar;
    - os alvos são pedidos antes;
    - sem alvo válido, sai sem efeito;
    - fichas que entram também disparam;
    - a ordem de vários gatilhos é a do texto.
- [ ] **T11.8 — "Resolver à mão"** _(req: 9)_ · depende de T11.6
  - Verificação:
    - local resolve na hora;
    - online passa pela aprovação dos outros;
    - fica no registro como ação de juiz.
- [ ] **T11.9 — Interface: alvos na mesa, registro e selo** _(req: 7, 15)_ · depende de T11.5
  - Escopo:
    - destaque dos alvos válidos na mesa 3D e nos painéis;
    - a faixa "Escolha N alvos · Confirmar · Cancelar", com a lista acessível;
    - frases do registro;
    - selo e "Manual:" na prévia;
    - selo por carta e resumo no editor;
    - "automático" e "Resolver à mão" na pilha.
  - Verificação:
    - Lightning Bolt num alvo clicado, no computador e na largura de tablet;
    - por teclado, escolher o alvo pela faixa;
    - o resumo do editor bate com o leitor.
  - Critério de aceite da onda: no top 1.000, as automáticas passam da linha de base de 9,3% (T11.3) para pelo menos
    20%. O resultado fica registrado aqui.

## Onda 2 — Habilidades ativadas, contagens e buscas
- [ ] **T11.10 — Habilidades ativadas** _(req: 12)_ · depende de T11.6
  - Escopo:
    - padrões de custo ({T}, mana, sacrificar, descartar, vida) e "Activate only as a sorcery";
    - ação `activateAbility`;
    - itens no menu da carta.
  - Verificação:
    - o custo é pago certo;
    - as regras de tempo e o enjoo para {T} valem;
    - o item entra na pilha e resolve.
- [ ] **T11.11 — Contagens nos efeitos** _(req: 13)_ · depende de T11.10
  - Verificação:
    - Wellwisher ganha 1 por Elfo, contando a própria;
    - "equal to the number of cards in your hand";
    - "for each creature you control".
- [ ] **T11.12 — Busca no grimório, vidência e investigar** _(req: 14)_ · depende de T11.10
  - Escopo: decisões `searchLibrary` e `scry`/`surveil`, os seletores na interface, embaralhar depois.
  - Verificação:
    - Cultivate e Rampant Growth automáticos;
    - só cartas válidas clicáveis;
    - o grimório é embaralhado;
    - o oponente não vê o grimório (visão filtrada).
  - Critério de aceite da onda: o deck de exemplo de Elfos joga sem ações manuais nas cartas cobertas (Marwyn,
    Priest of Titania, Wellwisher, Cultivate, Llanowar Elves), e a medição das top 1.000 sobe de novo.

## Fechamento
- [ ] **T11.13 — Revisão (correção, online, tablet)**
  - Escopo:
    - jogar uma partida online com cartas automáticas;
    - conferir alvos e "Resolver à mão" no tablet real (junto com a medição pendente do épico 10);
    - erros de leitura achados viram exceções ou correções de padrão.
- [ ] **T11.14 — README, roadmap e a linha de cobertura**
  - Escopo: as frases mais comuns ainda manuais viram a lista da onda 3 (gatilhos de morrer e atacar, anthems…).

## Estratégia de testes
- Os padrões são testados frase a frase com o Oracle real. Os efeitos são testados no motor puro.
- Testes de propriedade: alvos ilegais, replay determinístico, estado serializável.
- A medição de cobertura roda localmente com o bulk real (não no CI).
- Interface: alvos e registro conferidos no navegador, com eventos de ponteiro reais, e no tablet real no fechamento.
