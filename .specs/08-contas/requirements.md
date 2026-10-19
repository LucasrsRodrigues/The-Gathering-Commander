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

## Decisões tomadas
- **Sem login (2026-10-19):** joga tudo, como a Wizards exige, e continua salvando decks e regras da casa **no
  próprio navegador**.
- **Com login:** habilita o cadastro e a nuvem (decks e presets em qualquer aparelho, perfil, identidade nas salas,
  histórico de partidas). Os dados locais sobem no primeiro login.

- **Login (2026-10-19):** Discord e Google (OAuth), sem senha guardada por nós.
- **Sincronização:** a última edição vence (por deck e por preset), com aviso quando uma versão é descartada.
- **Banco:** migrar de SQLite para Postgres nesta onda, incluindo salas e catálogo.
- **Importação por link (Archidekt):** fica para depois, junto do editor estilo Moxfield.
