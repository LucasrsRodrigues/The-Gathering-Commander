# Requirements — 08 · Contas opcionais e nuvem (esboço, guardado)

> Esboço guardado a pedido do usuário (2026-10-19).

## Problema
Decks e regras da casa ficam só no navegador (IndexedDB e localStorage): não aparecem em outro dispositivo. Abas
do mesmo navegador também dividem o lugar numa sala online.

## O que entra
- **Login opcional:** Discord e/ou Google (OAuth), sem senhas guardadas; link mágico por e-mail é a alternativa.
  Pela Fan Content Policy, nunca obrigatório para jogar.
- **Sincronização de decks e presets** entre dispositivos; os dados locais sobem no primeiro login.
- **Identidade nas salas online** lembrada em qualquer dispositivo.
- **Histórico de partidas e replays** (o servidor já guarda estado inicial + ações).
- **Importação por link** onde os termos permitirem (Archidekt). O Moxfield não tem API pública: continua por texto.

## Decisões em aberto
1. **Provedor de login:** Discord, Google ou e-mail.
2. **Importação por link:** entra nesta onda?
