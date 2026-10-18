# Tasks — 00 · Visão geral do The Gathering Hall

- [x] **T0.1 — Monorepo** _(req: NFR open source)_
  - O que fazer: npm workspaces com `packages/engine` e `apps/web`; TypeScript estrito; Vitest; oxlint;
    scripts `npm test`, `npm run dev` e `npm run build` na raiz.
  - Verificação: `npm install && npm test && npm run build` passam numa máquina limpa.
- [x] **T0.2 — Documentos legais** _(req: 3, 4, 5, 6, 7)_
  - O que fazer: `LICENSE` (MIT), `LEGAL.md` (Fan Content Policy, o que não fazemos, processo de takedown) e o
    aviso no README.
  - Verificação: o texto do aviso é idêntico ao da política.
- [x] **T0.3 — Fitness functions** _(req: NFR evolutividade)_ · depende de T0.1
  - O que fazer: testes de pureza de imports do motor e de ausência de nomes de carta no núcleo.
  - Verificação: um import proibido de propósito faz o teste falhar.
- [ ] **T0.4 — CI** · depende de T0.1 _(workflow criado; ainda não rodou: o repositório não foi publicado)_
  - O que fazer: GitHub Actions rodando install, lint, test e build.
  - Verificação: o workflow passa no primeiro push.

## Estratégia de testes
Motor com TDD (unitários e property-based). Web com testes de componentes só onde houver lógica (humble object:
a mesa 3D fica fina e a lógica fica no motor e na sessão). As fitness functions rodam junto com `npm test`.
