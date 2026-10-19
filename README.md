# The Gathering Hall

Fan game gratuito e open source de **Commander** (Magic: The Gathering) com uma mesa interativa em 3D.

> The Gathering Hall is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

## O que já dá para fazer (fase 1 — mesa sandbox)
- Partidas de 1 a 4 lugares no mesmo dispositivo: goldfish (sozinho) ou hot-seat, com cortina entre jogadores.
- Decks de exemplo ou lista colada (formato Moxfield, Archidekt ou texto simples). As cartas vêm do Scryfall.
- Mesa 3D com câmera que foca no oponente. Para mexer nas cartas: arrastar, clicar para virar, passar o mouse
  ou segurar para ampliar, botão direito ou toque longo para o menu.
- O motor cuida de:
  - turnos e etapas, prioridade e pilha;
  - mulligan London (o primeiro é grátis);
  - vida, veneno, dano e taxa de comandante;
  - derrotas automáticas;
  - desfazer e registro da partida.
- Regras da casa: vida inicial e restrição de quem mexe em cada permanente.

As regras de cada carta ainda são aplicadas pelos jogadores, como numa mesa física. A automação vem por fases
(veja `.specs/`).

## Online
Com o servidor (`apps/server`) no ar, dá para criar uma sala e mandar o link de convite. Cada jogador entra do
próprio dispositivo, sem conta. O servidor roda o mesmo motor do navegador e manda a cada jogador só o que ele pode
ver. Tudo sobe num único container (há um `Dockerfile` na raiz); o passo a passo para o EasyPanel está no
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
apps/server       servidor online (Node + ws + SQLite), uma sala = um RoomCore puro
.specs/           requisitos, design e tarefas por épico
spikes/           protótipos descartáveis (ex.: benchmark de renderização)
```

O motor é uma função pura `reduce(estado, ação) → novo estado + eventos`. A UI recebe só a visão filtrada de cada
jogador (`viewFor`), sem a mão dos outros nem a ordem do grimório. As decisões de arquitetura estão em
`.specs/00-visao-geral/design.md`.

## Licença
Código sob licença [MIT](LICENSE). Leia o [LEGAL.md](LEGAL.md) antes de contribuir.
