# Requirements — 11 · Automação de cartas (fase 3c)

## Objetivo
O motor passa a fazer o que as cartas dizem:
- comprar, causar dano, destruir, criar fichas;
- gerar a mana que depende de algo na mesa;
- ativar habilidades.

A automação cresce em ondas, começando pelas cartas mais jogadas no Commander. O que o motor ainda não entende
continua manual, como hoje, na mesma partida.

## Contexto e suposições
- **Hoje (épicos 02 e 09):**
  - o motor entende tipos, custo, P/R, palavras-chave de combate e habilidades de mana de quantidade fixa;
  - uma mágica resolvida só sai da pilha: vai para o cemitério ou para o campo. Os efeitos são aplicados à mão, com
    as ações da mesa;
  - a única exceção são os rituais ("Add {B}{B}{B}.").
- **Fonte das regras:** as regras de carta saem do texto Oracle (`deriveCardRules`, no `engine`). O servidor usa a
  mesma função ao preencher o deck pelo catálogo, então local e online automatizam igual.
- **Referências:** o XMage e o Forge montam cada carta com peças genéricas (tipos de efeito, valores dinâmicos,
  filtros). Seguimos a mesma ideia, **sem copiar código nem scripts** deles (o Forge é GPL), escrevendo a partir do
  texto Oracle.

### Decisões (2026-10-19 e 2026-10-20)
- **Fonte híbrida:** um leitor do Oracle cobre as frases comuns, e um arquivo de exceções por carta cobre o resto,
  no nosso próprio formato.
- **Ondas:**
  - **onda 1:** mana variável (Marwyn, Priest of Titania) e efeitos comuns de mágicas e de "quando entra no campo";
  - **onda 2:** habilidades ativadas, com contagens (Wellwisher) e buscas.
- **Alvos:** escolhidos clicando na mesa, estilo Arena, com os alvos válidos em destaque. Modos sem alvo abrem um
  painel.
- **Resolver:** o jogo resolve sozinho e mostra no registro o que fez. As escolhas (alvos, modos, "até N") são
  pedidas na mesa.
- **Texto entendido em parte:** o jogo faz a parte entendida e avisa "o resto é com você", mostrando a parte manual.
- **Prioridade:** a cobertura segue o ranking do EDHREC (o `edhrec_rank` do Scryfall) e é medida nas 1.000 e nas
  5.000 cartas mais jogadas.
- **Cobertura visível:** um selo discreto "automática", "parcial" ou "manual" na prévia e no editor, e um resumo no
  editor ("82 de 100 cartas automáticas").

## Escopo
**Dentro:**
- um modelo de efeitos (dados puros), com valores dinâmicos e filtros;
- o leitor do Oracle para as frases das ondas 1 e 2, mais o arquivo de exceções por carta;
- a resolução automática de mágicas instantâneas e feitiços, de habilidades "quando entra no campo" e de
  habilidades ativadas;
- mana variável;
- escolha de alvos na mesa, legalidade dos alvos na resolução e mágica anulada quando todos os alvos somem;
- o selo de cobertura e a medição da cobertura;
- "Resolver à mão" para qualquer item automatizado (válvula de segurança contra erro de leitura).

**Fora (fica para depois):**
- gatilhos além de "quando entra no campo" (morrer, atacar, manutenção, conjurar). Estão listados como onda 3;
- efeitos contínuos em camadas (anthems, mudança de tipo ou de controle);
- efeitos de substituição ("se fosse…, em vez disso…");
- custos alternativos e reduções de custo;
- cópias e clones;
- habilidades de lealdade dos planeswalkers.

Nessas cartas, a parte não coberta continua manual, como hoje.

## User stories
- *Como jogador*, conjuro Lightning Bolt, clico no alvo na mesa, e o dano é causado sozinho, com o registro dizendo
  o que aconteceu.
- *Como jogador de Elfos*, viro a Marwyn e recebo a mana verde igual à força dela, sem declarar nada.
- *Como jogador*, ativo a Wellwisher pelo menu e ganho 1 de vida por Elfo no campo.
- *Como construtor*, vejo no editor quantas cartas do deck são automáticas e quais são manuais.

## Requisitos funcionais (EARS)

### Modelo e leitor
1. As regras de carta DEVEM poder descrever:
   - efeitos de mágica;
   - efeitos de "quando entra no campo";
   - habilidades ativadas (custo e efeitos);
   - mana variável.

   Tudo como dados (sem funções), serializável no estado da partida.
2. O leitor DEVE marcar cada carta como automática (todo o texto entendido), parcial (parte entendida, com as frases
   manuais listadas) ou manual.
3. O leitor NUNCA DEVE marcar como automática uma carta com frase não reconhecida (fitness).
4. Uma exceção por carta (pelo `oracleId`) DEVE substituir o resultado do leitor para aquela carta.

### Resolver
5. QUANDO uma mágica automatizada resolver, o motor DEVE aplicar os efeitos em ordem, emitir eventos para o
   registro e então pôr a carta onde ela vai (cemitério ou campo).
6. QUANDO uma permanente com efeito "quando entra no campo" entrar no campo, o motor DEVE pôr a habilidade na pilha,
   pedindo os alvos ao controlador se houver.
7. QUANDO uma mágica ou habilidade com alvo for conjurada ou posta na pilha, o motor DEVE pedir os alvos (CR 601.2c)
   e aceitar só alvos válidos para o filtro.
8. QUANDO um item resolver, o motor DEVE checar de novo os alvos. Os que ficaram ilegais são ignorados, e SE todos
   ficaram ilegais, ENTÃO o item é anulado (CR 608.2b).
9. Qualquer jogador com prioridade DEVE poder pedir "Resolver à mão" para o item do topo. Isso pula os efeitos
   automáticos, fica no registro e segue as mesmas regras de exceção (aprovação no online).
10. Num item parcial, o motor DEVE aplicar a parte entendida e mostrar a parte manual no registro e na prévia.

### Mana variável
11. A habilidade de mana DEVE aceitar quantidade dinâmica (a força da própria criatura, o número de Elfos, o número
    de marcadores) e entrar no pagamento automático como as outras fontes.

### Habilidades ativadas (onda 2)
12. O menu da carta DEVE listar as habilidades ativadas automatizadas, com o custo, e ativar paga o custo:
    - {T}, mana, sacrificar, descartar ou pagar vida;
    - e respeita as regras de tempo ("só como feitiço", enjoo para {T}).
13. Os efeitos DEVEM aceitar contagens: "para cada Elfo no campo", "igual ao número de cartas na sua mão".
14. A busca no grimório ("procure um terreno básico…") DEVE abrir um seletor com só as cartas válidas e embaralhar
    depois.

### Cobertura
15. A prévia e o editor DEVEM mostrar o selo de cobertura de cada carta, e o editor um resumo do deck.
16. Um comando do servidor DEVE medir a cobertura nas 1.000 e nas 5.000 cartas mais jogadas (pelo `edhrec_rank`) e
    listar as frases não reconhecidas mais comuns, para guiar a próxima onda.

## Requisitos não funcionais
- **Correção:**
  - na dúvida, o leitor não automatiza (é melhor manual do que errado);
  - cada frase reconhecida tem teste com o texto Oracle real de pelo menos uma carta.
- **Determinismo:** a resolução é pura, como o resto do motor: o mesmo estado e a mesma ação dão o mesmo resultado.
  Replays e "Desfazer" continuam funcionando.
- **Desempenho:** ler o Oracle das 35 mil cartas do catálogo leva menos de 5 s no servidor (import diário).
- **Compatibilidade:** partidas salvas antes do épico continuam abrindo (`migrateState`), e cartas sem as regras
  novas jogam como hoje.
- **Fan Content Policy:** nada de texto de regras da Wizards no repositório além do que os testes precisam (trechos
  curtos do Oracle, que já é público no Scryfall).

## Critérios de aceite da fase
- No deck de exemplo de Elfos:
  - Marwyn e Priest of Titania geram a mana certa sozinhas;
  - Wellwisher ganha vida pela contagem;
  - Llanowar Elves continua como hoje.
- Lightning Bolt num alvo clicado causa 3 de dano. Se o alvo sai antes de resolver, a mágica é anulada.
- Uma criatura com "quando entra no campo, compre uma carta" compra sozinha, pela pilha.
- A medição mostra a cobertura das 1.000 mais jogadas. A meta da onda 1 é pelo menos 35% automáticas ou parciais.
- "Resolver à mão" desliga a automação de um item e a partida segue manual.
