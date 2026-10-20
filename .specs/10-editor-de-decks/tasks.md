# Tasks — 10 · Editor de decks estilo Moxfield

Quatro ondas. A onda 0 muda o formato do deck sem mudar a tela, e cada onda seguinte entra no ar sozinha.

## Onda 0 — Formato v2
- [x] **T10.1 — Deck v2 no `formats`, com migração e validação** _(req: 1–3)_
  - Escopo:
    - `Deck` v2 (tags, `maybe`, `folder`, `description`, `tagOrder`, `history`);
    - `migrateDeck` e `sanitizeDeck` aceitando v1 e v2;
    - limites compartilhados;
    - o app grava sempre v2;
    - `toValidation` e `toGameDeck` ignoram o Talvez.
  - Verificação:
    - fitness "v1 → v2 sem perda";
    - o Talvez nunca chega à validação nem à partida;
    - os limites recusam tags e descrições grandes demais.
  - Feito:
    - `Deck` v2 com `tags` por carta, `maybe`, `folder`, `description`, `tagOrder` e `history` (`DeckChange` e
      `ChangeLine` já com o formato do histórico);
    - o `sanitizeDeck` lê v1 e v2 e sempre devolve v2. A migração é a própria leitura (sem `migrateDeck` à parte),
      então vale para o IndexedDB, a nuvem e o servidor;
    - `DECK_LIMITS` e `MAX_DECK_DOC_BYTES` (128 KB) no `formats`;
    - tags e pastas sem caracteres de controle e sem repetição (ignorando maiúsculas);
    - no máximo 60 categorias no deck: as excedentes saem, e as cartas ficam;
    - `isLegacyDeck` fica pronto para a T10.2;
    - no app, `newDeck` grava v2, e o `moveCard` move entre quaisquer listas levando a arte e as categorias;
    - `deckSize`, estatísticas, validação e `toGameDeck` ignoram o Talvez (fitness).
  - Verificado no navegador: um deck v1 posto no IndexedDB abre no editor e é gravado de volta como v2, sem perda.
- [x] **T10.2 — Nuvem com v2: limite de 128 KB e recusa de regressão de versão** _(req: 3)_ · depende de T10.1
  - Verificação:
    - um `PUT` v1 sobre um v2 recebe `409` com o v2;
    - um app antigo (simulado) não sobrescreve;
    - um deck v1 da nuvem chega ao app novo já convertido.
  - Feito:
    - o limite da nuvem passou a ser por tipo: 128 KB para decks e 64 KB para presets;
    - um `PUT` v1 só é recusado (`409` com a versão do servidor) quando o deck guardado tem algo que o v1 não
      consegue levar: categorias, Talvez, pasta, descrição, ordem de categorias ou histórico (`hasV2Content`);
    - sobre um deck sem nada disso, a edição v1 entra e é guardada como v2, então o app antigo continua
      sincronizando enquanto não houver perda;
    - o `CloudStore.put` ganhou um `keepOver` opcional, decidido dentro da mesma transação.
  - **Mudança no design:** recusar todo v1 sobre v2 travaria o app antigo para sempre, porque desde a T10.1 o
    servidor já guarda tudo como v2. A recusa só quando haveria perda protege o mesmo e não trava ninguém.
- [x] **T10.3 — Histórico no modelo: diff, junção e volta** _(req: 16–18)_ · depende de T10.1
  - Escopo: `deckHistory` (`diff`, `record` com junção de 10 minutos, `replayBack`, restaurar); as operações do
    modelo registram as mudanças.
  - Verificação:
    - fitness "voltar tudo e reaplicar = deck atual";
    - uma carta que entra e sai na mesma junção some do histórico;
    - o limite de 50 descarta as mais antigas.
  - Feito:
    - `formats/deckHistory.ts`:
      - `diff` faz a diferença líquida por lista;
      - `record` e `withChange` juntam mudanças com menos de 10 minutos entre elas, e o que entrou e saiu se anula;
      - `versionAt` desfaz do fim para trás;
      - `restore` grava uma mudança nova, que nunca é juntada à anterior;
      - `applyForward` e `applyBackward` aplicam uma mudança para frente ou para trás;
    - no app, `addCard`, `removeCard` e `moveCard` registram sozinhos; um import vira uma mudança só;
    - trocar arte, nome ou categorias não entra no histórico;
    - uma carta restaurada que continua em outra lista do deck mantém as categorias e a arte.
  - **Mudança nos limites:** uma mudança nunca é cortada pela metade, senão o restaurar fica errado. Por isso, o
    limite de linhas por mudança sobe de 200 para 900 (um deck inteiro trocado). O tamanho fica controlado pela
    parte do histórico no documento (`MAX_HISTORY_BYTES`, 64 KB): as mudanças mais antigas saem primeiro, e a
    mais nova sempre fica.

## Onda 1 — Editor
- [x] **T10.4 — Casca nova do editor, visualizações e agrupamentos** _(req: 4, 5)_ · depende de T10.1
  - Escopo:
    - barra (visualização, agrupar, ordenar);
    - `grouping.ts`;
    - `ListView`, `StacksView` e `GridView`;
    - preferências no `localStorage`;
    - layout de tablet e de celular.
  - Verificação:
    - trocar de visualização ou de agrupamento com 100 cartas em menos de 100 ms;
    - as imagens só carregam quando visíveis;
    - no celular, só a lista.
  - Feito:
    - `decks/views/grouping.ts` (puro): agrupa por tipo, valor (com 7+ junto e os terrenos à parte), cor (cada cor,
      multicolor, incolor e terrenos) ou categoria principal (na ordem do deck, depois em ordem alfabética, com
      "Sem categoria" no fim); ordena por nome ou valor;
    - `DeckView` com lista, pilhas (só a faixa do nome aparece, e a última carta fica inteira) e grade, todas a
      partir dos mesmos grupos;
    - imagens `small` com `loading="lazy"`, e grupos com `content-visibility: auto`;
    - barra com visualização, agrupar e ordenar, guardados neste navegador (`gh-editor-view-v1`), com volta ao
      padrão se o armazenamento falhar;
    - abaixo de 1100 px, abas "Deck | Estatísticas" e alvos de 44 px; abaixo de 700 px, só a lista, numa coluna,
      com a página rolando por inteiro;
    - a `DeckList` antiga saiu.
  - Medido no navegador (57 entradas, 86 cartas): trocar de visualização leva cerca de 20 ms.
  - Pendente para a T10.5: nas pilhas, no toque, os botões +/− ficam escondidos. Até o menu da carta chegar, a
    edição por toque é pela lista.
- [x] **T10.5 — Menu da carta, seleção múltipla e arrastar** _(req: 7, 10)_ · depende de T10.4
  - Verificação:
    - toda ação de arrastar também existe no menu;
    - arrastar funciona por toque (tablet);
    - Shift/Ctrl seleciona vários;
    - o menu é operável por teclado.
  - Feito:
    - `decks/views/gestures.ts`: um só conjunto de handlers de ponteiro.
      - **Mouse:** botão direito abre o menu, e segurar e mover arrasta.
      - **Toque:** segurar 450 ms abre o menu, e segurar e mover arrasta. Mover antes disso é rolagem.
      - O clique depois de arrastar ou segurar é ignorado.
    - `CardMenu` com:
      - +1 / −1;
      - mover para o Talvez ou para o deck;
      - tornar comandante ou voltar ao deck;
      - trocar arte;
      - selecionar;
      - remover;
      - ações para todas as selecionadas.

      Ele é operável por teclado (setas, Home/End, Esc, Tab preso) e devolve o foco ao botão "⋯".
    - Seleção por Shift/Ctrl/⌘+clique ou pelo modo "Selecionar" (toque), com uma barra para mover para o Talvez,
      mover para o deck, remover e limpar. Esc limpa a seleção.
    - Alvos de arrastar (`data-drop`):
      - os grupos de categoria trocam a categoria principal (`setMainCategory`), e "Sem categoria" tira a
        principal;
      - qualquer grupo do deck recebe cartas do Talvez;
      - a área do Talvez recebe cartas do deck.

      Nos agrupamentos automáticos, arrastar entre grupos não muda nada. Arrastar uma carta selecionada leva todas.
    - `moveEntry` e `removeEntry` (todas as cópias) no modelo.
    - A área do Talvez já aparece no editor (recolhível e lembrada neste navegador), porque o menu e o arrastar
      precisavam dela. A T10.7 fica com a busca que adiciona ao Talvez e com os ajustes.
  - Verificado no navegador, com eventos de ponteiro reais:
    - arrastar com o mouse para o Talvez;
    - no toque, mover cedo não faz nada, e segurar e mover leva a carta de volta ao deck;
    - segurar sem mover abre o menu sem abrir a arte;
    - Shift+clique em 3 cartas e "Mover para o Talvez" leva o deck de 56 a 53;
    - o menu abre pelo "⋯" e navega por setas.
  - Ajuste de design: nas pilhas, a carta sob o mouse não sobe mais, porque cobria as de baixo. A prévia grande
    mostra a carta inteira, e a faixa do nome guarda só o "⋯".
  - Para a T10.14: nas pilhas, no toque, a faixa de cada carta tem cerca de 32 px de altura. O caminho de 44 px é a
    lista.
- [x] **T10.6 — Categorias e sugestões pelo Oracle** _(req: 6–8)_ · depende de T10.5
  - Escopo: criar, renomear e excluir categorias; definir a principal; agrupar por categoria; `tags.ts` com o painel
    de sugestões.
  - Verificação:
    - as sugestões acertam um conjunto de cartas conhecidas (Sol Ring, Cultivate, Swords to Plowshares, Wrath of God,
      Counterspell, Demonic Tutor, Rhystic Study);
    - nada muda sem aceitar;
    - excluir uma categoria tira a tag das cartas, sem remover as cartas.
  - Feito:
    - modelo:
      - `categoriesOf` lista na ordem do deck, contando a principal no deck;
      - `addCategory` cria uma categoria vazia, que vira grupo e alvo de arrastar;
      - `toggleCategory` liga e desliga, mantendo a grafia do deck;
      - `renameCategory` junta as duas quando o nome novo já existe;
      - `deleteCategory` tira a categoria e mantém as cartas;
      - `moveCategory` muda a ordem;
      - nada disso entra no histórico;
    - `decks/tags.ts`: sugestões de Terreno, Ramp, Compra, Remoção, Limpa-mesa, Contramágica e Tutor por padrões do
      texto Oracle e do tipo, nunca por nome; só sugere o que a carta ainda não tem;
    - painel "Categorias" na lateral:
      - lista com contagem, subir e descer, renomear, excluir (com "Desfazer") e nova;
      - clicar no nome destaca as cartas;
      - "N sugestões" abre a lista, com aceitar uma a uma ou "Aceitar todas";
    - no menu da carta, as categorias aparecem com ✓ ou ○ e "(principal)", mais "Tornar principal: X" e "Nova
      categoria…". Na carta selecionada, valem para a seleção inteira;
    - a barra de seleção ganhou "Categoria: aplicar…".
  - Verificado no navegador, no deck Krenko (56 entradas):
    - 17 sugestões sensatas, aceitas e agrupadas por categoria;
    - criar "Wincon" e arrastar Impact Tremors para ela;
    - renomear para "Finalizadores";
    - excluir, com a carta ficando no deck, e desfazer.
- [x] **T10.7 — Lista "Talvez"** _(req: 9, 10)_ · depende de T10.5
  - Verificação:
    - a busca adiciona ao Talvez;
    - um clique move entre deck e Talvez;
    - a validação, as estatísticas e o bracket ignoram o Talvez.
  - Feito (a área do Talvez, o menu e o arrastar vieram na T10.5):
    - a busca tem "Ao deck | Ao Talvez". Enter e o clique adicionam ao escolhido, e com Shift vão ao outro;
    - os resultados mostram quantas cópias há no deck e no Talvez ("T");
    - um clique move a carta: "Talvez" na linha do deck e "Ao deck" no Talvez, na lista e nas imagens, também no
      toque;
    - a validação, as estatísticas, o bracket, o tamanho do deck e a partida ignoram o Talvez (fitness da T10.1).
  - Verificado no navegador:
    - "Goblin Guide" com "Ao Talvez" e Enter entra no Talvez (3 → 4), e o total do deck fica em 53;
    - "Ao deck" leva a carta ao deck em um clique (53 → 54).
- [x] **T10.8 — Painel de estatísticas** _(req: 11, 12)_ · depende de T10.4
  - Escopo: curva com e sem terrenos, MV médio, cores do custo, fontes por cor, tipos, categorias e terrenos; clicar
    num valor destaca as cartas.
  - Verificação:
    - os números conferem num deck de exemplo calculado à mão;
    - o destaque funciona nas três visualizações.
  - Feito:
    - `decks/manaInfo.ts` lê os símbolos coloridos do custo e as cores que a carta gera:
      - `{W/U}` conta para as duas cores, e `{2/W}` e `{G/P}` contam para a sua cor;
      - "qualquer cor" e "identidade do comandante" contam para cada cor do comandante;
      - a fonte são as regras de carta do catálogo, ou o texto Oracle e os tipos básicos quando não há regras;
    - `deckStats` passou a dar:
      - a curva sem terrenos e o valor de mana médio com e sem terrenos;
      - os símbolos e as fontes por cor;
      - a contagem por tipo e por categoria principal;

      e continua ignorando o Talvez;
    - `cardsMatching` diz quais cartas cada número conta;
    - o `StatsCard` mostra a curva (com "Curva com terrenos"), a tabela de cor (símbolos e fontes, com a fonte em
      vermelho quando há símbolos e nenhuma fonte), os tipos e as categorias. Todo número é um botão que destaca
      as cartas, e um segundo clique ou "Tirar o destaque" apaga.
  - Verificado:
    - os números de um deck de teste calculado à mão batem (curva, médias, símbolos, fontes, tipos e categorias);
    - no navegador, a barra "valor 2" diz 7 cartas e destaca exatamente as 7;
    - as fontes vermelhas destacam Arcane Signet e as Mountains.
- [x] **T10.9 — Modo texto em massa** _(req: 13–15)_ · depende de T10.3, T10.6
  - Verificação:
    - fitness "serializar e ler de volta = mesmo deck";
    - aceita exportações reais do Moxfield e do Archidekt (com `(SET) número`, `*F*` e `#tags`);
    - salvar vira uma só mudança no histórico;
    - nomes não encontrados são listados sem perder o resto.
  - Feito:
    - `decks/bulkText.ts` (puro):
      - `serializeBulk` escreve as seções `Commander`, `Deck` e `Talvez`, com `(SET) número` da arte escolhida e
        `#tag` (`#"com espaço"`);
      - `parseBulk` lê o nosso formato, as linhas do Moxfield (`*F*`, `*CMDR*`, `#tag`) e as do Archidekt
        (`[Categoria, Outra]`, `^cores^` descartadas);
      - as seções Maybeboard e Sideboard vão para o Talvez, e Tokens é ignorada;
      - limites de 30.000 caracteres, 450 linhas e 200 por linha, e o texto é tratado só como texto;
    - `decks/bulkApply.ts`:
      - resolve os nomes e as artes por `(SET) número`;
      - refaz as três listas, juntando linhas repetidas;
      - sem `(SET)`, mantém a arte que a carta já tinha;
      - grava uma mudança nova no histórico (`merge: false`) e devolve os nomes não encontrados;
    - catálogo: `CatalogCard.print` (código e número da impressão) e `resolveSetNumbers` no Scryfall, por
      `/cards/collection` com `{ set, collector_number }`. O cache local foi para a v4 e é rebaixado uma vez;
    - botão "Texto" no editor, com o diálogo "Editar como texto". Ele mostra os nomes que ficaram de fora e as
      linhas não entendidas.
  - Verificado:
    - fitness "escrever e salvar de volta = mesmo deck", e nada entra no histórico quando nada muda;
    - linhas reais do Moxfield e do Archidekt;
    - no navegador, editar o deck Krenko pelo texto (+1 Goblin Guide, −1 Mountain e um nome inexistente) salva o
      resto, lista o nome que faltou e grava uma mudança só no histórico.
- [x] **T10.10 — Tela do histórico e restaurar** _(req: 16–18)_ · depende de T10.3, T10.4
  - Verificação:
    - ver o deck num ponto antigo sem alterá-lo;
    - restaurar e desfazer;
    - mudanças agrupadas por dia.
  - Feito:
    - `decks/historyView.ts` (puro): o resumo por lista ("+2 Sol Ring, −1 Mind Stone", "Talvez: …") e o
      agrupamento por dia ("Hoje", "Ontem", data), do mais novo para o mais antigo;
    - botão "Histórico" no editor, com o diálogo:
      - as mudanças por dia, mais "Antes da primeira mudança guardada";
      - escolher uma mostra o deck como estava logo depois dela, só para leitura (cartas por tipo, comandante e
        Talvez);
      - o diálogo mostra o que restaurar faria;
    - "Restaurar esta versão" grava uma mudança nova (`restoreVersion`), e o toast traz "Desfazer".
  - Verificado no navegador, no deck Krenko:
    - 4 mudanças em "Hoje", com o import inteiro como uma mudança só;
    - ver a versão do import não altera o deck (54);
    - restaurar leva a 56, e "Desfazer" volta a 54.
  - O critério de aceite da onda (tablet real) fica para a medição da T10.14. No navegador, na largura de tablet,
    pilhas por categoria, arrastar por toque e mandar ao Talvez já foram conferidos (T10.4 a T10.7).
  - Critério de aceite da onda: no tablet real, montar um deck em pilhas por categoria, arrastando cartas, e mandar
    cartas ao Talvez, com rolagem fluida em 100 cartas.

## Onda 2 — Biblioteca e importar
- [x] **T10.11 — Biblioteca com pastas, busca e cards com arte** _(req: 19–21)_ · depende de T10.1
  - Verificação:
    - mover decks entre pastas pelo menu e arrastando;
    - excluir uma pasta mantém os decks;
    - a busca encontra pelo comandante;
    - as pastas sincronizam pela nuvem.
  - Feito:
    - `decks/library.ts` (puro):
      - lista as pastas uma vez cada, sem diferenciar maiúsculas, com contagem;
      - filtra por todas, sem pasta ou uma pasta;
      - busca pelo nome do deck ou do comandante, sem acento nem maiúscula;
      - ordena por editado, nome ou cor (WUBRG, multicolor, incolor, sem dados);
      - `setFolder` grava a pasta no deck;
    - pastas vazias ficam só neste navegador (`gh-deck-folders-v1`) até receber um deck. As outras são um campo do
      deck e sincronizam com ele (o servidor valida desde a T10.1);
    - `useDeckSummaries` calcula em segundo plano, deck a deck, a identidade, a arte do comandante (`art_crop`) e
      a validade contra as regras do próprio deck, guardando por versão do deck;
    - a tela:
      - coluna de pastas com Todas, Sem pasta e as pastas, cada uma com contagem, renomear e excluir (com
        "Desfazer"), mais "Nova pasta";
      - busca e ordenação;
      - cards com arte, cores, cartas, validade e pasta;
      - um "Pasta" em cada card, e arrastar o card até uma pasta;
      - "Novo deck" dentro de uma pasta já nasce nela;
    - abaixo de 900 px, as pastas viram uma faixa no topo, e só a pasta aberta mostra renomear e excluir.
  - Verificado no navegador:
    - criar "Casuais" (vazia), arrastar o deck Krenko para ela, buscar por "mob boss", renomear para "Festa",
      excluir (os decks continuam) e desfazer;
    - os cards mostram a arte, as cores e "✗ 2 problema(s) em Commander oficial".
  - Observação: a validade na biblioteca usa o mesmo caminho do setup (`factsForDate`), então a primeira visita
    com muitos decks busca as cartas que ainda não estão no cache.
- [ ] **T10.12 — Importar por link do Archidekt e do Moxfield** _(req: 22–24)_ · depende de T10.1
  - Escopo: `POST /api/import/deck` (allowlist, URL montada pelo id, timeout, limite de tamanho, rate limit),
    normalização dos dois formatos e o campo "Colar link" no app.
  - Verificação:
    - testes com respostas gravadas dos dois sites, sem chamadas reais no CI;
    - URL de outro host, IP ou porta é recusada;
    - um bloqueio do Moxfield leva ao colar texto;
    - categorias e Talvez chegam certos.

## Onda 3 — Compartilhar
- [ ] **T10.13 — Link público do deck** _(req: 25–28)_ · depende de T10.2
  - Escopo:
    - migração `0005-deck-share.sql`;
    - rotas para ligar, desligar e ler o público;
    - `PublicDeckScreen` em `#/d/<slug>`;
    - "Copiar para meus decks" e "Exportar texto";
    - exclusão e exportação da conta incluem os links.
  - Verificação:
    - abre sem conta, numa janela anônima;
    - não expõe `user_id`, histórico nem pasta;
    - desligar dá `404` na hora;
    - ligar de novo gera outro slug;
    - excluir a conta derruba os links.

## Fechamento
- [ ] **T10.14 — Revisão de tablet, acessibilidade e desempenho**
  - Escopo:
    - medir no tablet real (pilhas, arrastar, imagens);
    - teclado e leitor de tela na lista;
    - alvos de 44 px;
    - texto de privacidade do link público no LEGAL.md.
- [ ] **T10.15 — README, roadmap e notas de migração**

## Estratégia de testes
- O modelo (migração, histórico, agrupamento, sugestões, modo texto) é puro e testado no `formats` e na web, com
  fitness functions de ida e volta.
- O import é testado com respostas gravadas (fixtures) dos dois sites. As chamadas reais nunca rodam no CI.
- As rotas novas do servidor rodam no PGlite e no Postgres real (`TEST_DATABASE_URL`), como no épico 08.
- O editor, o arrastar e a página pública são conferidos no navegador, no computador e na largura de tablet, e numa
  medição final no tablet real.
