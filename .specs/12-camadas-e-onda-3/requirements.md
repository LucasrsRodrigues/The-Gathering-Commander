# Requirements — 12 · Camadas e automação, onda 3 (fase 3d)

## Objetivo
O motor passa a entender o que muda as cartas enquanto elas estão no campo:
- equipamentos e Auras;
- "suas criaturas recebem +1/+1";
- "têm ímpeto";
- "você controla a criatura encantada";
- cópias.

Tudo pelo sistema de camadas das regras (CR 613). Com isso, a onda 3 automatiza as frases manuais mais comuns que
sobraram do épico 11:
- equipar e Auras;
- terrenos que entram virados conforme uma condição;
- Ciclagem;
- modos;
- contramágicas;
- gatilhos de morrer, atacar e manutenção;
- "você pode…".

## Contexto e suposições
- **Hoje (épicos 09 e 11):**
  - as características vêm direto da carta impressa (`card.rules`): tipos, palavras-chave, força e resistência;
  - força e resistência somam o impresso, os marcadores +1/+1 e −1/−1 e os ajustes "até o fim do turno"
    (`stats.ts`);
  - o controlador é um campo do objeto, definido quando ele muda de zona;
  - são 83 leituras dessas características, espalhadas em 11 arquivos do motor (combate, dano, mana, alvos,
    filtros, ações baseadas em estado, visão…).
- **A cor de uma carta** (CR 105.2) não existe nas regras. Os filtros por cor usam a identidade de cor, que é outra
  coisa (CR 903.4). As camadas precisam da cor de verdade.
- **Cobertura:** no top 1.000 do EDHREC, 18,3% das cartas são automáticas e 47,3% são automáticas ou parciais
  (Scryfall de 2026-10-19, fim do épico 11).
- As referências continuam as mesmas: o XMage e o Forge implementam camadas, e seguimos a ideia **sem copiar código
  nem scripts**, escrevendo a partir das Comprehensive Rules e do texto Oracle.

### Decisões (2026-10-20)
- **Escopo:** os quatro grupos:
  - equipar e Auras;
  - terrenos condicionais e Ciclagem;
  - modos e contramágicas;
  - efeitos contínuos e gatilhos, com "você pode".
- **Camadas completas** (CR 613):
  - as sete camadas, com as subcamadas 7a a 7d;
  - timestamps (613.7) e dependências (613.8);
  - características definidas por habilidade (604.3).

  Não é uma versão simplificada só de força, resistência e palavras-chave.
- **Anexar:** equipar e lançar Aura usam o modo alvo da mesa (o mesmo do épico 11). A carta anexada aparece encaixada
  embaixo da criatura.
- **"Você pode…":** o jogo sempre pergunta, com "Sim / Não" na mesa, como no Arena.

## Escopo
**Dentro:**
- **Características calculadas:**
  - toda leitura de tipo, subtipo, supertipo, cor, palavras-chave, força, resistência e controlador passa por uma
    função só, que aplica as camadas;
  - a cor de verdade entra nas regras da carta.
- **Camadas 1 a 7** (CR 613.1), com as subcamadas 7a a 7d (613.4), em três ordens:
  - timestamps (613.7);
  - dependências (613.8);
  - características definidas por habilidade (604.3, 613.3).
- **Fontes de efeitos contínuos:**
  - habilidades estáticas de permanentes;
  - efeitos de mágicas e habilidades que já resolveram, com duração ("até o fim do turno", "enquanto…");
  - anexos.
- **Equipar e Auras:**
  - anexar (CR 301.5, 303.4);
  - "Equip {N}" na velocidade de feitiço (702.6);
  - Aura com alvo ao lançar;
  - restrição de "Enchant";
  - as ações baseadas em estado dos anexos (704.5m, 704.5n);
  - os bônus de "Equipped/Enchanted creature gets/has".
- **Estáticas comuns:**
  - "Creatures you control get +N/+N", "Other <tipo> you control…";
  - "have <palavra-chave>";
  - "You control enchanted creature" (camada 2);
  - mudanças de tipo e de cor;
  - regras do jogador: "no maximum hand size", "an additional land each turn".
- **Entrar com escolha** ("As this enters…", CR 614.1c e 614.12):
  - pagar vida (shock lands);
  - escolher um tipo de criatura;
  - entrar como cópia (Clone, camada 1).
- **Terrenos condicionais:** "enters tapped unless…" (outras terras, terras básicas, número de oponentes).
- **Ciclagem** (702.29) e habilidades ativadas a partir da mão.
- **Modos:**
  - "Choose one —", "Choose one or more —" e "Choose two —" (CR 700.2);
  - os modos são escolhidos antes dos alvos (601.2b).
- **Contramágicas:**
  - "Counter target spell" e variações com filtro, com o alvo na pilha (701.5);
  - "This spell can't be countered".
- **Gatilhos novos:**
  - morrer (700.4), com o último estado conhecido (603.10);
  - atacar (508.1m);
  - começo da manutenção e da etapa final;
  - "whenever another creature [you control] enters".
- **Ordem dos gatilhos:** quem tem dois ou mais gatilhos ao mesmo tempo escolhe a ordem (CR 603.3b). No épico 11, a
  ordem era fixa, a do texto.
- **"Você pode…"** em efeitos e gatilhos (603.5): uma decisão "Sim / Não".
- Medição da cobertura e os selos, como no épico 11.

**Fora (fica para depois):**
- efeitos de substituição gerais ("se fosse…, em vez disso…", Doubling Season), além do "As this enters";
- custos adicionais e alternativos, e reduções de custo;
- efeitos que mudam texto (camada 3): ficam no modelo, mas o leitor não gera nenhum;
- proteção, prevenção de dano e "can't be blocked except by…";
- habilidades de lealdade dos planeswalkers;
- controlar o turno de outro jogador.

Nessas cartas, a parte não coberta continua manual, como hoje.

## User stories
- *Como jogador*, equipo as Swiftfoot Boots clicando na minha criatura. Ela ganha ímpeto e resistência a magia, e a
  bota aparece encaixada embaixo dela.
- *Como jogador de Elfos*, baixo o Elvish Archdruid, e meus outros Elfos ficam +1/+1 sozinhos, inclusive os que
  entram depois.
- *Como jogador*, lanço Control Magic numa criatura do oponente, e ela passa a ser minha enquanto a Aura estiver lá.
- *Como jogador*, conjuro Counterspell na mágica do oponente, que vai para o cemitério sem resolver.
- *Como jogador*, jogo Watery Grave, e o jogo pergunta se pago 2 de vida para ela entrar desvirada.
- *Como jogador*, quando duas criaturas minhas morrem com Blood Artist em jogo, cada morte dispara sozinha.

## Requisitos funcionais (EARS)

### Camadas
1. O motor DEVE calcular as características de cada objeto num lugar só:
   - tipos, subtipos e supertipos;
   - cores;
   - palavras-chave e outras habilidades;
   - força e resistência;
   - controlador.

   Nenhuma regra (combate, mana, alvos, filtros, ações baseadas em estado, visão) DEVE ler a carta impressa
   diretamente (fitness).
2. Os efeitos contínuos DEVEM ser aplicados camada por camada, na ordem de CR 613.1:
   1. cópia;
   2. controle;
   3. texto;
   4. tipo;
   5. cor;
   6. habilidades;
   7. força e resistência, em 7a (características definidas por habilidade), 7b (definir), 7c (modificar, com
      marcadores) e 7d (trocar).
3. Dentro de uma camada, os efeitos DEVEM ser aplicados em ordem de timestamp (CR 613.7), exceto quando um depende
   do outro (613.8): aí o dependente vem depois. SE as dependências formarem um ciclo, ENTÃO vale o timestamp.
4. As características definidas por habilidade DEVEM ser aplicadas antes das outras da mesma camada (613.3).
5. QUANDO um efeito tiver duração ("até o fim do turno", "enquanto <condição>") e ela terminar, ele DEVE parar de
   valer na hora certa (CR 514.2, 611.2b).
6. A visão de cada jogador DEVE mostrar as características calculadas, e a prévia DEVE mostrar o que mudou em
   relação à carta impressa.

### Anexar
7. QUANDO um equipamento for equipado (velocidade de feitiço, com alvo numa criatura que o jogador controla) ou uma
   Aura resolver, a permanente DEVE ficar anexada ao alvo.
8. SE uma Aura ficar sem objeto, ou presa a um objeto que ela não pode encantar, ENTÃO ela DEVE ir para o cemitério
   (CR 704.5m). SE for um equipamento numa permanente que não é criatura, ENTÃO ele DEVE se soltar e ficar no campo
   (704.5n).
9. A mesa DEVE mostrar a permanente anexada encaixada embaixo do objeto. Equipar DEVE usar o modo alvo, com as
   criaturas válidas em destaque.

### Entrar no campo
10. QUANDO uma permanente com "As this enters…" for entrar, o motor DEVE pedir a escolha antes de ela entrar:
    - pagar vida;
    - escolher um tipo;
    - escolher o que copiar.
11. QUANDO um terreno com "enters tapped unless <condição>" entrar, o motor DEVE checar a condição naquele momento.

### Modos, contramágicas e Ciclagem
12. QUANDO uma mágica modal for lançada, o jogador DEVE escolher os modos antes dos alvos, e só os modos escolhidos
    DEVEM pedir alvos e resolver.
13. QUANDO uma contramágica resolver, a mágica alvo DEVE ir para o cemitério do dono sem resolver, exceto se ela
    "não pode ser anulada".
14. A Ciclagem e outras habilidades ativadas a partir da mão DEVEM aparecer no menu da carta na mão e seguir as
    regras de custo do épico 11.

### Gatilhos e "você pode"
15. QUANDO uma permanente morrer, atacar, ou começar a manutenção ou a etapa final do controlador, os gatilhos
    correspondentes DEVEM ir para a pilha. Os gatilhos de "sair do campo" DEVEM usar o último estado conhecido do
    objeto (CR 603.10).
16. QUANDO um jogador tiver dois ou mais gatilhos para pôr na pilha ao mesmo tempo, ele DEVE poder escolher a ordem
    (CR 603.3b). Com uma ordem só possível, nada é perguntado.
17. QUANDO um efeito disser "você pode", o motor DEVE perguntar "Sim / Não" ao jogador na resolução, e "Não" pula
    só aquele efeito.

### Cobertura
18. A medição do épico 11 DEVE continuar, e as cartas que as camadas cobrem DEVEM ganhar o selo.

## Requisitos não funcionais
- **Correção:**
  - na dúvida, manual;
  - cada frase reconhecida tem teste com o Oracle real;
  - as camadas e dependências têm testes com os exemplos das próprias regras (CR 613), escritos por nós;
  - as partidas do épico 11 continuam iguais (todos os testes de motor existentes passam sem mudar o resultado).
- **Desempenho:**
  - com 4 jogadores e 100 permanentes, o cálculo de todas as características leva menos de 2 ms por ação no
    computador de desenvolvimento;
  - o cálculo é guardado por estado e refeito só quando o estado muda.
- **Determinismo:** como no resto do motor. Replays e "Desfazer" continuam funcionando.
- **Compatibilidade:** partidas salvas antes do épico abrem (`migrateState`), e os ajustes manuais "até o fim do
  turno" viram efeitos da camada 7c.
- **Fan Content Policy:** como no épico 11.

## Critérios de aceite da fase
- Swiftfoot Boots equipadas dão ímpeto e resistência a magia. Ao equipar outra criatura, a primeira perde os dois.
- Elvish Archdruid deixa os outros Elfos +1/+1. Os que entram depois também ficam, e o bônus some quando o
  Archdruid sai.
- Control Magic troca o controle da criatura. Quando a Aura sai, a criatura volta.
- Clone entra como cópia da criatura escolhida, com os marcadores e bônus aplicados por cima, nas camadas certas.
- Os exemplos de dependência das regras (CR 613.8) dão o resultado das regras.
- Counterspell anula uma mágica, e uma mágica com "can't be countered" continua na pilha.
- Watery Grave pergunta "pagar 2 de vida?". Um terreno com "unless you control two or more other lands" entra como
  as regras mandam.
- Blood Artist dispara a cada morte, e com dois gatilhos ao mesmo tempo o jogador escolhe a ordem.
- No top 1.000, as automáticas passam de 18,3% para **pelo menos 25%**.
