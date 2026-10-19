# Requirements — 09 · Regras de turno e tempo (esboço, guardado)

> Esboço guardado a pedido do usuário (2026-10-19). Retomar antes dos scripts de carta. Depende só do tipo da
> carta e das keywords (dados do Scryfall que já temos), não de automação carta a carta.

## Problema
Hoje o motor conhece as etapas, mas não restringe nada: dá para jogar a partida inteira na manutenção.

## O que entra
**Quando cada coisa pode ser feita (CR 305, 307, 117):**
- **Terreno:** só o jogador ativo, numa fase principal, com a pilha vazia, 1 por turno.
- **Velocidade de feitiço** (criatura, feitiço, artefato, encantamento, planeswalker, batalha): jogador ativo,
  fase principal, pilha vazia.
- **Instantâneas e cartas com Flash:** quando o jogador tem prioridade.
- **Comandante:** segue o tipo dele, mais a taxa.

**Combate (CR 506–511):**
- Atacantes só desvirados e sem enjoo de invocação (Haste pelas keywords), com escolha de alvo (jogador ou
  planeswalker).
- Bloqueadores por defensor.
- Dano calculado com P/T e contadores; Trample, First strike e Deathtouch pelas keywords.
- Morte por dano letal; dano de comandante somado automaticamente.
- Sem atacantes, o combate é pulado.

**Etapas:** untap automático, compra automática, cleanup com descarte até o tamanho máximo da mão e remoção do
dano marcado.

**Paradas automáticas, como no Arena:** a prioridade passa sozinha onde o jogador não quer parar (configurável).

**Válvula de escape:** um nível de rigor nas regras da casa (`block`/`warn`/`off`) e a ação "Fazer mesmo assim",
registrada no log como ação de juiz.

## Decisões em aberto
1. **Padrão do rigor:** Assistido (`warn`, deixa fazer) ou Estrito (`block`). Sugestão: Assistido.
2. **Mana:** cobrar custo agora ou na onda de scripts? Sugestão: na onda de scripts, porque básicos são fáceis mas
   terrenos especiais e artefatos de mana precisam de script.
