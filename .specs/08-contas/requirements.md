# Requirements — 08 · Contas opcionais e nuvem (fase 3b)

## Objetivo
Uma conta **opcional** que leva decks, regras da casa e identidade para qualquer aparelho e guarda o histórico de
partidas. Quem não entra continua jogando tudo e salvando no navegador, como hoje.

## Contexto e suposições
- Hoje decks (IndexedDB) e regras da casa (localStorage) ficam só no navegador. Nas salas online, a identidade é um
  token por sala, guardado no navegador.
- O servidor roda num container único na VPS (EasyPanel), com SQLite no volume `/data` para salas e catálogo.
- **Fan Content Policy:** o jogo é gratuito e nada que faz parte de jogar pode exigir cadastro. A conta só acrescenta
  conveniência (nuvem, histórico).

### Decisões (2026-10-19)
- **Sem login:** joga tudo e salva decks e regras da casa no próprio navegador.
- **Com login:** cadastro, nuvem (decks e presets em qualquer aparelho), perfil, identidade nas salas e histórico de
  partidas. O que estava no navegador sobe no primeiro login.
- **Provedores:** Discord e Google (OAuth). Não guardamos senhas.
- **Sincronização:** a última edição vence (por deck e por preset), com aviso quando uma versão é descartada.
- **Banco:** migrar de SQLite para Postgres nesta fase, incluindo salas e catálogo.
- **Fora desta fase:** importação de deck por link (Archidekt), que fica com o editor estilo Moxfield.

## Escopo
**Dentro:**
- Postgres como banco do servidor, com migrações versionadas e a transferência dos dados atuais;
- login com Discord e Google, sessão por cookie, sair e excluir a conta;
- sincronização de decks e presets;
- conta ligada ao lugar nas salas online;
- histórico das partidas online, com resultado.

**Fora:**
- amigos e convites por conta;
- perfis públicos e ranking;
- pagamento de qualquer tipo;
- replay visual das partidas (o servidor guarda o necessário, e a tela fica para depois);
- histórico de partidas locais (só as online passam pelo servidor).

## Requisitos funcionais (EARS)

### Banco
1. O servidor DEVE usar Postgres quando `DATABASE_URL` estiver definida. Sem ela (desenvolvimento e testes), DEVE
   usar um Postgres embutido (PGlite) gravado no diretório de dados.
2. O schema DEVE evoluir por migrações numeradas, aplicadas no start, numa transação cada uma, registradas numa tabela
   de controle.
3. No primeiro start com Postgres, SE existirem os bancos SQLite antigos no volume, ENTÃO o servidor DEVE copiar as
   salas para o Postgres. O catálogo é reimportado do Scryfall, com o histórico datado reaplicado.
4. Os testes DEVEM rodar sem servidor de banco externo.

### Conta e sessão
5. O app DEVE oferecer "Entrar com Discord" e "Entrar com Google" de forma discreta. Nenhuma tela de jogo DEVE exigir
   login.
6. O login DEVE seguir OAuth 2.0 com `state` e PKCE. O servidor guarda só: id do provedor, nome de exibição, avatar e
   datas. Nada de e-mail, se o provedor deixar evitar.
7. A sessão DEVE ser um cookie `HttpOnly`, `Secure`, `SameSite=Lax`, com um id aleatório (o banco guarda só o hash),
   validade de 30 dias renovada com o uso e encerrada em "Sair".
8. Uma conta PODE ter Discord e Google ligados. Entrar com um provedor novo, já logado, liga os dois.
9. O usuário DEVE poder excluir a conta. Isso apaga conta, sessões, decks e presets na nuvem; o histórico de partidas
   fica anonimizado. Os dados locais no navegador não mudam.
10. O usuário DEVE poder baixar os próprios dados (decks, presets e histórico) em JSON.

### Nuvem
11. Com login, o app DEVE ler e gravar decks e presets na nuvem e manter a cópia local como cache para uso sem rede.
12. No primeiro login de um aparelho, o app DEVE subir os decks e presets locais que ainda não estão na conta.
13. Em conflito (o mesmo deck mudou em dois aparelhos), DEVE ficar a versão com a edição mais recente. O app DEVE
    avisar quando a versão deste aparelho foi descartada.
14. Excluir um deck num aparelho DEVE excluí-lo nos outros (marca de exclusão sincronizada).
15. A conta DEVE ter limites: 500 decks, 100 presets, 64 KB por deck.
16. Ao sair, os decks da conta DEVEM sumir deste navegador, salvo se o usuário escolher manter uma cópia local.

### Salas e histórico
17. Com login, entrar numa sala DEVE ligar o lugar à conta. O jogador pode voltar ao mesmo lugar de outro aparelho
    entrando com a mesma conta.
18. QUANDO uma partida online terminar, o servidor DEVE gravar no histórico:
    - jogadores (com conta, quando houver);
    - comandantes;
    - vencedores e motivos de derrota;
    - duração;
    - o necessário para um replay futuro (estado inicial e ações).
19. O app DEVE mostrar "Minhas partidas", com data, oponentes, comandantes e resultado.

## Requisitos não funcionais
- **Segurança:**
  - OAuth com `state` e PKCE e callback só para o próprio domínio;
  - cookies com as flags acima;
  - checagem de origem nas rotas que mudam dados;
  - rate limit no login e na API de nuvem;
  - nenhum token de provedor guardado depois do login.
- **Privacidade (LGPD):** dados mínimos, exclusão e exportação pelo próprio usuário, e um texto curto no Sobre e no
  LEGAL.md explicando o que é guardado e por quê.
- **Disponibilidade:** sem banco ou sem provedor de login, o jogo local e as salas continuam funcionando. Só a conta
  fica indisponível, com uma mensagem clara.
- **Desempenho:**
  - sincronizar 300 decks no primeiro login leva menos de 5 s;
  - a importação diária do catálogo no Postgres leva menos de 1 minuto.

## Critérios de aceite da fase
- Um usuário sem conta joga e salva decks como hoje. Nada pede login.
- Um usuário entra com Discord no computador, monta um deck, abre o site no tablet, entra com a mesma conta e encontra
  o deck. Edita lá, e a edição aparece no computador.
- Uma partida online entre duas contas aparece em "Minhas partidas" para as duas, com o resultado certo.
- Excluir a conta apaga tudo dela no servidor. A exportação baixa um JSON com os dados.
- O servidor de produção roda em Postgres, e as salas que existiam antes da migração continuam abrindo.
