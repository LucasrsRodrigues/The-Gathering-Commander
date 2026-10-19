# Requirements — 05 · Decks (fase 2a)

## Objetivo
Montar, importar, salvar e validar decks de Commander no próprio app, e levá-los direto para a mesa (partida ou
goldfish).

## Contexto e suposições
- Hoje o deck é só texto colado no setup (épico 03). Este épico cria decks de verdade, salvos.
- Busca e dados de carta vêm do Scryfall pela porta do catálogo (ACL). A validação usa o épico 04.
- Os decks ficam no navegador (sem conta). A sincronização entre dispositivos vem com o online (épico 07).

## Escopo
- **Dentro:**
  - biblioteca de decks (lista, criar, duplicar, excluir com confirmação);
  - editor com busca e autocompletar;
  - escolha do(s) comandante(s);
  - escolha da impressão (arte) de cada carta;
  - estatísticas: curva de mana, cores, tipos, contagem;
  - validação ao vivo contra um preset;
  - bracket sugerido;
  - importar texto (parser atual);
  - exportar como texto de lista (Moxfield/Arena);
  - "Testar" (goldfish) e uso no setup.
- **Fora:** coleção pessoal, preços, recomendações de cartas, impressão de cartas (proibido pela política: nada de
  proxies).

## User stories
- *Como construtor*, quero buscar "sol ring" e adicionar com um clique, vendo a curva mudar na hora.
- *Como jogador*, quero colar a lista do Moxfield, salvar e escolher esse deck no setup da partida.
- *Como jogador*, quero clicar "Testar" no editor e cair num goldfish com aquele deck.

## Requisitos funcionais (EARS)
1. O sistema DEVE listar os decks salvos, com nome, comandante(s), cores, contagem e estado de validação.
2. QUANDO o usuário digitar na busca, o sistema DEVE sugerir nomes (autocompletar) e mostrar resultados com imagem,
   respeitando o limite de requisições do Scryfall (debounce ≥ 300 ms e no máximo 10 requisições por segundo).
3. O sistema DEVE aceitar a sintaxe de busca do Scryfall (por exemplo, `t:creature id<=g mv<=3`) e já filtrar pela
   identidade de cor do comandante quando ela estiver definida (opção que pode ser desligada).
4. QUANDO uma carta for adicionada ou removida, o sistema DEVE atualizar na hora as estatísticas, a validação e o
   bracket.
5. O sistema DEVE guardar cada carta por `oracleId`, e a impressão escolhida por `scryfallId`.
   _(aceite: trocar a arte não muda a validação)_
6. QUANDO um texto de lista for importado, o sistema DEVE criar um deck novo, listar os nomes não encontrados e
   detectar o comandante (seção ou `*CMDR*`). SE não houver comandante marcado, ENTÃO DEVE pedir para escolher
   entre os candidatos elegíveis.
7. O sistema DEVE exportar o deck como texto no formato `1 Nome`, com a seção Commander.
8. O sistema DEVE salvar automaticamente cada alteração no navegador e permitir desfazer a última remoção de deck.
9. QUANDO o usuário clicar "Testar", o sistema DEVE iniciar uma partida de 1 lugar com o deck.
10. No setup da partida, cada lugar DEVE poder escolher um deck salvo, um deck de exemplo ou colar uma lista.

## Requisitos não-funcionais
- **Segurança:**
  - nomes, buscas e textos importados tratados como input não confiável;
  - consultas de busca enviadas só para `api.scryfall.com` (allowlist já existente);
  - sem HTML injetado.
- **Desempenho:** o editor fica fluido com 100 cartas; as estatísticas são recalculadas em menos de 16 ms.
- **Acessibilidade:** o editor é operável por teclado (busca → resultado → adicionar), com rótulos ARIA, seguindo o
  padrão da revisão T3.13.
- **Resiliência:** sem rede, os decks salvos abrem e mostram as cartas já em cache. A busca mostra um aviso.

## Critérios de aceite globais
- [ ] Montar um deck de 100 cartas do zero no editor, validar, salvar, recarregar a página e jogar com ele.
- [ ] Importar uma lista do Moxfield, corrigir o comandante e exportar de volta com o mesmo conteúdo.
