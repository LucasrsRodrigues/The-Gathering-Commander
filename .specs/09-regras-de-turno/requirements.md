# Requirements — 09 · Regras de turno e tempo (fase 3a)

## Objetivo
Fazer a partida seguir a estrutura de turno de verdade:
- cada coisa só pode ser feita na hora certa;
- mana é gerada e cobrada;
- o combate é declarado e o dano é calculado.

Tudo isso sem scripts carta a carta. O motor usa o tipo, o custo, o P/T e as keywords da carta, e o texto Oracle
só para reconhecer habilidades de mana simples.

## Contexto e suposições
- Hoje o motor conhece as etapas, a prioridade e a pilha, mas não restringe nada: dá para jogar a partida inteira
  na manutenção. Combate e mana são feitos à mão (virar cartas, ajustar vida).
- Ainda não há scripts de carta (fase 3c). Efeitos de feitiços, habilidades e gatilhos continuam manuais
  (mover cartas, contadores, vida, fichas). Esta fase cuida do **esqueleto** da partida, não dos efeitos.
- Decisões tomadas com o usuário (2026-10-19):
  - **Rigor padrão: estrito.** Ação fora da regra é bloqueada.
  - **Válvula de escape:** "Fazer mesmo assim" vira um **pedido** que os outros jogadores aprovam. Num jogo
    local, aprova sozinho. Fica no log como ação de juiz.
  - **Mana cobrada já.** Os terrenos básicos e os tipos básicos geram mana sozinhos. Nos outros terrenos e
    artefatos, o jogo lê o texto Oracle e reconhece os padrões simples (`{T}: Add {G}`, `one mana of any color`
    etc.). O que não for reconhecido fica com mana declarada à mão.
  - **Combate "calcula e confirma":** o jogo calcula o dano, mostra o resultado e o atacante confirma ou ajusta
    antes de aplicar.
  - **Paradas automáticas estilo Arena** por padrão, configuráveis por jogador.

## Escopo
**Dentro:**
- tempo de jogar terrenos e lançar mágicas;
- reserva de mana, fontes de mana reconhecidas e cobrança de custo (com a taxa de comandante);
- combate completo com as keywords mais comuns;
- descarte e limpeza no cleanup;
- paradas automáticas;
- níveis de rigor nas regras da casa;
- pedido de exceção.

**Fora (fica para a fase 3c, scripts):**
- efeitos de mágicas e habilidades;
- gatilhos;
- custos alternativos e reduções de custo;
- efeitos de "não pode bloquear", "precisa atacar" e proteção;
- fichas com regras (Treasure etc.: ficam com mana declarada);
- batalhas como alvo de ataque;
- faces alternativas de cartas divididas e aventuras (só a face principal é lançada pelo fluxo normal).

## Requisitos funcionais (EARS)

### Tempo (CR 117, 305, 307)
1. QUANDO um jogador tentar jogar um terreno, o sistema DEVE exigir que:
   - ele seja o jogador ativo;
   - esteja numa fase principal;
   - a pilha esteja vazia;
   - ele ainda não tenha jogado o número de terrenos permitido no turno (padrão 1, configurável no preset).
2. QUANDO um jogador tentar lançar uma mágica que não é instantânea nem tem Flash, o sistema DEVE exigir que:
   - ele seja o jogador ativo;
   - esteja numa fase principal;
   - a pilha esteja vazia;
   - ele tenha prioridade.
3. QUANDO um jogador tentar lançar uma instantânea ou uma carta com Flash, o sistema DEVE exigir só que ele tenha
   prioridade.
4. O comandante DEVE seguir a regra do tipo dele e pagar a taxa de comandante (CR 903.8).
5. ENQUANTO o rigor de tempo for estrito, o sistema NÃO DEVE permitir pôr uma carta da mão ou da zona de comando
   no campo de batalha ou na pilha por movimento manual. O caminho é "jogar terreno" ou "lançar"; o resto passa
   por um pedido de exceção.
6. As ações manuais que aplicam efeitos (mover cartas entre outras zonas, contadores, vida, fichas, virar e
   desvirar) DEVEM continuar livres e aparecer no log, porque sem scripts elas são a forma de aplicar efeitos.

### Mana (CR 106, 107.4, 202, 601.2, 605)
7. Cada jogador DEVE ter uma reserva de mana (W, U, B, R, G e incolor). Ela esvazia ao fim de cada etapa e de cada
   fase (CR 500.4).
8. QUANDO um jogador virar uma fonte de mana reconhecida, o sistema DEVE pôr a mana na reserva. Se a fonte der
   opções (cor à escolha), o sistema DEVE pedir a cor.
9. O sistema DEVE reconhecer como fonte de mana:
   - os tipos básicos de terreno na linha de tipo (`Forest` dá `{G}` etc.), incluindo os terrenos duplos (CR 305.6);
   - os padrões do texto Oracle descritos no design: cores fixas, "X ou Y", "uma mana de qualquer cor", "uma mana
     de qualquer cor da identidade do seu comandante", custo extra de mana genérica antes do `{T}` e o dano a si
     mesmo dos terrenos de dor.
10. SE a carta tiver o texto "Add" mas o padrão não for reconhecido, ENTÃO o sistema DEVE deixar o jogador declarar
    a mana à mão ao virar a carta. Isso fica marcado no log como "mana declarada".
11. Uma criatura com enjoo de invocação NÃO DEVE poder usar habilidades de mana com `{T}` (CR 302.6).
12. QUANDO um jogador lançar uma mágica, o sistema DEVE calcular o custo:
    - custo impresso (genérico, coloridas, incolor, híbrida, híbrida com genérico, phyrexiana e X);
    - mais a taxa de comandante, quando houver.
    O sistema DEVE então pagar com a reserva. Se a reserva não bastar, DEVE bloquear (estrito) ou avisar (assistido).
13. O sistema DEVE oferecer **pagamento automático**: propor quais fontes virar para pagar o custo e, com a
    confirmação do jogador, virar as fontes e lançar numa única ação.
14. SE o custo tiver um símbolo que o motor não conhece (snow, por exemplo), ENTÃO o sistema DEVE tratar o custo
    como manual: não cobra e marca no log.
15. QUANDO uma instantânea ou feitiço cujo texto é só gerar mana (`Add {B}{B}{B}.`) resolver, o sistema DEVE pôr a
    mana na reserva de quem a lançou.
16. Um terreno com "This land enters tapped." (sem condição) DEVE entrar virado.

### Combate (CR 506–511)
17. Na etapa de declarar atacantes, o jogador ativo DEVE escolher quais criaturas atacam e qual o alvo de cada uma:
    um jogador ou um planeswalker de outro jogador. Sem atacantes, as etapas de bloqueio e dano são puladas
    (CR 508.8).
18. Só PODEM atacar criaturas desviradas, sem enjoo de invocação (salvo Haste) e sem Defender. Atacar vira a
    criatura, salvo Vigilance.
19. Na etapa de declarar bloqueadores, cada jogador atacado DEVE declarar os bloqueios dele. A etapa continua
    quando todos os atacados tiverem declarado. Cada bloqueador bloqueia um atacante. As restrições respeitadas são:
    - Flying só é bloqueado por Flying ou Reach;
    - Menace exige dois ou mais bloqueadores;
    - criaturas viradas não bloqueiam.
20. Na etapa de dano, o sistema DEVE calcular uma **proposta de dano** com:
    - o P/T atual (base, contadores +1/+1 e −1/−1, ajustes temporários);
    - First strike e Double strike (duas etapas de dano);
    - Trample (o excesso sobre o dano letal vai para o jogador ou planeswalker);
    - Deathtouch (1 de dano já é letal, inclusive para o cálculo de Trample);
    - Lifelink (o controlador ganha vida igual ao dano);
    - a ordem de dano entre vários bloqueadores, proposta pelo motor e ajustável.
21. O jogador ativo DEVE ver a proposta e confirmar. Ele pode ajustar a distribuição do dano dentro das regras
    (CR 510.1). Mudar o resultado além disso (prevenção, proteção) passa por um pedido de exceção.
22. QUANDO o dano for aplicado, o sistema DEVE:
    - marcar o dano nas criaturas;
    - tirar lealdade dos planeswalkers;
    - tirar vida dos jogadores;
    - somar o dano de comandante automaticamente.
    Depois, as ações baseadas em estado DEVEM destruir as criaturas com dano letal ou dano de Deathtouch (salvo
    Indestructible) e pôr no cemitério criaturas com resistência 0 e planeswalkers com lealdade 0 (CR 704.5f–704.5i).
23. O sistema DEVE oferecer um ajuste manual de P/T "até o fim do turno" para aplicar efeitos sem script
    (Giant Growth, por exemplo). O ajuste é livre e aparece no log.
24. P/T com `*` na carta DEVE valer 0 como base e ser mostrado como "precisa de ajuste".

### Etapas e limpeza (CR 514)
25. No cleanup, SE o jogador ativo tiver mais cartas na mão que o tamanho máximo, ENTÃO o sistema DEVE pedir que
    ele escolha quais descartar.
26. No cleanup, o sistema DEVE remover o dano marcado e os ajustes "até o fim do turno".
27. O untap e a compra automáticos continuam como hoje (configuráveis no preset).

### Paradas automáticas
28. Cada jogador DEVE ter paradas configuráveis: em quais etapas do próprio turno e do turno dos outros ele quer
    receber prioridade.
29. QUANDO um jogador receber prioridade numa etapa sem parada, com a pilha vazia e sem decisão pendente, o sistema
    DEVE passar a prioridade por ele.
30. As paradas padrão (estilo Arena) DEVEM ser:
    - no próprio turno: fases principais e declaração de atacantes;
    - no turno dos outros: nenhuma etapa fixa;
    - sempre parar quando outro jogador puser algo na pilha;
    - sempre parar quando o jogador for atacado (para declarar bloqueios);
    - depois de lançar a própria mágica, passar sozinho.
31. O jogador DEVE ter "passar até o fim do turno" e "passar até o meu turno". Os dois são cancelados se alguém
    puser algo na pilha ou atacar esse jogador.

### Rigor e exceções
32. As regras da casa DEVEM ter um nível (`block`/`warn`/`off`) para cada área: **tempo**, **mana** e
    **combate**. O padrão é `block` nas três. `warn` deixa fazer e registra no log; `off` volta ao sandbox de hoje
    nessa área.
33. QUANDO uma ação for bloqueada, o sistema DEVE explicar o motivo e oferecer "Fazer mesmo assim". Isso abre um
    **pedido de exceção** com a ação e um motivo opcional.
34. Num jogo online, o pedido DEVE ser aprovado por todos os outros jogadores ainda na partida. Uma recusa cancela.
    Quem pediu pode desistir. Enquanto o pedido estiver aberto, a partida espera.
35. Num jogo local, o pedido DEVE ser aprovado automaticamente.
36. Toda exceção aprovada DEVE ficar no log como ação de juiz, com o motivo.

### Dados das cartas e confiança
37. O motor DEVE receber as regras de cada carta (custo, tipo, P/T, lealdade, keywords, habilidades de mana
    reconhecidas, entra virado) como dados estruturados. O motor não lê texto.
38. No jogo online, o servidor DEVE preencher essas regras com o catálogo próprio e ignorar as que o cliente
    mandar. Uma carta que não esteja no catálogo fica "sem dados": o custo vira manual e ela não tem fontes de mana
    nem keywords.
39. Partidas salvas antes desta fase (salas online em andamento) DEVEM continuar abrindo, com as regras novas
    desligadas (`off`) para não quebrar a partida no meio.

## Requisitos não funcionais
- **Pureza e determinismo:** tudo no motor continua puro e determinístico. As fitness functions atuais continuam
  passando, incluindo "sem nomes de carta no núcleo".
- **Sem vazamento:** a reserva de mana, o combate e os pedidos são públicos. A escolha de descarte só aparece
  para quem descarta até ser feita.
- **Desempenho:** calcular a proposta de dano ou o pagamento automático com 20 criaturas e 30 fontes leva menos
  de 5 ms.
- **Bots:** tudo o que for decisão (atacantes, bloqueios, pagamento, descarte) é uma ação ou decisão pendente
  comum, para o bot do épico 06 usar o mesmo caminho.

## Critérios de aceite da fase
- Uma partida de 2 jogadores com decks de exemplo vai do primeiro turno até alguém morrer **por dano de combate**,
  sem nenhum ajuste manual de vida.
- Tentar um feitiço na manutenção, um segundo terreno no turno ou um ataque com criatura recém-chegada é bloqueado
  com uma mensagem clara. O pedido de exceção funciona online.
- O Command Tower, o Sol Ring, um terreno de dor e um Signet geram a mana certa sozinhos.
- Com as paradas padrão, um turno sem nada a fazer passa com no máximo 2 cliques.
