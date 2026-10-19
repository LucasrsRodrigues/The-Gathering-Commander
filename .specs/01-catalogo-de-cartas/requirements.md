# Requirements — 01 · Catálogo de cartas versionado (fase 2b)

## Objetivo
Um catálogo próprio no servidor, alimentado diariamente pelos dados públicos do Scryfall, que **guarda o histórico**:
texto Oracle por data (errata), legalidade em Commander por data e lista de Game Changers por data. Ele permite
"validar com a banlist de D" e dá ao servidor online uma fonte confiável para validar decks.

## Contexto e suposições
- Hoje o app fala direto com a API do Scryfall (porta `CatalogPort`). Isso continua como fallback.
- **O histórico só existe a partir da primeira importação.** O Scryfall não oferece histórico de errata nem de
  banlist. Para datas anteriores, as mudanças de banlist e de Game Changers podem ser registradas à mão em arquivos
  de dados datados, a partir dos anúncios oficiais (são listas de nomes e datas).
- **Os dados não vão para o repositório.** Ficam no armazenamento do servidor, como o Scryfall permite, e são
  servidos pela nossa API ao app (uso de Fan Content).

## Escopo
- **Dentro:**
  - importação diária do bulk "Oracle Cards" e "Default Cards" do Scryfall;
  - diff por hash;
  - versões de Oracle, legalidade e Game Changer com vigência;
  - consultas "atual" e "na data D";
  - API de leitura;
  - adaptador `CatalogPort` para o app;
  - validação de deck no servidor (fecha a lacuna do épico 07).
- **Fora:** preços, coleção pessoal, imagens hospedadas por nós (continuam no CDN do Scryfall), busca avançada
  própria (a busca continua usando a sintaxe do Scryfall).

## Requisitos funcionais (EARS)
1. QUANDO a importação diária rodar, o sistema DEVE baixar os arquivos bulk do Scryfall (seguindo as diretrizes
   deles: um download por dia, `User-Agent` identificado) e guardar o arquivo bruto com data.
2. Para cada carta (`oracle_id`), o sistema DEVE calcular o hash dos campos de regra (nome, custo, tipo, texto
   Oracle, P/T, lealdade, identidade de cor, keywords) e criar uma **nova versão** só quando o hash mudar, fechando
   a versão anterior (`valid_to`). _(aceite: rodar duas vezes com o mesmo arquivo não cria versões)_
3. O sistema DEVE fazer o mesmo para a legalidade em Commander e para o status de Game Changer.
4. O sistema DEVE responder "como era a carta X na data D" e "quais cartas estavam banidas em Commander na data D".
5. O sistema DEVE oferecer uma API de leitura: resolver nomes, buscar por `oracle_id`, ver as impressões e o
   estado "na data D". Usa `GET` com cache HTTP.
6. O app DEVE usar o catálogo próprio quando disponível e cair para o Scryfall direto quando não estiver,
   sem mudar o resto do app (ACL).
7. O servidor online (épico 07) DEVE validar os decks dos lugares contra o preset da sala, usando o catálogo próprio.
8. Os presets DEVEM poder fixar uma data de banlist ("banlist de 2025-04-22"), validada pelo histórico.
9. O sistema DEVE aceitar arquivos de dados datados no repositório para registrar mudanças anteriores à primeira
   importação (banlist e Game Changers), com a fonte (link do anúncio) em cada entrada.

## Requisitos não-funcionais
- **Respeito ao Scryfall:** no máximo uma importação por dia, sem raspagem de páginas, com crédito ao Scryfall no app.
- **Custo:** dentro do plano gratuito do provedor (cerca de 30 mil cartas Oracle e cerca de 100 mil impressões).
- **Desempenho:** resolver 100 nomes leva menos de 200 ms no servidor.
- **Integridade:** a importação é idempotente e transacional por lote. Uma falha no meio não deixa versões
  pela metade.
- **Segurança:** a API de leitura é pública e só de leitura, com rate limit. A importação roda num job agendado
  com credenciais em segredos do provedor, nunca no repositório.

## Critérios de aceite globais
- [ ] Duas importações seguidas sem mudança não criam versões novas. Uma errata simulada cria exatamente uma.
- [ ] "Banidas em Commander em D" responde com o histórico importado mais os arquivos de dados.
- [ ] O app funciona com o catálogo próprio desligado (fallback para o Scryfall).
