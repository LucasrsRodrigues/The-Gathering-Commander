# Requirements — 10 · Editor de decks estilo Moxfield

## Objetivo
Montar e cuidar de decks com o conforto do Moxfield:
- ver o deck do jeito que for mais útil no momento;
- organizar as cartas por função;
- testar ideias numa lista "Talvez";
- editar tudo como texto;
- acompanhar o que mudou;
- trazer decks de outros sites;
- mostrar o deck para os amigos por um link.

## Contexto e suposições
- O épico 05 já entrega:
  - biblioteca;
  - editor com busca (sintaxe Scryfall), lista por tipo, escolha de arte, estatísticas simples, validação e
    bracket;
  - importar e exportar texto;
  - "Testar".
- O épico 08 sincroniza os decks pela nuvem (documento `Deck`, última edição vence) e valida no servidor com o
  `sanitizeDeck` do pacote `formats`. Mudar o formato do deck muda também o que o servidor aceita.
- O deck guarda só referências (`oracleId`, nome, impressão). Os dados de carta vêm do catálogo. Isso continua.
- **Fan Content Policy:** nada de impressão nem exportação de imagens de cartas (proxies). A página pública do deck é
  gratuita, sem anúncios, e mostra as imagens do Scryfall inteiras.

### Decisões (2026-10-19)
- **Visualização:** várias, alternáveis:
  - lista em texto, pilhas visuais e grade;
  - agrupar por tipo, valor de mana, cor ou categoria;
  - ordenar por nome ou valor de mana.
- **Organização:** categorias próprias. Cada carta tem tags (Ramp, Remoção…), com sugestões automáticas a partir do
  texto Oracle, e o deck pode ser agrupado por elas.
- **Listas:** o deck principal e uma lista "Talvez" (maybeboard), que não conta na validação nem entra na partida.
  Não há sideboard.
- **Biblioteca:** pastas e busca, link público do deck, estatísticas no editor e histórico de mudanças com volta a
  uma versão anterior.
- **Importar por link:** Archidekt (API pública) e Moxfield. O Moxfield não tem API oficial: o import tenta e, se
  falhar, pede para colar o texto.
- **Edição em massa:** um modo texto com o deck inteiro (`1 Sol Ring #Ramp`), com as categorias pelo `#`.
- **Telas:** computador e tablet. No celular o editor funciona, simplificado (lista em vez de pilhas largas).

## Escopo
**Dentro:**
- formato de deck v2 (tags, lista "Talvez", pasta, descrição e histórico), com migração automática do v1;
- editor novo, com três visualizações, agrupamentos e ordenações;
- categorias: criar, renomear, aplicar a várias cartas, sugestões pelo Oracle e arrastar entre grupos;
- lista "Talvez";
- painel de estatísticas;
- modo texto em massa;
- histórico de mudanças e restaurar versão;
- biblioteca com pastas, busca e ordenação;
- importar por link do Archidekt e do Moxfield;
- link público só de leitura, com "Copiar para meus decks".

**Fora:**
- coleção pessoal e preços;
- recomendações de cartas (estilo EDHREC);
- playtest além do "Testar" que já existe;
- comentários e curtidas em decks públicos, perfis públicos e busca de decks de outras pessoas;
- importar de outros sites (TappedOut, MTGGoldfish…), que dá para fazer colando o texto.

## User stories
- *Como construtor*, quero ver o deck em pilhas por categoria (Ramp, Remoção, Compra…) e arrastar uma carta de uma
  categoria para outra.
- *Como construtor*, quero jogar cartas na lista "Talvez" enquanto decido, e passar uma para o deck com um clique.
- *Como jogador*, quero colar o link do meu deck no Archidekt e ter o deck aqui, com as categorias.
- *Como jogador*, quero mandar um link para a mesa ver meu deck antes da partida.
- *Como construtor*, quero saber o que mudei desde a semana passada e voltar se piorou.

## Requisitos funcionais (EARS)

### Formato do deck
1. O deck DEVE ter, além do que já tem:
   - tags por carta;
   - a lista "Talvez";
   - uma pasta;
   - uma descrição curta;
   - o histórico de mudanças.
2. QUANDO um deck no formato antigo (v1) for lido, do navegador ou da nuvem, o sistema DEVE convertê-lo para o v2
   sem perder nada.
3. O servidor DEVE validar o deck v2 com os mesmos limites do app: quantidade e tamanho de tags, tamanho da
   descrição e do histórico, e tamanho total do documento.

### Visualizar e organizar
4. O editor DEVE oferecer três visualizações, trocadas na hora:
   - **lista:** nome, quantidade, custo e tags;
   - **pilhas:** imagens sobrepostas por grupo;
   - **grade:** imagens lado a lado.
5. O editor DEVE agrupar por tipo, valor de mana, cor ou categoria, e ordenar por nome ou valor de mana. A escolha
   DEVE ser lembrada neste navegador.
6. QUANDO agrupado por categoria, uma carta com várias tags DEVE aparecer no grupo da primeira tag (a principal) e
   mostrar as outras. Cartas sem tag DEVEM ficar em "Sem categoria".
7. O usuário DEVE poder:
   - criar, renomear e excluir categorias;
   - aplicar uma categoria a várias cartas selecionadas;
   - mudar a categoria principal arrastando a carta para outro grupo, ou pelo menu da carta, sem arrastar.
8. O sistema DEVE sugerir categorias pelo texto Oracle (Ramp, Compra, Remoção, Limpa-mesa, Contramágica, Tutor,
   Terreno). As sugestões só valem quando o usuário as aceita, carta a carta ou todas de uma vez.

### Lista "Talvez"
9. O deck DEVE ter uma lista "Talvez", que:
   - aceita cartas pela busca, pelo menu da carta e pelo arrastar;
   - não conta na validação, nas estatísticas do deck nem no bracket;
   - nunca entra na partida.
10. Uma carta DEVE passar entre o deck e o "Talvez" com um clique.

### Estatísticas
11. O painel DEVE mostrar:
    - a curva de mana (com e sem terrenos) e o valor de mana médio;
    - as cores do custo e as fontes de mana de cada cor;
    - a contagem por tipo e por categoria;
    - o número de terrenos.
12. QUANDO o usuário clicar num valor das estatísticas (por exemplo, "MV 3" ou "Ramp"), o editor DEVE destacar as
    cartas correspondentes.

### Edição em massa
13. O modo texto DEVE abrir o deck inteiro numa linha por carta (`1 Sol Ring #Ramp #Mana`), com as seções
    `Commander` e `Talvez`.
14. QUANDO o texto for salvo, o sistema DEVE:
    - resolver os nomes no catálogo;
    - aplicar as diferenças como uma única mudança no histórico;
    - listar os nomes não encontrados sem perder o resto.
15. O modo texto DEVE aceitar também a sintaxe de exportação do Moxfield e do Archidekt (`1 Nome (SET) 123 *F* #Tag`).
    Edição e número escolhem a impressão quando existirem.

### Histórico
16. Cada salvamento que muda cartas, quantidades ou listas DEVE registrar o que entrou e o que saiu, com a data.
    Mudanças seguidas em poucos minutos DEVEM ser juntadas numa só.
17. O histórico DEVE guardar pelo menos as últimas 50 mudanças. As mais antigas são descartadas primeiro.
18. O usuário DEVE poder ver o deck como estava em qualquer ponto do histórico e restaurá-lo. Restaurar é uma
    mudança nova, que também pode ser desfeita.

### Biblioteca
19. A biblioteca DEVE mostrar cada deck como um card, com:
    - a arte do comandante;
    - o nome;
    - a identidade de cor;
    - a contagem;
    - a validade.
20. O usuário DEVE poder pôr decks em pastas, criar, renomear e excluir pastas, e mover decks entre elas. Excluir uma
    pasta nunca exclui os decks.
21. A biblioteca DEVE buscar por nome do deck ou do comandante, e ordenar por última edição, nome ou cor.

### Importar por link
22. QUANDO o usuário colar um link de deck do Archidekt ou do Moxfield, o sistema DEVE buscar a lista pelo servidor
    e criar um deck novo, com comandantes, cartas, quantidades, "Talvez" e categorias.
23. SE a busca falhar (site fora do ar, deck privado, bloqueio), ENTÃO o sistema DEVE explicar o motivo e oferecer o
    colar texto.
24. O servidor DEVE aceitar só links desses dois sites e buscar só nos endereços de API conhecidos, montados a partir
    do id do deck.

### Link público
25. Com conta, o usuário DEVE poder ligar um link público para um deck. O link abre uma página só de leitura, com:
    - comandante;
    - cartas por categoria;
    - estatísticas;
    - descrição;
    - o nome de quem publicou.
26. A página pública DEVE mostrar sempre a versão atual do deck na nuvem, e funcionar sem conta para quem abre.
27. Quem abre DEVE poder copiar o deck para a própria biblioteca e exportar o texto.
28. O dono DEVE poder desligar o link. O link desligado para de funcionar na hora, e um link novo nunca reaproveita
    o antigo.

## Requisitos não funcionais
- **Desempenho:**
  - com 100 cartas, trocar de visualização ou de agrupamento leva menos de 100 ms;
  - as imagens carregam sob demanda, no tamanho pequeno do Scryfall, e as pilhas não pedem imagens fora da tela;
  - um deck de 300 entradas continua fluido.
- **Tablet:**
  - arrastar funciona por toque;
  - toda ação de arrastar tem um caminho pelo menu da carta;
  - alvos de toque de pelo menos 44 px.
- **Acessibilidade:**
  - a visualização em lista é a referência acessível (teclado e leitor de tela);
  - as pilhas e a grade têm nomes ARIA e foco visível.
- **Segurança:**
  - tags, descrição e texto colado são input não confiável: limites, só texto e nada de HTML;
  - o import por link tem allowlist de host, montagem fixa da URL, timeout e limite de tamanho;
  - a página pública não expõe o id da conta nem outros decks do dono.
- **Compatibilidade:** decks v1 continuam abrindo. Um navegador com o app antigo aberto não corrompe decks v2:
  ignora o que não entende e não sobrescreve.
- **Privacidade:** a página pública mostra só o nome de exibição de quem publicou. O LEGAL.md diz o que fica público.

## Critérios de aceite da fase
- Importar o link de um deck do Archidekt, com categorias, e ver o deck agrupado por elas.
- Montar um deck do zero em pilhas por categoria:
  - arrastar cartas entre categorias, no computador e no tablet;
  - mandar 5 cartas para o "Talvez";
  - ver que a validação ignora o "Talvez".
- Editar o deck no modo texto, salvar, ver a mudança no histórico, restaurar a versão anterior e desfazer a
  restauração.
- Ligar o link público, abrir numa janela anônima, copiar o deck para outra conta, e desligar o link.
- Um deck do formato antigo abre, ganha o formato novo e sincroniza normalmente.
