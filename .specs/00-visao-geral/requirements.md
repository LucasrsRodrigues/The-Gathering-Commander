# Requirements — 00 · Visão geral do The Gathering Hall

## Objetivo
Fan game gratuito e open source de Magic: The Gathering focado no formato **Commander**, com uma
**mesa interativa no estilo Arena**. Começa como mesa sandbox assistida (os jogadores aplicam as regras)
e evolui, carta por carta, para um motor de regras completo, com oponentes controlados pela máquina.

## Contexto e decisões já tomadas
- Motor de regras **próprio**, em TypeScript, como máquina de estados pura, compartilhado entre navegador e servidor.
- **XMage (MIT) e Forge (GPL-3.0) servem só de referência de design.** Não copiamos código nem traduzimos os
  scripts de carta deles. Nossas cartas são escritas a partir do texto Oracle (Scryfall/MTGJSON).
- Dados versionados no tempo (catálogo, formatos, banlists, Game Changers). Cada partida grava as versões usadas.
- Renderização: **Three.js (react-three-fiber) para a mesa, DOM/React para o resto**. Alvo: computador e tablet.
- Jogo local primeiro (goldfish e hot-seat com até 4 lugares). Online depois.
- Na v1, só o formato **Commander**, com regras configuráveis (padrão oficial + regras da casa, que podem restringir).
- **Licença MIT** e cumprimento à risca da **Wizards Fan Content Policy**.

## Escopo
- **Dentro (todas as fases):** catálogo de cartas versionado, motor de regras, mesa interativa, regras e formatos
  configuráveis, decks (importar, montar, validar), oponente IA.
- **Fora (non-goals):**
  - Monetização que restrinja o acesso.
  - Venda, impressão ou exportação de cartas (proxies).
  - Outros formatos além de Commander na v1.
  - Versionar as *regras* do motor por época ("jogar com as regras de 2020"). Pool de cartas e banlist datados, sim.
  - Ranking competitivo.

## Personas
- **Jogador de mesa casual:** joga Commander com amigos e quer testar decks e jogar quando o grupo não se reúne.
  Precisa de uma mesa bonita e fluida, de regras da casa e de comandos rápidos.
- **Construtor de deck:** quer fazer goldfish de um deck novo (comprar mãos, testar curva) sem montar cartas físicas.
- **Contribuidor open source:** quer adicionar cartas e mecânicas sem entender o motor inteiro.

## Requisitos funcionais (EARS)
1. O sistema DEVE permitir jogar uma partida de Commander com 1 a 4 lugares no mesmo dispositivo.
   _(aceite: partida de 4 lugares do setup ao fim de jogo)_
2. QUANDO uma carta não tiver automação, o sistema DEVE permitir jogá-la em modo manual na mesma partida.
   _(aceite: deck com cartas sem script é jogável do começo ao fim)_
3. O sistema DEVE exibir em todas as telas o aviso de Fan Content, com o texto exato exigido pela Wizards.
   _(aceite: o aviso aparece no rodapé, na tela Sobre e no README)_
4. O sistema NÃO DEVE exigir pagamento, assinatura ou cadastro por e-mail para jogar.
   _(aceite: jogar uma partida local sem conta nenhuma)_
5. O sistema NÃO DEVE incluir logos nem marcas da Wizards, nem oferecer impressão ou exportação de cartas.
   _(aceite: revisão de assets e de funcionalidades no checklist de release)_
6. O sistema DEVE buscar dados e imagens de cartas em fontes públicas (Scryfall) em tempo de execução, sem
   redistribuí-los no repositório. _(aceite: o repositório não contém imagens nem dumps de cartas)_
7. QUANDO a Wizards pedir a remoção, os mantenedores DEVEM conseguir tirar o conteúdo do ar.
   _(aceite: processo descrito em LEGAL.md)_

## Requisitos não-funcionais
- **Desempenho:** a mesa mantém pelo menos 60 fps com 4 jogadores e 160 permanentes num computador de 2020 ou
  mais novo. Meta para tablet a confirmar com medição real (spike `spikes/render-bench`).
- **Determinismo:** a mesma sequência de ações a partir do mesmo estado inicial e seed produz o mesmo estado,
  o que torna replays e undo confiáveis.
- **Informação oculta e segurança:**
  - Um cliente nunca recebe informação que o seu jogador não poderia ver (mão alheia, ordem do grimório).
  - Todo input externo (decklists, nomes) é validado.
  - Sem `innerHTML` com dados de usuário.
- **Evolutividade:**
  - O núcleo do motor não referencia nomes de cartas.
  - O motor não depende de UI nem de rede.
  - As fitness functions rodam no CI.
- **Acessibilidade:** os controles da interface DOM funcionam por teclado. A mesa 3D tem alternativa para ler
  cartas (ampliação e lista de zona).
- **Open source:** licença MIT, contribuição documentada e testes rodando com um único comando.

## Critérios de aceite globais
- [ ] `npm test` roda todos os testes (motor + web) a partir da raiz.
- [ ] O CI bloqueia merge se as fitness functions falharem.
- [ ] O aviso de Fan Content está presente no app e no README.
- [ ] Uma partida sandbox de 4 jogadores pode ser jogada do início ao fim.
