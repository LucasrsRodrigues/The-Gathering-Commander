# Design — 10 · Editor de decks estilo Moxfield

## Skills aplicadas
| Skill | Por que | Princípios aplicados |
|---|---|---|
| ux-design | O editor é a tela mais usada fora da mesa | Uma ação, um gesto (arrastar), sempre com um caminho alternativo pelo menu; feedback imediato; preferências de visualização lembradas |
| domain-driven-design | O deck ganha conceitos novos (categoria, "Talvez", histórico) | Funções puras no `formats` (modelo, diff, migração); o editor só chama operações do modelo |
| evolutionary-architecture | O formato do deck muda com nuvem e servidor já em produção | Versão de schema, migração na leitura, fitness "v1 → v2 sem perda", regra no servidor contra regressão de versão |
| security | Import por link e página pública | Allowlist de host, URL montada pelo servidor (sem SSRF), limites de tamanho e tempo, página pública sem dados da conta |
| dataviz | Painel de estatísticas | Barras simples, contagens clicáveis que destacam cartas, cores com rótulo (não só a cor) |

## Visão geral
```
apps/web
  decks/model.ts          operações do deck (já existe) → passam a usar o formats v2
  decks/views/            ListView, StacksView, GridView + grouping.ts (agrupar e ordenar, puro)
  decks/tags.ts           sugestões de categoria pelo Oracle (puro)
  decks/bulkText.ts       deck ⇄ texto com #tags, seções e (SET) número (puro)
  decks/ui/               painel de estatísticas, histórico, menu da carta, arrastar
  screens/DeckEditorScreen.tsx   nova casca: barra (visão, agrupar, ordenar, texto, histórico, compartilhar)
  screens/DeckLibraryScreen.tsx  pastas, busca, ordenação, cards com arte
  screens/PublicDeckScreen.tsx   #/d/<slug>, só leitura
packages/formats
  deckDocument.ts         Deck v2, sanitizeDeck (v1 e v2), migrateDeck, limites
  deckHistory.ts          diff, juntar mudanças, aplicar/desfazer (puro)
apps/server
  import/                 POST /api/import/deck { url } → lista normalizada (Archidekt, Moxfield)
  share/                  links públicos: tabela deck_share, rotas
```

## Modelo (v2)
```ts
DeckCard {
  oracleId: string; name: string; scryfallId?: string; count: number
  tags?: string[]            // a primeira é a categoria principal; até 8, 1–24 caracteres cada
}
Deck {
  schemaVersion: 2
  id, name, presetId?, createdAt, updatedAt
  commanders: DeckCard[]
  cards: DeckCard[]
  maybe: DeckCard[]          // "Talvez": fora da validação e da partida
  folder?: string            // nome da pasta (1–40 caracteres); sem pasta = raiz
  description?: string       // até 2.000 caracteres, texto puro
  tagOrder?: string[]        // ordem das categorias no agrupamento (as criadas sem carta também ficam aqui)
  history: DeckChange[]      // mais novo por último; até 50
}
DeckChange {
  at: number                 // hora da edição
  added: ChangeLine[]; removed: ChangeLine[]   // por lista: 'commanders' | 'cards' | 'maybe'
}
ChangeLine { zone: 'commanders' | 'cards' | 'maybe'; oracleId: string; name: string; count: number }
```
- **Migração:** `migrateDeck(v1)` gera um v2 com `maybe: []` e `history: []`. É chamada no `sanitizeDeck`, então
  vale para o IndexedDB, a nuvem e o import de arquivo. O app grava sempre v2.
- **Tags** fazem parte da carta, não do deck: mover a carta para o "Talvez" leva as tags junto.
- **Histórico:** registra só as mudanças de cartas, não as de tags, nome ou descrição.
  - `deckHistory.diff(antes, depois)` calcula o que entrou e o que saiu;
  - `record(deck, change, now)` junta a mudança à anterior se ela for de menos de 10 minutos; uma carta que entrou
    e saiu dentro da mesma junção se anula;
  - ver uma versão antiga = desfazer, do fim para trás, as mudanças até aquele ponto (`replayBack`);
  - restaurar grava o resultado como uma mudança nova.
- **Limites** (no `formats`, os mesmos no app e no servidor):
  - 300 entradas no deck e 150 no "Talvez";
  - 8 tags por carta e 60 categorias distintas;
  - 50 mudanças no histórico, com até 200 linhas cada;
  - documento de até 128 KB. Hoje o limite da nuvem é 64 KB; ele sobe.

### Nuvem e versões
- O servidor valida com o `sanitizeDeck` novo: aceita v1 e v2 e guarda o que recebeu.
- **Regressão de versão:** um app antigo, ainda aberto num aparelho, manda v1 sem tags. Se o servidor já tem um v2,
  o `PUT` v1 é recusado com `409`, devolvendo o v2. O app antigo marca o v2 como conhecido e não sobrescreve. O app
  novo nunca manda v1.
- Pastas são um campo do deck, não um documento à parte: sincronizam junto e não exigem rota nova. Renomear uma
  pasta grava cada deck dela. Uma pasta sem decks existe só neste navegador até receber o primeiro deck.

## Editor
### Layout
```
┌ barra: nome · [Lista|Pilhas|Grade] · Agrupar ▾ · Ordenar ▾ · Texto · Histórico · Compartilhar · Testar ┐
│ busca (como hoje: autocompletar, sintaxe Scryfall, filtro de identidade) → adiciona ao deck ou ao Talvez│
├──────────────────────────────── deck ────────────────────────────────┬──── painel ───────────────────┤
│ Comandante                                                            │ estatísticas (clicáveis)      │
│ grupos (tipo | MV | cor | categoria) em colunas que quebram            │ validação · bracket           │
│ ── Talvez (recolhível) ──                                             │ sugestões de categoria        │
└───────────────────────────────────────────────────────────────────────┴───────────────────────────────┘
```
- **Tablet (largura menor que 1100 px):** o painel vira uma aba ("Deck" | "Estatísticas"). **Celular (menor que
  700 px):** só a visualização em lista, com os grupos empilhados.
- **Visualizações** (`decks/views`):
  - **lista:** linhas com quantidade, nome, custo e chips das tags;
  - **pilhas:** cartas sobrepostas mostrando a faixa do nome, com a carta inteira no hover ou toque longo;
  - **grade:** cartas lado a lado.

  As três recebem os mesmos grupos de `grouping.ts` (puro: `group(deck, info, by, sort)`).
- **Imagens:** tamanho `small` do Scryfall com `loading="lazy"`; as pilhas usam `content-visibility: auto` por
  grupo. A carta grande aparece pelo preview que já existe.
- **Preferências** (visualização, agrupar, ordenar, "Talvez" aberto): `localStorage`, por navegador. Não são do deck.

### Interações
- **Menu da carta** (clique direito, toque longo ou botão "⋯"):
  - +1 / −1;
  - mover para o Talvez ou para o deck;
  - categorias (marcar e desmarcar, com "nova…");
  - definir como principal;
  - trocar arte;
  - tornar comandante.
- **Seleção múltipla** (Shift/Ctrl+clique; no tablet, o modo "Selecionar"): aplicar categoria, mover para o Talvez,
  remover.
- **Arrastar** (Pointer Events, mouse e toque):
  - para outro grupo de categoria: troca a principal;
  - para o Talvez ou do Talvez para o deck: move a carta;
  - nos agrupamentos automáticos (tipo, MV, cor), arrastar entre grupos não faz sentido e fica desligado. Só o
    arrastar para o Talvez continua.
- **Sugestões de categoria** (`decks/tags.ts`, puro, sobre o Oracle e o tipo):

  | Categoria | Padrão |
  |---|---|
  | Terreno | tipo Land |
  | Ramp | habilidade de mana fora de terreno, ou "search your library for … land" |
  | Compra | "draw" com um número de cartas |
  | Remoção | "destroy/exile target", "deals N damage to target creature" |
  | Limpa-mesa | "destroy/exile all", "each creature" |
  | Contramágica | "counter target spell" |
  | Tutor | "search your library for a card" fora de terreno |

  O painel mostra "N sugestões": aceitar uma ou todas. Nada muda sem o usuário aceitar.

### Modo texto
- `bulkText.serialize(deck)`:
  ```
  Commander
  1 Krenko, Mob Boss #Comandante
  Deck
  1 Sol Ring (C21) 263 #Ramp #Mana
  …
  Talvez
  1 Goblin Bombardment #Wincon
  ```
- `bulkText.parse(texto)` estende o `parseDecklist` com:
  - `#tag` (várias);
  - `(SET) número` (escolhe a impressão);
  - `*F*` e `*CMDR*` (aceitos e ignorados, menos o `*CMDR*`);
  - a seção `Talvez` ou `Maybeboard`.

  O resultado é aplicado por diff, como uma só mudança. Os nomes não resolvidos aparecem numa lista, e o resto do
  deck é salvo.
- Os limites do parser sobem para caber o "Talvez": 450 linhas e 30.000 caracteres.

### Histórico
- Um painel lateral com as mudanças agrupadas por dia ("+2 Sol Ring, −1 Mind Stone").
- Clicar numa mudança mostra o deck naquele ponto, só para leitura, com "Restaurar esta versão".
- Restaurar mostra um toast com "Desfazer".

## Biblioteca
- Cards em grade:
  - a arte do comandante (`art_crop`);
  - o nome;
  - os símbolos de identidade de cor;
  - "100 cartas · válido para Oficial";
  - a pasta.
- A coluna de pastas fica à esquerda (no tablet, um seletor): "Todas", "Sem pasta" e as pastas.
- Mover deck: pelo menu do card, ou arrastando para uma pasta.
- Busca na hora por nome do deck e dos comandantes. Ordenar por "editado", "nome" ou "cor" (WUBRG, depois
  multicor).

## Importar por link
- `POST /api/import/deck { url }`, sem conta. Usa a mesma origem e um limite de 10 por minuto por IP.
- **Archidekt:**
  - link `https://archidekt.com/decks/<id>[/slug]`;
  - o servidor busca `https://archidekt.com/api/decks/<id>/`;
  - as categorias do Archidekt viram tags;
  - a categoria "Commander" vira comandante, e "Maybeboard" ou "Sideboard" viram o Talvez.
- **Moxfield:**
  - link `https://moxfield.com/decks/<publicId>`;
  - o servidor tenta `https://api2.moxfield.com/v3/decks/all/<publicId>`;
  - as boards `commanders`/`mainboard`/`maybeboard` viram comandantes, deck e Talvez, e os `tags` por carta viram
    tags quando vierem;
  - um `403` ou desafio de bot vira o erro `bloqueado`, e o app oferece "Exportar → Texto" no Moxfield e colar aqui.
- **Segurança:**
  - o servidor nunca busca a URL recebida: extrai o id com uma regex e monta a URL da API;
  - timeout de 10 s;
  - resposta de até 2 MB;
  - User-Agent identificado;
  - nada é guardado.
- A resposta é normalizada (`{ name, commanders, cards, maybe }` com `count`, `name`, `set?`, `number?` e `tags`).
  O app resolve os nomes no catálogo como no colar texto.

## Link público
```sql
-- 0005-deck-share.sql
deck_share(slug text primary key, user_id uuid references app_user on delete cascade, deck_id text,
           created_at bigint, unique (user_id, deck_id))
```
- **Ligar** (`PUT /api/decks/:id/share`, com conta e mesma origem): cria um slug aleatório de 10 caracteres
  base62. Se o deck já tem link, devolve o mesmo. **Desligar** (`DELETE`): apaga a linha. Ligar de novo gera outro
  slug.
- **Abrir** (`GET /api/public/decks/:slug`, sem conta, com limite por IP): lê o `cloud_doc` atual do deck e devolve
  só:
  - nome, descrição, comandantes, cartas e Talvez (com tags);
  - o nome de exibição do dono;
  - a data da última edição.

  O histórico, a pasta e qualquer id de conta não saem. Um deck excluído ou um link desligado dá `404`.
- **No app:** `#/d/<slug>` abre a `PublicDeckScreen`:
  - visualizações e estatísticas do editor, só para leitura;
  - "Copiar para meus decks" (cria um deck novo, com id novo);
  - "Exportar texto".
- O link só existe para decks na nuvem. Sem conta, o botão "Compartilhar" explica que precisa entrar.
- A exclusão da conta apaga os links (cascade). A exportação da conta lista os links ativos.

## Decisões
- **ADR-10.1 — Tags dentro da carta, com a primeira como principal.** É o modelo do Moxfield: agrupar não precisa
  de outra estrutura, e mover a carta leva as tags junto.
- **ADR-10.2 — Histórico como diffs dentro do documento do deck.** Sincroniza com a nuvem sem tabela nova e cabe no
  limite (50 mudanças juntadas). O custo: o histórico de dois aparelhos editando ao mesmo tempo segue a regra
  "última edição vence", como o resto do deck.
- **ADR-10.3 — Pastas como campo do deck.** Evita um tipo novo de documento na nuvem e conflitos entre pasta e deck.
- **ADR-10.4 — Import pelo servidor, com URL montada.** O navegador não consegue chamar essas APIs (CORS), e montar a
  URL a partir do id fecha o SSRF.
- **ADR-10.5 — Link público lê o deck vivo na nuvem.** O link mostra sempre a versão atual, sem "republicar", e
  desligar é apagar uma linha.

## Fitness functions
- `migrateDeck` de todo deck v1 dos testes e amostras volta igual pelo `toValidation` (nada se perde).
- `bulkText.parse(serialize(deck))` reconstrói o deck (cartas, quantidades, listas, tags e impressão).
- `replayBack` até o começo do histórico, seguido de reaplicar tudo, devolve o deck atual.
- A validação e a partida nunca recebem cartas do "Talvez" (`toValidation` e `toGameDeck`).
- A página pública e a resposta de `/api/public` não contêm `user_id`, `history` nem `folder`.

## Riscos
- **API do Moxfield instável ou bloqueada** → o import é "tentar". O erro é claro e leva ao colar texto, que sempre
  funciona. Um teste com resposta gravada protege o parser. A chamada real nunca roda no CI.
- **Desempenho das pilhas com muitas imagens no tablet** → `small` + lazy + `content-visibility`, e medir com
  100 cartas no tablet antes de fechar a onda 1.
- **App antigo aberto sobrescrevendo v2** → `409` por regressão de versão no servidor (acima).
- **Histórico crescendo demais** → limite de mudanças e de linhas, e junção por tempo. As mais antigas saem primeiro.
