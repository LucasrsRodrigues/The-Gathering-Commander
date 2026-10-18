# Requirements — 02 · Motor de regras (núcleo)

## Objetivo
Um motor de jogo em TypeScript puro que guarda o estado de uma partida de Commander e aplica ações de
forma determinística. Na **fase 1** ele dá assistência à mesa sandbox: zonas, turnos, prioridade, pilha manual,
vida, veneno, dano e taxa de comandante, mulligan e eliminação. Na **fase 3** passa a aplicar regras de carta.

## Contexto e suposições
- O motor não conhece texto de regra das cartas na fase 1. Toda carta tem cobertura `manual`.
- O motor é usado no navegador (sessão local) e, no futuro, no servidor e pelo bot.
- Na fase 1, quem fala no lugar de cada jogador é a UI local (hot-seat). Toda ação ainda traz o jogador que age.

## Escopo
- **Dentro (fase 1):**
  - Criar partida a partir de decks.
  - Zonas e movimento entre elas.
  - Virar e desvirar, contadores, tokens.
  - Turno com as etapas do CR 500.
  - Prioridade e pilha manual.
  - Vida, veneno, dano de comandante, taxa de comandante.
  - Mulligan London com o primeiro grátis.
  - Ações baseadas em estado de derrota.
  - Visão filtrada por jogador, eventos e replay determinístico.
- **Fora (fase 1):** custos de mana, alvos, habilidades de carta, combate automatizado, camadas e efeitos de
  substituição. Ficam para a fase 3, numa seção própria deste épico.

## Requisitos funcionais (EARS)

### Criação e setup
1. QUANDO uma partida for criada com 1 a 4 jogadores, decks e seed, o motor DEVE colocar os comandantes na zona de
   comando, embaralhar os grimórios com a seed e comprar a mão inicial de cada jogador.
   _(aceite: mesma seed → mesmas mãos; tamanho da mão = `startingHandSize`)_
2. O motor DEVE aplicar a vida inicial do ruleset (padrão 40). _(aceite: teste com ruleset padrão e com 30)_
3. QUANDO todos os jogadores mantiverem a mão, o motor DEVE iniciar o turno 1 do jogador inicial.

### Mulligan (London, primeiro grátis em multiplayer)
4. QUANDO um jogador pedir mulligan, o motor DEVE embaralhar a mão no grimório e comprar uma nova mão do tamanho
   inicial. _(aceite: mão volta ao grimório; contagem do grimório preservada)_
5. QUANDO um jogador mantiver a mão depois de N mulligans, o motor DEVE pedir que ele coloque
   `max(0, N − freeMulligans)` cartas no fundo do grimório antes de seguir.
   _(aceite: com 2 mulligans e 1 grátis, pede 1 carta)_

### Turno, prioridade e pilha
6. O motor DEVE percorrer as etapas na ordem do CR 500: untap, upkeep, draw, main1, beginCombat,
   declareAttackers, declareBlockers, combatDamage, endCombat, main2, end, cleanup.
7. QUANDO começar a etapa de untap e `autoUntap` estiver ligado, o motor DEVE desvirar os permanentes do
   jogador ativo. Ninguém recebe prioridade no untap nem no cleanup.
8. QUANDO começar a etapa de compra e `autoDraw` estiver ligado, o motor DEVE comprar 1 carta para o jogador ativo.
   A exceção é o primeiro turno de uma partida de 2 jogadores (CR 103.8a).
9. ENQUANTO houver prioridade, QUANDO todos os jogadores ainda no jogo passarem em sequência, o motor DEVE resolver
   o topo da pilha se ela não estiver vazia, ou avançar para a próxima etapa se estiver vazia (CR 117.4).
   _(aceite: 4 passes com pilha vazia → próxima etapa; com 1 item → resolve e devolve a prioridade ao ativo)_
10. QUANDO um jogador com prioridade realizar uma ação, o motor DEVE manter a prioridade com ele e zerar a
    sequência de passes (CR 117.3c).
11. ENQUANTO `priorityMode` for `relaxed`, o jogador ativo DEVE poder avançar a etapa diretamente se a pilha
    estiver vazia, o que conta como todos terem passado.
12. QUANDO um objeto for posto na pilha e resolvido, o motor DEVE mandá-lo para o campo de batalha se for um
    permanente pelo tipo, ou para o cemitério caso contrário. Itens de habilidade simplesmente saem da pilha.
13. QUANDO o cleanup terminar, o motor DEVE passar o turno para o próximo jogador ainda no jogo, na ordem dos lugares.

### Sandbox (ações manuais)
14. O motor DEVE aceitar as ações manuais: mover objeto entre zonas (topo, fundo ou posição), virar e desvirar,
    virar face para baixo, contadores (+/−), criar token, comprar N, embaralhar, moer N, ajustar vida e veneno,
    registrar dano de comandante, colocar habilidade manual na pilha e definir a posição do objeto na mesa.
15. SE `restrictToController` estiver ligado, ENTÃO o motor DEVE recusar ações sobre objetos que o jogador não
    controla, com erro tipado. _(aceite: jogador 2 não consegue virar a carta do jogador 1)_
16. QUANDO uma ação for inválida, o motor DEVE devolver um erro com código e mensagem e NÃO DEVE alterar o estado.

### Commander
17. QUANDO um comandante sair da zona de comando para a pilha, o motor DEVE incrementar o contador de conjurações
    dele. A taxa exibida DEVE ser `commanderTaxIncrement × conjurações anteriores` (CR 903.8).
18. QUANDO dano de comandante for registrado, o motor DEVE acumular por comandante de origem e, opcionalmente,
    reduzir a vida no mesmo valor.
19. QUANDO um comandante for para o cemitério ou para o exílio, o motor DEVE emitir o evento `commanderMayReturn`,
    para que o dono possa devolvê-lo à zona de comando (CR 903.9a).

### Derrota e fim de jogo
20. SE `autoLoss` estiver ligado, ENTÃO, depois de cada ação, o motor DEVE marcar como derrotado o jogador com vida
    ≤ 0, veneno ≥ `poisonLimit` ou ≥ `commanderDamageLimit` de dano de um mesmo comandante (CR 704.5a/c, 903.10a).
21. QUANDO um jogador perder ou conceder, o motor DEVE removê-lo da rotação de turnos e de prioridade e retirar
    da mesa os objetos que ele possui.
22. QUANDO restar no máximo 1 jogador, o motor DEVE encerrar a partida e registrar o vencedor.

### Visão, eventos e replay
23. O motor DEVE produzir eventos de domínio para cada mudança: zona, virar, vida, etapa, prioridade, pilha,
    derrota e assim por diante.
24. O motor DEVE produzir a visão de um jogador sem a mão dos outros, sem o conteúdo e a ordem dos grimórios e sem
    a face de objetos virados para baixo que ele não controla.
25. Aplicar a mesma lista de ações ao mesmo estado inicial DEVE gerar estados idênticos.

## Requisitos não-funcionais
- **Pureza:** zero dependências de runtime. O motor não importa nada de UI, rede ou relógio
  (o tempo vem do chamador).
- **Imutabilidade:** `reduce` nunca muta a entrada. O estado é JSON puro, serializável.
- **Desempenho:** aplicar uma ação típica com 300 objetos em jogo leva menos de 1 ms.
- **Segurança:** ações vindas da UI (e, no futuro, da rede) são validadas. O motor nunca confia em ids ou
  donos informados.

## Critérios de aceite globais
- [ ] Cobertura de testes ≥ 90% em `packages/engine`.
- [ ] Fitness functions de pureza, ausência de nomes de carta, informação oculta e determinismo passando.
- [ ] Uma partida simulada de 4 jogadores (script de ações) roda do setup ao fim.
