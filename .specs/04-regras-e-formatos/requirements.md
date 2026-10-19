# Requirements — 04 · Regras e formatos (fase 2a)

## Objetivo
Representar o formato Commander e as regras da casa como **dados**. Os grupos podem criar, salvar e compartilhar
presets, e cada regra pode **bloquear**, **avisar** ou ficar **desligada**.

## Contexto e suposições
- O motor (épico 02) já recebe um `Ruleset` parametrizado. Este épico produz esse `Ruleset` e as regras de deck.
- **Estado atual vindo do Scryfall:** banidas (`legalities.commander`) e Game Changers (`game_changer`) vêm dos
  dados do Scryfall em tempo de execução. Assim não mantemos listas à mão para o presente.
  *Suposição a confirmar na implementação: o campo `game_changer` continua disponível na API.*
- **Histórico em arquivos de dados:** quando quisermos "banlist na data D", as mudanças ficam em arquivos datados
  no repositório. São só listas de nomes e datas, que são fatos e não conteúdo da Wizards.
- **Restrições "de jogada"** (por exemplo, "sem combos infinitos") dependem de o motor entender as cartas (fase 3).
  Na fase 2a, as restrições valem para **decks** e para **parâmetros do motor** (vida, mulligan, prioridade estrita,
  quem mexe em quê).

## Escopo
- **Dentro:**
  - formato Commander oficial versionado;
  - presets nomeados derivados dele;
  - regras de deck: tamanho, singleton, identidade de cor, elegibilidade de comandante, partner e afins, banidas;
  - parâmetros de partida: vida, limites, taxa, mulligan, prioridade, restrição de controlador;
  - nível de aplicação por regra;
  - bracket sugerido;
  - exportar e importar presets como texto.
- **Fora:** Brawl, Oathbreaker e outras variantes (o modelo deve permitir adicioná-las). Restrições sobre efeitos de
  carta ficam para a fase 3.

## User stories
- *Como grupo*, quero salvar "Regras de sexta" (30 de vida, Sol Ring banido) e escolhê-lo ao montar a mesa.
- *Como jogador*, quero saber por que meu deck não é válido, regra por regra, e em quais cartas.
- *Como grupo que joga por bracket*, quero ver o bracket sugerido de cada deck antes de começar.

## Requisitos funcionais (EARS)
1. O sistema DEVE oferecer o preset "Commander oficial" como padrão de toda partida e de todo deck novo.
   _(aceite: um deck sem preset é validado pelo oficial)_
2. QUANDO o usuário criar um preset, o sistema DEVE derivá-lo de uma versão do formato oficial e guardar só o que
   difere (overrides). _(aceite: um preset que muda só a vida guarda só a vida)_
3. Cada regra de deck DEVE ter um nível: `block`, `warn` ou `off`. _(aceite: as três situações testadas para cada regra)_
4. QUANDO um deck for validado, o sistema DEVE devolver cada violação com regra, nível, mensagem em português e
   cartas envolvidas.
5. O sistema DEVE validar:
   - tamanho (100 com comandante(s));
   - singleton, exceto básicos e cartas cujo texto Oracle permite várias cópias;
   - elegibilidade do comandante (lendária criatura ou texto "can be your commander");
   - pareamentos (Partner, Partner with, Friends forever, Choose a Background, Doctor's companion);
   - identidade de cor;
   - banidas (oficial, nenhuma ou lista personalizada);
   - "banida como comandante".
   _(aceite: um teste por regra, com cartas reais simuladas)_
6. O sistema NÃO DEVE decidir nada por nome de carta no código. Exceções de singleton, elegibilidade e pareamento
   vêm do texto Oracle e dos campos do catálogo. _(aceite: fitness function igual à do motor)_
7. SE alguma violação tiver nível `block`, ENTÃO o sistema DEVE impedir que o deck entre numa partida com aquele
   preset. Avisos (`warn`) aparecem, mas não impedem.
8. O sistema DEVE calcular o bracket sugerido (1 a 5) a partir de Game Changers, destruição em massa de terrenos,
   turnos extras em cadeia e combos de duas cartas, mostrando os motivos.
   _(aceite: deck sem Game Changers ≤ bracket 2; com 4 ou mais → bracket 4)_
   *Suposição: as definições oficiais de bracket são conferidas na implementação. Combos de duas cartas ficam
   para depois, porque precisam de uma fonte de dados, como a API do Commander Spellbook.*
9. QUANDO o usuário exportar um preset, o sistema DEVE gerar um texto (JSON compacto) para colar no chat do grupo.
   QUANDO importar, DEVE validar o texto como input não confiável.
10. O sistema DEVE guardar presets localmente, sem conta.

## Requisitos não-funcionais
- **Pureza:** a validação e o cálculo de bracket ficam num pacote puro (`packages/formats`), sem UI nem rede.
  Recebem os dados das cartas prontos.
- **Segurança:** presets importados passam por validação de schema (tipos, tamanhos, limites numéricos). Valores
  absurdos, como 1.000.000 de vida, são recusados.
- **Desempenho:** validar um deck de 100 cartas leva menos de 5 ms.

## Critérios de aceite globais
- [ ] Um preset criado, exportado, importado em outro navegador e usado numa partida.
- [ ] Um deck com Sol Ring banido por regra da casa é bloqueado nesse preset e aceito no oficial.
