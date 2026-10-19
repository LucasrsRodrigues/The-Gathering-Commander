# Requirements — 07 · Online (fase 2b)

## Objetivo
Jogar Commander com amigos em dispositivos diferentes, entrando por um link de convite, sem conta e sem custo.
O servidor é a fonte da verdade e cada jogador só recebe o que pode ver.

## Contexto e suposições
- O motor já é puro, determinístico e serializável. `viewFor` filtra a informação oculta e `reduce` valida toda
  ação. O servidor roda **o mesmo pacote** `@gathering-hall/engine`.
- Decks entram como `DeckInput` (lista de `CardRef`). Na 2b, a validação de deck contra o preset acontece **no
  cliente de cada jogador**: é um jogo entre amigos. A validação no servidor depende do catálogo do servidor
  (épico 01) e vem depois.
- O modo local (goldfish e hot-seat) continua existindo e funciona sem rede.
- Hospedagem: VPS própria do usuário, com Node + SQLite atrás de Caddy (ver ADR-07.1).

## Escopo
- **Dentro:**
  - criar sala;
  - convite por link;
  - escolher lugar, nome, deck e regras;
  - partida de 2 a 4 jogadores online;
  - espectadores;
  - reconexão;
  - fim de jogo e "jogar de novo";
  - limpeza de salas abandonadas.
- **Fora (2b):**
  - contas e ranking;
  - matchmaking com desconhecidos;
  - chat de texto e de voz (o chat de texto vem depois, com moderação);
  - desfazer online (exige acordo entre jogadores; vem depois);
  - bots online (dependem do épico 06).

## User stories
- *Como anfitrião*, quero criar uma sala e mandar o link no grupo, para jogarmos cada um no seu computador ou tablet.
- *Como convidado*, quero abrir o link, escolher meu nome e meu deck e sentar num lugar, sem criar conta.
- *Como jogador*, se minha internet cair, quero voltar para o mesmo lugar sem perder a partida.

## Requisitos funcionais (EARS)
1. QUANDO alguém criar uma sala, o sistema DEVE gerar um id de sala difícil de adivinhar e um link de convite.
   _(aceite: id com ≥ 96 bits aleatórios)_
2. QUANDO alguém abrir o link, o sistema DEVE mostrar o lobby da sala (lugares, nomes, regras escolhidas) e
   permitir sentar num lugar livre informando nome e deck, sem cadastro.
3. O sistema DEVE dar a cada lugar ocupado um **token de lugar** secreto, guardado no navegador, que é a única
   forma de agir por aquele lugar. _(aceite: uma ação com token de outro lugar é recusada)_
4. QUANDO o anfitrião iniciar a partida com 2 a 4 lugares ocupados, o servidor DEVE criar o jogo com o preset
   escolhido e uma seed gerada no servidor.
5. ENQUANTO a partida estiver em andamento, o servidor DEVE aplicar as ações recebidas com `reduce`, na ordem de
   chegada, e enviar a cada conexão apenas `viewFor(estado, lugar)` e `eventsFor(eventos, lugar)`.
6. O servidor NÃO DEVE enviar a nenhum cliente a mão de outro jogador nem o conteúdo ou a ordem de grimórios.
   _(aceite: fitness function sobre as mensagens do protocolo)_
7. QUANDO uma ação for recusada pelo motor, o servidor DEVE responder só a quem a enviou, com o erro do motor.
8. QUANDO uma conexão cair, o lugar DEVE continuar reservado. QUANDO o jogador voltar com o token, o servidor DEVE
   reenviar a visão atual. _(aceite: recarregar a página no meio da partida volta ao mesmo estado)_
9. O sistema DEVE permitir espectadores, que recebem só a visão pública (`viewFor(estado, null)`).
10. O servidor DEVE guardar o estado e o log de ações de cada sala, para sobreviver a reinícios e permitir replay.
11. QUANDO uma sala ficar sem conexões por 24 h, o sistema DEVE apagá-la.
12. O app DEVE mostrar o estado da conexão (conectado, reconectando, offline) e quem está desconectado na mesa.

## Requisitos não-funcionais
- **Segurança:**
  - todo payload validado por schema (tipos e tamanhos), com mensagens de até 64 KB e decks de até 250 cartas;
  - rate limit por conexão (até 20 ações por segundo, depois descarta e avisa);
  - tokens só em `localStorage` do próprio site, nunca na URL depois de sentar;
  - CORS e `connect-src` restritos ao domínio do servidor;
  - sem dados pessoais além do apelido.
- **Latência:** do envio da ação até a visão atualizada chegar aos outros, menos de 300 ms na mesma região.
- **Custo:** dentro do plano gratuito do provedor para dezenas de partidas simultâneas
  (Fan Content Policy: gratuito).
- **Compatibilidade:** o protocolo é versionado (`v`). Um cliente de versão incompatível recebe um aviso para
  recarregar.
- **Evolutividade:** o transporte fica atrás de uma porta (`GameTransport`). A mesa e o HUD não sabem se o jogo é
  local ou online.

## Critérios de aceite globais
- [ ] Duas pessoas em navegadores diferentes jogam uma partida até o fim por link.
- [ ] Recarregar a página no meio da partida volta ao mesmo lugar e estado.
- [ ] Um espectador vê a mesa sem ver nenhuma mão.
- [ ] O modo local continua funcionando com o servidor desligado.
