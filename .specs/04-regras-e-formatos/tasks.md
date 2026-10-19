# Tasks — 04 · Regras e formatos (fase 2a)

- [x] **T4.1 — Pacote `@gathering-hall/formats`** _(req: NFR pureza, 6)_
  - O que fazer: workspace novo; tipos (`CardFacts`, `DeckRules`, `Preset`, `Violation`); fitness functions de
    pureza e "sem nomes de carta".
  - Verificação: `npm test` roda o pacote; um import proibido de propósito falha.
- [x] **T4.2 — Formato oficial + `resolvePreset`** _(req: 1, 2)_ · depende de T4.1
  - Verificação: o preset vazio resolve para o oficial; um override de vida muda só a vida.
- [x] **T4.3 — Regras: tamanho, singleton, identidade de cor** _(req: 3, 4, 5)_ · depende de T4.2
  - Verificação: testes por regra e por nível (block, warn, off); básicos e "any number" aceitos.
- [x] **T4.4 — Regras: elegibilidade e pareamentos** _(req: 5)_ · depende de T4.2
  - Verificação: Partner, Partner with, Friends forever, Background e Doctor's companion, com Oracle simulado.
- [x] **T4.5 — Regra: banidas (oficial / nenhuma / personalizada)** _(req: 5)_ · depende de T4.2
  - Verificação: Sol Ring banido por regra da casa bloqueia; carta desbanida pelo grupo passa.
- [x] **T4.6 — `suggestBracket`** _(req: 8)_ · depende de T4.1
  - O que fazer: conferir as definições oficiais de bracket vigentes e codificar os limiares como dados.
  - Verificação: decks de teste com 0, 2 e 5 Game Changers; turnos extras; destruição em massa de terrenos.
- [x] **T4.7 — `presetCodec` (exportar/importar)** _(req: 9, NFR segurança)_ · depende de T4.2
  - Verificação: ida e volta preserva o preset; chaves desconhecidas descartadas; valores fora de limite recusados.
- [x] **T4.8 — UI de presets** _(req: 2, 9, 10)_ · depende de T4.7 e do épico 05 (T5.1)
  - O que fazer: tela "Regras da casa", com criar, editar, duplicar, exportar e importar; seletor de preset no setup.
  - Verificação: criar "Regras de sexta" e usá-lo numa partida (a vida inicial aplicada).
- [x] **T4.9 — Bloqueio na entrada da partida** _(req: 7)_ · depende de T4.8 e T5.6
  - Verificação: um deck com violação `block` não começa; com `warn`, começa mostrando o aviso.

## Estratégia de testes
O pacote `formats` é testado com unitários puros e fatos de carta simulados (sem rede). A UI é verificada no
navegador.

## Notas da implementação (T4.1–T4.7)
- **"Banida como comandante" não foi implementada.** O Commander não tem hoje uma lista separada desse tipo, e o
  Scryfall só informa a legalidade geral. Se voltar a existir, entra como dado no `FormatVersion`.
- **Bracket:** os limites (nenhum Game Changer nos brackets 1–2, até 3 no bracket 3, livre no 4–5; destruição em
  massa de terrenos e turnos extras em cadeia só a partir do 4) ficam em `BRACKET_RULES`. Foram conferidos em
  out/2026 por fontes secundárias, porque a página oficial não estava acessível. Rever contra a página oficial.
- **Elegibilidade de comandante** inclui Vehicle e Spacecraft lendários (mudança de 2025). Conferir o texto
  vigente do CR 903.3.
- Os fatos de carta (`game_changer`, `legalities.commander`, `color_identity`, `keywords`) foram confirmados na API
  do Scryfall: `is:gamechanger` retornou 53 cartas.
