# The Gathering Hall

Fan game gratuito e open source de **Commander** (Magic: The Gathering) com uma mesa interativa em 3D.

> The Gathering Hall is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

## O que já dá para fazer
- Partidas de 1 a 4 lugares no mesmo dispositivo: goldfish (sozinho) ou hot-seat, com cortina entre jogadores. Ou
  online, com salas por link (veja abaixo).
- Decks salvos no navegador, com validação por regras e sugestão de bracket. Também dá para usar decks de exemplo,
  colar uma lista (Moxfield, Archidekt ou texto simples) ou colar o link de um deck do Archidekt. As cartas vêm do
  catálogo próprio, atualizado todo dia a partir do Scryfall, e a banlist pode ser a de uma data.
- Editor de decks no estilo do Moxfield:
  - lista, pilhas ou grade, agrupadas por tipo, valor de mana, cor ou categoria;
  - categorias próprias (Ramp, Remoção…), com sugestões lidas do texto Oracle;
  - lista "Talvez", fora da validação e da partida;
  - menu da carta, seleção múltipla e arrastar, também no tablet;
  - estatísticas clicáveis (curva, símbolos e fontes por cor, tipos, categorias);
  - o deck inteiro como texto (`1 Sol Ring (C21) 263 #Ramp`);
  - histórico de mudanças, com volta a uma versão anterior.
- Biblioteca com pastas, busca e cards com a arte do comandante. Com conta, cada deck pode ganhar um link público só
  de leitura, que qualquer pessoa abre e copia.
- Mesa 3D com câmera que foca no oponente. Para mexer nas cartas: arrastar, clicar para virar ou gerar mana, passar
  o mouse ou segurar para ampliar, botão direito ou toque longo para o menu.

### O que o jogo faz sozinho
- **Turnos:** etapas, prioridade, pilha e mulligan London (o primeiro é grátis), com paradas automáticas estilo
  Arena. Um turno sem nada a fazer passa com 2 cliques, e há "passar até o fim do turno".
- **Hora de jogar:** um terreno por turno; mágicas em velocidade de feitiço; instantâneas e Flash quando há prioridade.
- **Mana:**
  - terrenos básicos e a maioria das fontes comuns (Sol Ring, Command Tower, Signets, terrenos de dor) geram a
    mana certa;
  - lançar cobra o custo, com X e taxa de comandante, e o pagamento automático escolhe as fontes.
- **Combate:**
  - atacar e bloquear, com Vigilance, Haste, Defender, Flying, Reach e Menace;
  - o dano é calculado com First strike, Double strike, Trample, Deathtouch e Lifelink, e quem ataca confirma;
  - o dano de comandante soma sozinho.
- **Ações baseadas em estado:**
  - criaturas morrem com dano letal ou resistência 0;
  - planeswalkers saem com lealdade 0;
  - no fim do turno, descarte até o máximo da mão;
  - derrota por vida, veneno, dano de comandante ou grimório vazio.
- **Exceções:** quando uma carta muda as regras e ainda não tem automação, "Fazer mesmo assim" pede uma exceção.
  No jogo local ela vale na hora; online, os outros jogadores aprovam. Fica no log como ação de juiz.
- **Efeitos das cartas** (lidos do texto Oracle, sem script por carta):
  - mágicas: comprar, dano, vida, destruir, exilar, devolver, +X/+X, marcadores, fichas (Treasure, Food, Clue),
    moer;
  - "quando entra no campo", também de terrenos e fichas;
  - habilidades ativadas pelo menu da carta, pagando {T}, mana, vida, sacrificar ou descartar;
  - contagens ("para cada Elfo", "igual às cartas na sua mão") e mana variável (Marwyn, Priest of Titania);
  - busca no grimório (Cultivate, fetch lands), vidência, vigiar e investigar, escolhidos num painel que só quem
    busca vê.

  Os alvos são escolhidos clicando na mesa, com os válidos em destaque, ou pela lista da faixa (teclado). Se o alvo
  some antes de resolver, a mágica é anulada. O registro diz o que aconteceu ("Lightning Bolt causou 3 de dano a
  Bia").
- **Cobertura:** cada carta tem um selo "automática", "parcial" ou "manual" na prévia e no editor, e o editor
  resume o deck ("96 de 100 automáticas"). Nas 1.000 cartas mais jogadas no Commander (EDHREC), **18,3% são
  automáticas** e 47,3% são automáticas ou parciais (Scryfall de 2026-10-19). Para medir de novo:
  `npm run coverage -w @gathering-hall/server`.
- **"Resolver à mão":** qualquer item automático da pilha pode ser resolvido à mão, se o jogo ler algo errado. Online,
  os outros aprovam, como nas exceções.

### O que ainda é manual
- Nas cartas parciais e manuais, a parte que o jogo não lê fica com os jogadores, como numa mesa física: mover
  cartas, contadores, vida, "+1/+1 até o fim do turno", "causar dano". A prévia mostra "Manual:" com essas frases.
- Ainda não automatizados:
  - Equipar e Auras;
  - efeitos contínuos ("criaturas que você controla têm…");
  - gatilhos além de "entra no campo" (morrer, atacar, manutenção);
  - modos ("Escolha um —");
  - contramágicas;
  - Ciclagem e Tripular;
  - custos alternativos e reduções;
  - terrenos que entram virados conforme uma condição;
  - "você pode…".
- Fontes de mana que o jogo não reconhece: a mana é declarada ao virar a carta e fica marcada no log.

### Conta opcional
Para jogar, não precisa de conta. Quem entra com Discord ou Google tem:
- decks e regras da casa em qualquer aparelho, sincronizados (a última edição vence, com aviso);
- o mesmo lugar nas salas de qualquer aparelho;
- "Minhas partidas", com o histórico das partidas online.

Em "Minha conta", dá para baixar os dados ou excluir a conta. O que é guardado está no [LEGAL.md](LEGAL.md#privacidade).

### Regras da casa
Vida inicial, dano de comandante, mulligans, terrenos por turno e o rigor de cada área. "Hora de jogar", "Custo de
mana" e "Combate" têm três níveis: bloqueia, só avisa ou desligada. Desligada é a mesa livre de antes.

## Online
Com o servidor (`apps/server`) no ar, dá para criar uma sala e mandar o link de convite. Cada jogador entra do
próprio dispositivo, com ou sem conta. O servidor roda o mesmo motor do navegador e manda a cada jogador só o que ele pode
ver. Se a partida esperar a decisão de alguém que saiu da sala há mais de 30 segundos, quem criou a sala pode
pular essa pessoa. O servidor responde com o padrão, e o registro mostra isso:
- manter a mão, não atacar nem bloquear, confirmar o dano proposto;
- descartar as últimas cartas da mão, recusar a exceção ou passar a prioridade;
- não encontrar nada na busca, deixar as cartas da vidência no topo, deixar o gatilho para resolver à mão.
Tudo sobe num único container (há um `Dockerfile` na raiz); o passo a passo para o EasyPanel está no
[DEPLOY.md](DEPLOY.md).

## Rodar
Requer Node 22+.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Para o modo online local, suba também o servidor:

```bash
npm run dev -w @gathering-hall/server
```

```bash
npm test          # motor + web (inclui as fitness functions de arquitetura)
npm run typecheck
npm run lint
npm run build
```

## Estrutura
```
packages/engine   motor de regras puro em TypeScript (sem dependências)
packages/formats  regras do formato, presets (regras da casa), validação de deck e bracket
packages/protocol mensagens do jogo online, com validação estrita
apps/web          React + react-three-fiber (mesa 3D) + HUD em DOM
apps/server       servidor online (Node + ws + Postgres/PGlite): salas (um RoomCore puro), catálogo, contas, nuvem
.specs/           requisitos, design e tarefas por épico
spikes/           protótipos descartáveis (ex.: benchmark de renderização)
```

O motor é uma função pura `reduce(estado, ação) → novo estado + eventos`. A UI recebe só a visão filtrada de cada
jogador (`viewFor`), sem a mão dos outros nem a ordem do grimório. As decisões de arquitetura estão em
`.specs/00-visao-geral/design.md`.

## Licença
Código sob licença [MIT](LICENSE). Leia o [LEGAL.md](LEGAL.md) antes de contribuir.
