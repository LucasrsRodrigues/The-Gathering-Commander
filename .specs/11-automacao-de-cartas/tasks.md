# Tasks — 11 · Automação de cartas (fase 3c)

Quatro ondas e um fechamento:
- a onda 0 monta o modelo e a medição, sem mudar o jogo;
- as ondas 1 e 2 entregam cartas automáticas e entram no ar sozinhas;
- a onda 3 (gatilhos além de "entra no campo") é a próxima depois desta, decidida pela medição.

## Onda 0 — Modelo, leitor e medição
- [ ] **T11.1 — Modelo de efeitos no `engine`** _(req: 1)_
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
- [ ] **T11.2 — Leitor por frases e exceções em `packages/cards`** _(req: 2–4)_ · depende de T11.1
  - Escopo:
    - quebra do Oracle em frases (lembrete fora, nome vira `~`);
    - lista de padrões vazia com a estrutura de teste;
    - cobertura automática, parcial ou manual;
    - `packages/cards/overrides/<oracleId>.json` com validação.
  - Verificação:
    - fitness "nunca automática com frase não reconhecida";
    - uma exceção substitui o leitor;
    - as palavras-chave conhecidas contam como reconhecidas.
- [ ] **T11.3 — `edhrec_rank` no catálogo e o comando de cobertura** _(req: 16)_ · depende de T11.2
  - Escopo:
    - migração 0006 (coluna `edhrec_rank`) e o import lendo o campo;
    - `npm run coverage -w @gathering-hall/server`: top 1.000 e 5.000, mais as 30 frases não reconhecidas mais
      comuns, normalizadas.
  - Verificação:
    - roda no Postgres local com o bulk real e grava a linha de base;
    - testes com um catálogo pequeno.

## Onda 1 — Mana variável, mágicas e "entra no campo"
- [ ] **T11.4 — Mana variável** _(req: 11)_ · depende de T11.1
  - Escopo:
    - padrões "Add an amount of {G} equal to ~'s power", "Add {G} for each Elf you control" e parecidos;
    - `plan.ts` calcula o valor na hora.
  - Verificação:
    - Marwyn, Priest of Titania, Elvish Archdruid e Gaea's Cradle com o Oracle real;
    - o pagamento automático usa a quantidade certa;
    - a Marwyn com mais marcadores gera mais.
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
  - Critério de aceite da onda: a medição das top 1.000 com a meta de 35% automáticas ou parciais. A linha de base e
    o resultado ficam registrados aqui.

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
