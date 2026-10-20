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
- [x] **T11.5 — Alvos: decisão `chooseTargets`, `legalTargets` e anulação** _(req: 7, 8)_ · depende de T11.1
  - Verificação:
    - alvos antes de pagar;
    - cancelar não gasta nada;
    - só alvos válidos são aceitos (filtro e controlador);
    - na resolução, alvo ilegal é ignorado e todos ilegais anulam (teste de propriedade).
  - Feito:
    - `effects/targets.ts`:
      - `legalTargets` e `legalTargetsInView` listam os alvos válidos, pelo estado e pela visão do jogador, para a
        mesa destacar no online;
      - `checkTargets` confere quantidade (com "até N"), alvos distintos e o filtro de cada spec;
      - `stillLegal` refaz a checagem na resolução, com a mesma divisão por spec;
      - "any target" aceita criatura, planeswalker ou jogador;
      - o spec de objeto ganhou `zone` (campo, pilha ou cemitério), já pensando em "counter target spell";
    - a ação `castSpell` aceita `targets`, checados antes de pagar. Como a ação é atômica, um alvo inválido não
      gasta nada (erro `invalidTarget`);
    - o item da pilha guarda `ability` e `targets`. Uma mágica com alvo conjurada sem alvos fica `manual` e resolve à
      mão, como hoje, até a mesa pedir os alvos (T11.9);
    - na resolução, os alvos ilegais saem do item. Se todos ficaram ilegais, a mágica vai para o cemitério sem
      efeito, com o evento `stackItemFizzled`;
    - o protocolo online valida `targets`: até 20, cada um `{ player }` ou `{ object }`.
  - **Mudança no design:** para mágicas, os alvos vão dentro da própria ação `castSpell`, e não numa decisão
    pendente. A mesa escolhe localmente com `legalTargets` e manda tudo junto, então cancelar é não mandar. A
    decisão pendente `chooseTargets` fica para os gatilhos que o motor dispara sozinho (T11.7).
  - **Observação (CI e máquina local):** duas rodadas completas dos testes do servidor travaram por cerca de 10
    minutos, com a máquina sob carga alta (média 7 a 9). Os testes que travaram usam PGlite ou sockets, e alguns nem
    passam pelo código da T11.5.
    - Cada arquivo, rodado sozinho, passa em menos de 15 s.
    - O commit anterior passou inteiro em 26 s.
    - Depois, a mesma suíte com a T11.5 passou inteira em 32 s, e o `npm test` completo também passou.

    Fica como suspeita de instabilidade do PGlite em paralelo sob carga. Se voltar a aparecer no CI, a saída é
    limitar os workers do vitest no servidor.
- [x] **T11.6 — Interpretador de efeitos e mágicas automáticas** _(req: 5, 10)_ · depende de T11.5
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
  - Feito:
    - `effects/apply.ts` aplica, em ordem, comprar, vida, dano, destruir, exilar, devolver, marcadores, +X/+X até o
      fim do turno, fichas, moer e mana fixa, pelos mesmos auxiliares do jogo manual:
      - o dano não causado em combate tira vida dos jogadores, marca dano nas criaturas e tira lealdade dos
        planeswalkers, com vínculo com a vida e toque mortífero vindos da origem, e não conta como dano de
        comandante;
      - indestrutível não é destruído;
      - fichas ficam limitadas a 50 por efeito;
      - descartar, buscar e vidência viram uma nota "faça à mão" até a onda 2;
    - eventos novos: `abilityResolving` (a frase que resolveu) e `manualStep` (a parte manual das parciais);
    - fichas prontas: Treasure (a mana sacrifica a ficha; o pagamento automático nunca a gasta sozinho), Food e Clue
      (com as habilidades manuais até a onda 2);
    - `oracle/sentences.ts`: as frases da onda 1, tiradas do Oracle real:
      - Draw N cards; You draw N and lose N life; Target player draws N (and loses N); Each player draws;
      - ganhar e perder vida, moer;
      - ~ deals N damage to any target / target creature / each creature / each opponent;
      - Destroy/Exile target <X>; Destroy/Exile all <Xs>; Return target <X> to its owner's hand;
      - Target creature gets ±N/±N until end of turn; Creatures you control get +N/+N;
      - Put N +1/+1 counters; Create N N/N <cor> <tipo> tokens (with <palavra-chave>); Create N Treasure/Food/Clue;
      - "can't be regenerated" (não existe regeneração neste motor);
    - "<X>" aceita tipo, "não-tipo", "ou", virada e "you control" / "you don't control" / "an opponent controls";
    - nesta onda vale um único conjunto de alvos por mágica; duas frases com alvo deixam a linha manual.
  - **Regra nova de ordem:** se uma frase manual vem antes de uma automática numa mágica, a mágica inteira fica manual.
    No Ponder, por exemplo, comprar antes de olhar o topo estaria errado. A exceção são as frases do momento de
    conjurar (custo adicional, redução de custo).
  - Verificado com o Oracle real de 40 mágicas comuns:
    - 18 automáticas: Lightning Bolt, Shock, Murder, Wrath of God, Divination, Krenko's Command, Giant Growth,
      Unsummon e outras;
    - parciais coerentes: Thrill of Possibility, Blasphemous Act, Big Score, Tragic Slip;
    - manuais por dúvida: Swords to Plowshares, Path to Exile, Beast Within, os modais, Ponder e Read the Bones;
    - no motor: dano mata com as regras de combate ligadas e tira vida do jogador; Wrath poupa o indestrutível;
      Goblins 1/1 vermelhos; Giant Growth até o fim do turno; Unsummon volta à mão do dono; Treasure; replay
      determinístico.
  - **Medição (catálogo de 2026-10-20):** no top 1.000, automáticas de 9,3% para 11,3%, e automáticas ou parciais de
    37,1% para 41,3%. No top 5.000, automáticas de 3,6% para 4,8%.
- [x] **T11.7 — "Quando entra no campo"** _(req: 6)_ · depende de T11.6
  - Verificação:
    - o gatilho vai para a pilha ao entrar;
    - os alvos são pedidos antes;
    - sem alvo válido, sai sem efeito;
    - fichas que entram também disparam;
    - a ordem de vários gatilhos é a do texto.
  - Feito:
    - `triggers.ts`: ao entrar no campo (carta, terreno jogado ou ficha), cada `etb` da permanente vira um gatilho na
      fila `state.triggers`. A fila vai para a pilha na próxima vez que alguém receberia prioridade (CR 603.3):
      - primeiro os do jogador ativo, depois os outros na ordem do turno (CR 603.3b);
      - os de cada jogador resolvem na ordem do texto. Escolher a ordem fica para a onda 3;
      - carta virada para baixo não dispara, e a ficha que já saiu do campo não deixa gatilho.
    - **Alvos:** um gatilho com alvo cria a decisão `chooseTargets` (com o texto, os alvos possíveis e os gatilhos que
      vêm depois). A ação nova `chooseTargets { targets }` responde, com os alvos checados como no conjurar.
      - Com `manual: true`, o gatilho entra na pilha para ser feito à mão.
      - Sem nenhum alvo válido, o gatilho sai sem efeito, com o evento `triggerSkipped` (CR 603.3d).
      - Quem sai da partida leva os próprios gatilhos, e a escolha pendente dele some.
    - **Online:** o protocolo valida a ação nova. Se o jogador sai, o host responde "resolver à mão" por ele.
    - **Leitor:** "When this creature/land/artifact/… enters, <frases da onda 1>." nas permanentes, com "it deals" e
      "this creature deals" lidos como dano da própria carta.
      - "you may", "if" e "enters or dies" ficam manuais.
      - Frase nova: "Each opponent loses N life and you gain N life." (Siege Rhino).
    - **Mesa:** painel provisório com a lista dos alvos válidos, "Confirmar" e "Resolver à mão", para a partida não
      ficar esperando. O destaque na mesa 3D vem na T11.9. Verificado no navegador só que a mesa abre sem erros: os
      decks de exemplo não têm gatilho com alvo.
  - Verificado com o Oracle real de 16 cartas:
    - automáticas: Elvish Visionary, Flametongue Kavu, Man-o'-War, Ravenous Chupacabra, Bloodfell Caves, Goblin
      Instigator, Siege Rhino e outras;
    - parciais: Thragtusk e Mulldrifter;
    - manuais: Solemn Simulacrum, Reclamation Sage ("you may") e Acidic Slime (lista com vírgulas).
    - No motor: compra pela pilha; o Kavu pede o alvo, recusa jogador e alvo vazio, e mata o urso; o Chupacabra sem
      criatura do oponente sai sem efeito; alvo que sai antes de resolver anula; duas frases resolvem na ordem do
      texto; duas fichas com gatilho compram duas; terreno que entra ganha vida; replay determinístico.
  - **Medição (bulk de 2026-10-19):** no top 1.000, automáticas de 11,3% para 12,0%. No top 5.000, de 4,8% para
    5,4%.
    - Os ETBs mais jogados quase sempre têm "you may", busca ou vidência, e ficam para a onda 2.
    - A meta da onda (20%) depende das próximas frases: Equip, Enchant, modais e "Draw a card." depois de uma
      frase manual.
- [x] **T11.8 — "Resolver à mão"** _(req: 9)_ · depende de T11.6
  - Verificação:
    - local resolve na hora;
    - online passa pela aprovação dos outros;
    - fica no registro como ação de juiz.
  - Feito:
    - ação `resolveManually { stackItemId }`: marca o item do topo como `manual`, e ele resolve sem os efeitos
      automáticos (a carta só vai para onde vai). Evento `resolvedManually`, com frase no registro.
      - Só o item do topo, só item automatizado e só com prioridade. Com as regras de tempo desligadas (mesa livre),
        qualquer um pode pedir.
    - **Política:** `manualResolution`, na área "tempo". Com a área em "bloquear", o pedido é uma exceção às regras:
      - local, aplica na hora;
      - online, os outros aprovam;
      - nos dois casos fica no registro como ação de juiz.

      Com "avisar", passa com o aviso, e com "desligado", passa direto, como as outras exceções.
    - **Protocolo:** a ação nova é validada, inclusive dentro de um pedido de exceção.
    - **Mesa:** a pilha mostra "automático" ou "à mão" nos itens automatizados. No topo, quem tem prioridade vê
      "Resolver à mão", que já manda o pedido de exceção quando as regras bloqueiam.
  - Verificado nos testes do motor:
    - sem regras, só marca o item, e o Elvish Visionary não compra;
    - com regras, a ação direta é barrada, e o pedido aplica na hora, com `judgeAction` sem aprovadores;
    - online, o item só muda depois da aprovação do outro jogador;
    - erros para item fora do topo, item já manual e jogador sem prioridade.
  - Não verificado no navegador: os decks de exemplo não abrem com um item automático na pilha, e uma lista de teste
    com cartas repetidas é barrada pelas regras.
- [x] **T11.9 — Interface: alvos na mesa, registro e selo** _(req: 7, 15)_ · depende de T11.5
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
  - Feito:
    - **Modo alvo** (`hud/targeting.ts`, `hud/TargetBar.tsx`):
      - lançar uma mágica com alvo abre a faixa "Escolha 1 alvo para Lightning Bolt · Lançar à mão · Cancelar ·
        Confirmar", e os alvos vão dentro do `castSpell`. Cancelar não manda nada, então a carta fica na mão sem
        pagar. Esc também cancela;
      - o gatilho com `chooseTargets` usa a mesma faixa, com "Resolver à mão" no lugar de "Cancelar". O painel
        provisório da T11.7 saiu;
      - os alvos válidos vêm do `legalTargetsInView` do motor:
        - na mesa 3D, a carta válida ganha um brilho azul, e a escolhida um brilho branco. O clique escolhe, sem
          virar a carta nem mudar o foco da câmera;
        - nos painéis, o jogador válido ganha contorno e o botão "Alvo";
        - na faixa, os mesmos alvos aparecem como botões, com o foco no primeiro (teclado e leitor de tela).
      - com um alvo só, o segundo clique troca o alvo. Com "até N", para no máximo.
      - depois de confirmar, segue o pagamento automático como antes.
    - **Registro:**
      - motor: evento novo `effectDamage` (origem, alvo, quantidade);
      - frases novas:
        - "⚙ Automático: Lightning Bolt."
        - "Lightning Bolt causou 3 de dano a Fyndhorn Elves."
        - "✋ À mão (carta): …", com descartar, buscar, vidência e vigiar em português
        - "… foi anulado: os alvos ficaram inválidos."
        - "…: sem alvo válido, a habilidade saiu sem efeito."
    - **Prévia:** selo "automática / parcial / manual" ao lado do tipo e, se parcial, "Manual:" com as frases.
    - **Editor:**
      - selo por carta na lista;
      - no painel de estatísticas, "96 de 100 automáticas · 1 parcial · 3 manuais", com cada número destacando as
        cartas, como os outros filtros.
    - **Pilha:** "automático" ou "à mão" nos itens automatizados, e "Resolver à mão" no topo (T11.8).
  - Verificado no navegador:
    - Lightning Bolt num Fyndhorn Elves clicado na mesa 3D: faixa, brilho, pagamento, "automático" na pilha, o elfo
      morre, e o registro diz o que aconteceu;
    - na largura de tablet, a faixa fica acima da mão sem cobrir o campo do oponente;
    - pelo teclado: Enter na carta da mão abre a faixa, o foco vai para o primeiro alvo, e Tab e Enter escolhem;
    - o resumo do editor bate com o leitor: Mind Stone parcial; Krenko, Chaos Warp e Skullclamp manuais.
  - **Critério da onda: não atingido.** No top 1.000 (bulk de 2026-10-19), as automáticas estão em 12,0% (linha de
    base 9,3%, meta 20%). Automáticas ou parciais estão em 42,0%.
    - As frases manuais mais comuns do top 1.000 são de outras ondas:
      - Equip (24);
      - Cycling (17);
      - terrenos que entram virados conforme uma condição (cerca de 37);
      - vidência e vigiar ao entrar (20);
      - modais "Choose N —" (10);
      - contramágicas e "can't be countered" (15);
      - buscas no grimório.
    - Decidir com o usuário entre duas saídas: estender a onda 1 com essas frases, ou seguir para a onda 2, que já
      cobre Equip, buscas e vidência, e medir de novo no fim dela.

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
