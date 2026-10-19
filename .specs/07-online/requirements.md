# Requirements — 07 · Online (esboço, fase 2b)

> Esboço. Detalhar junto com o épico 01 quando a fase 2b começar.

## Objetivo
Jogar Commander com amigos em dispositivos diferentes, por link de convite, sem conta e sem custo.

## Escopo
- **Dentro:**
  - salas por link;
  - servidor autoritativo que roda o motor;
  - visão filtrada por jogador;
  - reconexão;
  - espectadores;
  - partidas mistas (humanos + bots, quando o 06 existir).
- **Fora (inicial):** ranking, matchmaking com estranhos, chat de voz.

## Requisitos (rascunho EARS)
1. QUANDO alguém criar uma sala, o sistema DEVE gerar um link de convite. Entrar não exige cadastro por e-mail
   (Fan Content Policy).
2. O servidor DEVE ser a única fonte da verdade: recebe ações, roda `reduce` e envia a cada jogador apenas
   `viewFor(estado, jogador)` (ou diferenças dela).
3. O cliente NÃO DEVE receber informação oculta de outros jogadores (fitness function existente, aplicada também
   ao protocolo).
4. QUANDO um jogador perder a conexão, o sistema DEVE manter o lugar por um tempo e restaurar a visão ao reconectar.
5. O modo local (goldfish e hot-seat) DEVE continuar funcionando sem rede.

## Notas de design
- **Recomendação:** Cloudflare Durable Objects (uma sala = um objeto com o estado e o motor). Fica atrás de uma
  porta de transporte (ACL), para poder migrar para um servidor Node + WebSocket próprio.
- **Decisão pendente:** hospedagem gerenciada (Cloudflare) ou servidor próprio.
- Base já pronta: motor puro e determinístico, estado serializável, `viewFor`, validação de ações, replay.
