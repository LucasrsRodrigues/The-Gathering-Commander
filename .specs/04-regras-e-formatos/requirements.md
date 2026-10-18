# Requirements — 04 · Regras e formatos (esboço, fase 2)

> Esboço. Na fase 1, o motor já aceita um `Ruleset` parametrizado com o padrão oficial de Commander.

## Objetivo
Representar o formato Commander e as regras da casa como **dados versionados**. Os grupos podem criar, salvar e
compartilhar presets, e as regras podem **restringir** jogadas e decks, não só avisar.

## Escopo
- **Dentro:**
  - Commander oficial como padrão;
  - regras da casa: vida inicial, limites de dano e veneno, taxa, mulligan, mulligans grátis, tamanho de deck,
    singleton, identidade de cor, partner, background e companion;
  - banlist (oficial, nenhuma ou personalizada);
  - Game Changers e brackets;
  - presets nomeados;
  - vigência por data.
- **Fora (v1):** Brawl, Oathbreaker, Duel Commander e outras variantes. O modelo deve permitir adicioná-las depois.

## Requisitos (rascunho EARS)
1. O sistema DEVE usar o Commander oficial como padrão de toda partida nova.
2. QUANDO um grupo salvar regras da casa, o sistema DEVE guardá-las como preset nomeado, derivado de uma versão do
   formato oficial.
3. SE uma regra estiver marcada como restritiva, ENTÃO o sistema DEVE impedir a ação ou o deck que a viola,
   mostrando qual regra foi violada.
4. O sistema DEVE guardar banlist e Game Changers com data de vigência, permitindo jogar "com a banlist de D".
5. O sistema DEVE calcular o bracket sugerido de um deck a partir das listas de dados (Game Changers, combos,
   destruição em massa de terrenos, turnos extras).

## Notas de design
- Ideia do Forge: formatos e listas em arquivos de dados datados. Melhoria: tipados e com vigência também
  para Commander (o Forge não arquiva banlists de Commander).
- O XMage usa banlist hardcoded em Java, o que evitamos.
