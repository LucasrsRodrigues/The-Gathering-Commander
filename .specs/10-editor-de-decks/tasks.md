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
- [ ] **T10.5 — Menu da carta, seleção múltipla e arrastar** _(req: 7, 10)_ · depende de T10.4
  - Verificação:
    - toda ação de arrastar também existe no menu;
    - arrastar funciona por toque (tablet);
    - Shift/Ctrl seleciona vários;
    - o menu é operável por teclado.
- [ ] **T10.6 — Categorias e sugestões pelo Oracle** _(req: 6–8)_ · depende de T10.5
  - Escopo: criar, renomear e excluir categorias; definir a principal; agrupar por categoria; `tags.ts` com o painel
    de sugestões.
  - Verificação:
    - as sugestões acertam um conjunto de cartas conhecidas (Sol Ring, Cultivate, Swords to Plowshares, Wrath of God,
      Counterspell, Demonic Tutor, Rhystic Study);
    - nada muda sem aceitar;
    - excluir uma categoria tira a tag das cartas, sem remover as cartas.
- [ ] **T10.7 — Lista "Talvez"** _(req: 9, 10)_ · depende de T10.5
  - Verificação:
    - a busca adiciona ao Talvez;
    - um clique move entre deck e Talvez;
    - a validação, as estatísticas e o bracket ignoram o Talvez.
- [ ] **T10.8 — Painel de estatísticas** _(req: 11, 12)_ · depende de T10.4
  - Escopo: curva com e sem terrenos, MV médio, cores do custo, fontes por cor, tipos, categorias e terrenos; clicar
    num valor destaca as cartas.
  - Verificação:
    - os números conferem num deck de exemplo calculado à mão;
    - o destaque funciona nas três visualizações.
- [ ] **T10.9 — Modo texto em massa** _(req: 13–15)_ · depende de T10.3, T10.6
  - Verificação:
    - fitness "serializar e ler de volta = mesmo deck";
    - aceita exportações reais do Moxfield e do Archidekt (com `(SET) número`, `*F*` e `#tags`);
    - salvar vira uma só mudança no histórico;
    - nomes não encontrados são listados sem perder o resto.
- [ ] **T10.10 — Tela do histórico e restaurar** _(req: 16–18)_ · depende de T10.3, T10.4
  - Verificação:
    - ver o deck num ponto antigo sem alterá-lo;
    - restaurar e desfazer;
    - mudanças agrupadas por dia.
  - Critério de aceite da onda: no tablet real, montar um deck em pilhas por categoria, arrastando cartas, e mandar
    cartas ao Talvez, com rolagem fluida em 100 cartas.

## Onda 2 — Biblioteca e importar
- [ ] **T10.11 — Biblioteca com pastas, busca e cards com arte** _(req: 19–21)_ · depende de T10.1
  - Verificação:
    - mover decks entre pastas pelo menu e arrastando;
    - excluir uma pasta mantém os decks;
    - a busca encontra pelo comandante;
    - as pastas sincronizam pela nuvem.
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
