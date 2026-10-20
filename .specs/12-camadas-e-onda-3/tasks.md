# Tasks — 12 · Camadas e automação, onda 3 (fase 3d)

Cinco ondas e um fechamento.
- **Portão da onda A:** troca as leituras das características sem mudar nenhum resultado. Todos os testes do épico
  11 têm que passar iguais antes de qualquer efeito contínuo ligar.
- **Ondas B a E:** cada uma entrega cartas automáticas e entra no ar sozinha.

## Onda A — Características e camadas
- [x] **T12.1 — Características calculadas, sem efeitos ainda** _(req: 1, 6)_
  - Escopo:
    - `layers.ts` com `characteristics(state)`, `charsOf` e o cache (`WeakMap` por estado; no `Tx`, descartado a
      cada escrita);
    - `CardRules.colors` no leitor (custo de mana e indicador de cor do Scryfall), no app e no servidor;
    - as 83 leituras passam a usar `charsOf`: `typesOf`, `hasKeyword`, `isCreature`, `powerOf`, `toughnessOf`,
      `matchesFilter`, controlador em combate e mana, e a visão;
    - fitness: nada fora de `layers.ts`, `cards.ts` e `deriveRules.ts` lê
      `card.rules.{types,subtypes,supertypes,keywords,power,toughness,colors}`.
  - Verificação:
    - todos os testes atuais passam sem mudar nenhuma expectativa;
    - propriedade: sem efeitos contínuos, `charsOf` é igual à carta impressa em estados aleatórios;
    - orçamento: 100 permanentes em menos de 2 ms.
  - Feito:
    - `layers.ts`:
      - `Characteristics`: tipos, subtipos, supertipos, cores, palavras-chave, força, resistência e controlador;
      - `printed(card, controlador)`, `charsOf(state, obj)` e os atalhos `isType`, `hasKeywordNow`,
        `controllerOf`, `isLand` e `hasInstantSpeed`.
      - Sem efeitos, `charsOf` é o impresso mais os marcadores e os ajustes "até o fim do turno", a mesma conta
        que o `stats.ts` fazia.
    - **Cor de verdade (CR 202.2):** vem dos símbolos do custo (híbridos e phyrexianos incluídos). As fichas trazem
      a sua em `CardRules.colors`.
      - **Mudança no plano:** o catálogo não guarda o `colors` do Scryfall, e acrescentar exigiria mudar o formato
        e reimportar. Ficou para quando precisar.
      - Cartas com indicador de cor e sem custo (Dryad Arbor, Ancestral Vision) ficam incolores por enquanto.
      - O `Filter.colors` passa a olhar a cor (antes olhava a identidade). Nenhum padrão do leitor usava.
    - As leituras foram trocadas em `stats`, `combat`, `damage`, `mana`, `policies`, `reduce`, `stateBased`,
      `view`, `zones`, `effects/apply`, `effects/value` e `effects/targets`. Junto foi o controlador no combate,
      no ganho de vida por vínculo e nos filtros.
      - `powerOf`, `toughnessOf`, `isCreature` e `isPlaneswalker` recebem o estado.
      - `cards.ts` ficou só com `typesOf`, usado só pelo `layers.ts`.
    - Os alvos e filtros olham as características do motor. Na visão online, por enquanto, usam o impresso: a
      visão com as calculadas é a T12.3.
    - **Decisão para a T12.2:** sem efeitos, não há cache. O cálculo por tabuleiro entra com as camadas, e o cache
      dentro do `Tx` precisa lidar com escritas feitas por referência (`tx.object(id)` guardado e escrito depois).
  - Verificado:
    - os 233 testes do motor de antes passam sem mudar nenhuma expectativa;
    - testes novos (`test/layers.test.ts`):
      - fitness: só `layers.ts`, `cards.ts`, `deriveRules.ts` e `oracle/` leem tipos, palavras-chave, P/R ou cor
        da carta impressa, e só `layers.ts` importa `cards.ts`;
      - propriedade, em 5 tabuleiros aleatórios de 100 permanentes com marcadores e ajustes: as características
        são iguais à carta impressa mais marcadores e ajustes;
      - orçamento: 100 permanentes em menos de 2 ms;
      - a cor a partir do custo.
- [x] **T12.2 — Camadas 1 a 7, timestamps e dependências** _(req: 2–5)_ · depende de T12.1
  - Escopo:
    - `ContinuousEffect`, `Affected`, `Change` e `Duration` em `types.ts`;
    - `state.effects` para os efeitos resolvidos;
    - o algoritmo de camadas: características definidas por habilidade primeiro, timestamp e dependência testada
      literalmente (613.8a), com ciclo resolvido por timestamp;
    - a camada 6, que tira habilidades, recalcula a lista de efeitos nas camadas seguintes;
    - marcadores e `ptMods` na 7c (`migrateState`);
    - fim de "até o fim do turno" na limpeza (514.2).
  - Verificação:
    - os exemplos de 613 e 613.8 escritos como testes, com cartas de teste:
      - anthem e "set base P/T";
      - mudança de tipo antes de habilidade;
      - Humility com Opalescence (ciclo, por timestamp);
      - Blood Moon e um terreno que ganha habilidade;
    - replay determinístico;
    - partida salva antiga abre.
  - Feito:
    - **Modelo** (`types.ts`):
      - `Layer`, `Change`, `Affected`, `Duration`;
      - `StaticAbility { affects, changes[], cda? }`: uma habilidade com partes em várias camadas, como
        Opalescence (tipo na 4, P/R na 7b);
      - `ContinuousEffect`, guardado em `state.effects`;
      - `GameObject.attachedTo`, já previsto para a T12.4;
      - `Filter.notSupertypes` ("nonbasic");
      - `Value.manaValue` da origem ou do objeto afetado.
    - **Algoritmo** (`layers.ts`), por camada (1, 2, 3, 4, 5, 6, 7a, 7b, 7c, 7d):
      - os marcadores e os ajustes manuais entram na 7c (613.4c);
      - as características definidas por habilidade vêm primeiro;
      - depois, o menor timestamp que não depende de outro que falta, ou o menor timestamp num ciclo (613.8b);
      - uma estática perdida antes de começar não aplica, mas uma que já começou numa camada anterior continua até
        o fim, nos mesmos objetos (613.5, 613.6);
      - um conjunto travado na resolução não segue um objeto que saiu e voltou (timestamp, CR 400.7);
      - 305.7: definir o tipo de terreno tira as habilidades do texto e dá a mana do tipo básico; somar dá a mana a
        mais (305.6);
      - permanente virada para baixo: 2/2 sem nada (708.2).
    - **Dependência** (613.8a): testada de verdade, aplicando o outro efeito numa cópia e comparando três coisas:
      - se o efeito existe;
      - em que ele se aplica;
      - o que ele faz.

      Antes do teste há um filtro barato: mudanças de P/R ou de palavras-chave só criam dependência com um efeito
      que lê força ou resistência.
    - **Cache:** por estado, com os fatos que o cálculo usou, comparados antes de reaproveitar:
      - os objetos do campo, os marcadores, os ajustes e o anexo;
      - os efeitos;
      - o tamanho das mãos e dos cemitérios.

      Assim, a escrita feita por referência dentro do `Tx` não deixa o cálculo velho. Sem nenhum efeito no campo, o
      caminho rápido do impresso continua.
    - `continuous.ts`: `addEffect` (com timestamp) e `endEffects` na limpeza. Os "até o fim do turno" acabam (514.2),
      e os de fonte que saiu do campo também.
    - **Mudança no plano:** os `ptMods` manuais não viraram `state.effects`. Eles já são exatamente um efeito 7c
      "até o fim do turno" do objeto, e o `layers.ts` os aplica nessa subcamada. Assim, o `migrateState` não precisou
      mudar, e as partidas salvas abrem iguais.
  - Verificado (`test/layers613.test.ts`, 12 testes, com cartas de teste):
    - 7b antes da 7c, seja qual for o timestamp; marcadores na 7c; troca na 7d;
    - o anthem acompanha o campo e some com a fonte;
    - camada 2 antes da 7c: a criatura roubada ganha o anthem do novo controlador;
    - camada 4 antes da 6: o artefato virado criatura ganha voar de um efeito mais antigo e a P/R do próprio custo;
    - Humility e Opalescence nas duas ordens: o timestamp decide na 7b, e a Humility, que perdeu as próprias
      habilidades, continua valendo (613.6);
    - Blood Moon e Urborg nas duas ordens: o Urborg depende do Blood Moon, perde a habilidade e não deixa a
      Floresta virar Pântano. Sem o Blood Moon, todo terreno vira também Pântano, com a mana;
    - cópia (camada 1) com os valores impressos, e o anthem por cima;
    - característica definida por habilidade (7a) e depois o anthem;
    - conjunto travado e objeto que voltou;
    - fim do turno.
    - **Orçamento:** 100 permanentes e 10 anthems, 0,4 ms por tabuleiro sem cache. O teste usa o melhor de 5 lotes,
      porque a média passou de 2 ms com a suíte inteira em paralelo e a máquina com carga 8.
    - Todos os 237 testes de antes passam iguais.
- [ ] **T12.3 — A visão e a prévia com as características calculadas** _(req: 6)_ · depende de T12.2
  - Escopo:
    - `ObjectView` com tipos, palavras-chave, cores, P/R, controlador e anexo calculados;
    - a mesa e a prévia leem daí;
    - a prévia mostra o que mudou ("Agora 3/3, impressa 2/2", "Voar, das Botas").
  - Verificação:
    - a prévia no navegador com um efeito de teste;
    - a visão filtrada continua sem vazar informação oculta (fitness).

## Onda B — Anexar e estáticas
- [ ] **T12.4 — Equipar e Auras** _(req: 7–9)_ · depende de T12.2
  - Escopo:
    - `attachedTo`, que se solta quando a permanente sai do campo;
    - efeito `attach`;
    - "Equip {N}", só como feitiço;
    - `CardRules.enchant` e o alvo ao lançar a Aura;
    - as ações baseadas em estado dos anexos;
    - na mesa: anexo encaixado embaixo do objeto, "Equipar" no menu e o modo alvo para a criatura.
  - Verificação:
    - Swiftfoot Boots e Lightning Greaves, com o Oracle real;
    - equipar outra criatura tira o bônus da primeira;
    - Aura cujo objeto sai vai para o cemitério;
    - no navegador e na largura de tablet.
- [ ] **T12.5 — Estáticas comuns** _(req: 2, 18)_ · depende de T12.4
  - Escopo: as estáticas do design:
    - "Equipped/Enchanted creature gets/has";
    - anthems e "Other <subtipo> you control";
    - "have <palavras-chave>";
    - "You control enchanted …" (camada 2);
    - "Enchanted land is a …" (camada 4);
    - Blood Moon e Humility, cada uma com teste;
    - as regras do jogador: sem máximo de mão, terreno a mais.
  - Verificação:
    - Elvish Archdruid e Glorious Anthem;
    - Control Magic, que devolve o controle quando sai;
    - Reliquary Tower e Exploration;
    - Oracle real de cada padrão.

## Onda C — Entrar no campo e Ciclagem
- [ ] **T12.6 — "As this enters…" e terrenos condicionais** _(req: 10, 11)_ · depende de T12.2
  - Escopo:
    - a decisão `enterChoice` na entrada: pagar vida, escolher um tipo e copiar (camada 1);
    - `GameObject.chosen`;
    - `tappedUnless` com as condições do design;
    - os painéis na mesa.
  - Verificação:
    - Watery Grave e as shock lands;
    - os terrenos de "two or more other lands" e de "two or more opponents";
    - Cavern of Souls escolhe o tipo;
    - Clone copia, e os marcadores e anthems aplicam por cima.
- [ ] **T12.7 — Ciclagem e habilidades na mão** _(req: 14)_ · depende de T12.4
  - Escopo:
    - `ActivatedAbility.from: 'hand'`;
    - custo de descartar a própria carta;
    - "Cycling {N}" e as cicladas com busca de tipo;
    - "Ciclar" no menu da carta na mão.
  - Verificação: os Triomes e as cicladas comuns do top 1.000.

## Onda D — Modos e contramágicas
- [ ] **T12.8 — Modos** _(req: 12)_ · depende de T12.2
  - Escopo:
    - `Ability.modes`;
    - `castSpell.modes`;
    - os alvos por modo;
    - o leitor de "Choose one / one or more / two —";
    - o painel de modos antes da faixa de alvos.
  - Verificação:
    - Abrade, Collective Resistance e os modais comuns;
    - só os modos escolhidos pedem alvos e resolvem;
    - pelo teclado.
- [ ] **T12.9 — Contramágicas e "can't be countered"** _(req: 13)_ · depende de T12.8
  - Escopo:
    - efeito `counter` com alvo na pilha;
    - `uncounterable`;
    - o leitor de "Counter target <filtro> spell".
  - Verificação:
    - Counterspell, Negate e Swan Song (com a ficha);
    - Dovin's Veto em mágica que não pode ser anulada;
    - um comandante anulado pode voltar à zona de comando.

## Onda E — Gatilhos e "você pode"
- [ ] **T12.10 — Gatilhos de morrer, atacar, manutenção, etapa final e "outra entra"** _(req: 15)_ · depende de T12.2
  - Escopo:
    - `CardRules.triggers`;
    - a detecção pelos eventos da ação;
    - o último estado conhecido para "sair do campo" (603.10);
    - os padrões do leitor.
  - Verificação:
    - Blood Artist e Zulaport Cutthroat;
    - um gatilho de atacar;
    - um gatilho de manutenção;
    - Soul Warden;
    - uma criatura com +1/+1 de anthem morre e o gatilho vê a força que ela tinha.
- [ ] **T12.11 — Ordem dos gatilhos** _(req: 16)_ · depende de T12.10
  - Escopo: a decisão `orderTriggers`, só com duas ou mais ordens possíveis, e o painel com ↑↓.
  - Verificação:
    - duas mortes com Blood Artist e Zulaport no campo;
    - a ordem escolhida é a da pilha;
    - online, só quem tem os gatilhos escolhe.
- [ ] **T12.12 — "Você pode…"** _(req: 17)_ · depende de T12.10
  - Escopo:
    - `Effect.optional` e `ifYouDo`;
    - a decisão `confirmOptional`;
    - o leitor de "you may … [If you do, …]";
    - o "Sim / Não" na mesa.
  - Verificação:
    - Reclamation Sage e Solemn Simulacrum ficam automáticas;
    - "Não" pula só aquele efeito e os que dependem dele.

## Fechamento
- [ ] **T12.13 — Revisão (correção, online, tablet)**
  - Escopo:
    - medir a cobertura;
    - revisar as automáticas novas contra o Oracle, como na T11.13;
    - uma partida online com equipamentos, anthems e contramágica;
    - conferir no tablet real, junto com o que ficou do épico 10 e do épico 11.
  - Critério de aceite: no top 1.000, as automáticas passam de 18,3% para **pelo menos 25%**.
- [ ] **T12.14 — README, roadmap e a lista da onda 4**

## Estratégia de testes
- **Camadas:** os exemplos das regras, escritos por nós com cartas de teste, e uma propriedade "sem efeitos =
  impresso".
- **Leitor:** frase a frase, com o Oracle real de pelo menos duas cartas.
- **Motor:** replay determinístico, estado serializável e nenhum vazamento na visão.
- **Interface:** no navegador, com eventos de ponteiro reais, e no tablet real no fechamento.
