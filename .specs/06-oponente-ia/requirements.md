# Requirements — 06 · Oponente IA (esboço, fase 4)

> Esboço. Depende de o motor ter automação de cartas (fase 3).

## Objetivo
Permitir jogar contra a máquina em qualquer formação: 1 contra 1, 1 humano contra 3 bots, ou mesas mistas.
O bot é divertido para praticar e testar decks e escala em força ao longo do tempo.

## Escopo
- **Dentro:**
  - bot heurístico (nível 1);
  - simulação com MCTS e determinização de informação oculta (nível 2);
  - avaliação de ameaças no multiplayer (nível 3);
  - perfis de personalidade (cauteloso, agressivo);
  - decks de bot só com cartas automatizadas.
- **Fora (inicial):** bot competitivo e aprendizado de máquina.

## Requisitos (rascunho EARS)
1. O bot DEVE decidir pelo mesmo protocolo de decisões que um jogador humano (decisor plugável).
2. O bot NÃO DEVE acessar informação oculta. Ele recebe só a `PlayerView` (fitness function).
3. O bot DEVE pensar fora da thread de UI (Web Worker) e responder em até N segundos configuráveis.
4. QUANDO um oponente jogar uma carta manual, o bot DEVE continuar jogando com base no estado observado.
5. O sistema DEVE permitir escolher o perfil e o nível de cada bot na tela de setup.

## Notas de design
- **Referência:** `forge-ai` (GPL, ~57 mil linhas). Estudar ideias, não copiar código:
  - IA por tipo de efeito (`ability/*Ai.java`);
  - controladores de ataque e bloqueio;
  - `CreatureEvaluator` / `GameStateEvaluator`;
  - simulação (`simulation/`);
  - perfis `.ai` em dados.
- **Vantagem nossa:** estado imutável torna a simulação barata (o Forge e o XMage precisam de `copy()` profundo).
