# Requirements — 03 · Mesa interativa

## Objetivo
Uma mesa de Commander com visual no estilo Arena, em Three.js, e interface DOM ao redor. Mexer na mesa deve ser
tão natural quanto numa mesa física: arrastar, virar, ampliar, mover entre zonas. Ao mesmo tempo, a mesa deve
deixar claros turno, etapa, prioridade e pilha.

## Contexto e suposições
- Fase 1: sandbox assistido sobre o motor (épico 02). Toda carta é `manual`.
- Para ter cartas reais na fase 1, entra um catálogo **mínimo**: resolver nomes no Scryfall e guardar em cache.
  O catálogo completo e versionado é o épico 01.
- Importação mínima de decklist em texto para jogar. A validação completa é o épico 05.
- Dispositivos: computador (mouse e teclado) e tablet (toque). A medição de desempenho no tablet está pendente.

## Escopo
- **Dentro:**
  - Tela de setup.
  - Mesa 3D.
  - HUD: jogadores, etapas, pilha, mão, ampliação, menu da carta, visor de zonas, log.
  - Foco no oponente.
  - Hot-seat com cortina.
  - Goldfish.
  - Undo local.
  - Aviso de Fan Content.
- **Fora:** online, bots, validação de deck, automação de regras de carta, sons.

## Personas e user stories
- *Como jogador em goldfish*, quero colar minha lista e já jogar, para testar o deck em segundos.
- *Como grupo em hot-seat*, quero que cada um veja só a própria mão na sua vez, para jogar num tablet passando de
  mão em mão.
- *Como jogador num tablet*, quero tocar na área de um oponente e a câmera se aproximar, para conseguir ler
  as cartas dele.

## Requisitos funcionais (EARS)

### Setup
1. O sistema DEVE permitir configurar de 1 a 4 lugares com nome e deck. O deck pode ser colado como texto ou
   escolhido entre os exemplos. _(aceite: iniciar partida de 4 com decks de exemplo em ≤ 3 cliques)_
2. QUANDO uma decklist for colada, o sistema DEVE reconhecer quantidade + nome, ignorar código de set, número e
   marcadores de foil, identificar o comandante (seção "Commander" ou marcador `*CMDR*`) e listar os nomes não
   encontrados. _(aceite: listas exportadas do Moxfield e do Archidekt funcionam)_
3. QUANDO os nomes forem resolvidos, o sistema DEVE buscá-los no Scryfall em lotes de até 75, guardar em cache
   local e respeitar o intervalo entre requisições. _(aceite: a segunda partida com o mesmo deck não faz requisição)_

### Mesa 3D
4. O sistema DEVE renderizar o campo de batalha em 3D, com a área do jogador local à frente e os oponentes ao fundo,
   organizando automaticamente terrenos, criaturas e outros permanentes em fileiras.
5. QUANDO o jogador arrastar um permanente pelo campo, o sistema DEVE fixar a nova posição (`setArrangement`).
6. QUANDO o jogador clicar ou tocar num permanente que controla, o sistema DEVE virá-lo ou desvirá-lo, com animação.
7. QUANDO o ponteiro passar sobre uma carta (mouse) ou ela for segurada (toque, 450 ms), o sistema DEVE mostrar a
   carta ampliada.
8. QUANDO o jogador abrir o menu de uma carta (botão direito ou toque longo seguido de "Ações"), o sistema DEVE
   oferecer:
   - virar ou desvirar;
   - mover para mão, cemitério, exílio, topo ou fundo do grimório, zona de comando;
   - contadores +1/+1 e −1/−1 e contador genérico;
   - virar face para baixo;
   - devolver o comandante.
9. O sistema DEVE mostrar as pilhas de grimório, cemitério, exílio e zona de comando de cada jogador, com
   contagens. QUANDO uma pilha visível for aberta, DEVE listar as cartas num visor DOM com as mesmas ações.
10. QUANDO o jogador tocar na área de um oponente, o sistema DEVE animar a câmera para focar essa área.
    QUANDO voltar (botão ou Esc), DEVE retornar à visão geral.

### HUD (DOM)
11. O sistema DEVE mostrar, para cada jogador, vida, veneno e dano de comandante recebido, com botões de +/−
    (toque longo para ±5).
12. O sistema DEVE mostrar a etapa atual, o jogador ativo e quem tem prioridade, com o botão "Passar" (ou
    "Avançar" no modo relaxed). Atalho: espaço.
13. O sistema DEVE mostrar a pilha com o item do topo destacado. Habilidades manuais podem ser adicionadas por texto.
14. O sistema DEVE mostrar a mão do jogador do lugar atual. QUANDO uma carta da mão for jogada (clique e "Jogar"
    ou arrastar para a mesa), terrenos vão para o campo e o resto vai para a pilha.
15. QUANDO o motor recusar uma ação, o sistema DEVE mostrar o motivo de forma breve, sem modal.
16. O sistema DEVE manter um log legível da partida a partir dos eventos.
17. QUANDO o jogador pedir desfazer (botão ou Ctrl/Cmd+Z), o sistema DEVE voltar ao estado anterior à última ação
    da sessão local.

### Hot-seat e goldfish
18. ENQUANTO houver mais de um humano no mesmo dispositivo, QUANDO o lugar que precisa agir mudar, o sistema DEVE
    cobrir a tela ("Passe para <nome>") até o próximo jogador confirmar. Só depois DEVE mostrar a mão dele.
19. ENQUANTO houver só um jogador (goldfish), o sistema NÃO DEVE mostrar a cortina.

### Legal
20. O sistema DEVE mostrar o aviso de Fan Content no rodapé da tela de setup e na tela "Sobre".

## Requisitos não-funcionais
- **Desempenho:** ≥ 60 fps num computador com 4 jogadores × 40 permanentes. Texturas `small` na mesa e `large`
  na ampliação.
- **Humble object:** a cena 3D não contém regras. Ela só desenha a `PlayerView` e despacha ações. O layout é uma
  função pura e testável.
- **Acessibilidade:** HUD navegável por teclado, com rótulos ARIA. A ampliação e o visor de zonas são a forma
  acessível de ler cartas.
- **Responsividade:** funciona de 1024×700 até 2560×1440. Tablet em paisagem (o retrato fica para depois).
- **Segurança:** a decklist é tratada como texto não confiável (parser com limites de tamanho, sem HTML). Só se
  fala com o domínio `api.scryfall.com` e imagens de `cards.scryfall.io`.

## Critérios de aceite globais
- [ ] Partida goldfish completa (mulligan, 5 turnos, conjurar, virar, comprar) só com mouse.
- [ ] Partida hot-seat de 4 jogadores, com cortina, até um vencedor.
- [ ] Foco no oponente funcionando com mouse e toque.
