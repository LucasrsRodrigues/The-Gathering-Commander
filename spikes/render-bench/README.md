# Render Bench (spike descartável)

Compara duas formas de desenhar a mesa de Commander com 4 jogadores, usando o mesmo modelo de mesa (`src/bench/board.ts`):

- **DOM / CSS 3D** (`src/render-dom`): cartas como `div`, mesa inclinada com `rotateX`.
- **Three.js** (`src/render-three`, react-three-fiber): mesa 3D com perspectiva, luz e sombras, no estilo Arena.

A mão e a ampliação da carta são DOM nos dois casos (`src/bench/Overlays.tsx`). As imagens vêm do Scryfall e ficam em cache no `localStorage`.

## Rodar

```bash
npm install
npm run dev -- --host
```

No tablet, na mesma rede Wi-Fi, abra `http://<ip-do-computador>:5173`. Use `#three` ou `#dom` na URL para escolher o renderizador.

## Como medir

1. Ligue **Efeitos** (e **Texturas HD**, se quiser testar o pior caso).
2. Clique em **Rodar benchmark**. Ele mede 80, 160, 240 e 320 cartas, com o modo de estresse ligado.
3. Troque o renderizador e rode de novo. A tabela guarda os dois resultados.

## Resultados até agora

MacBook (tela de 120 Hz), navegador do app, efeitos ligados:

| Cartas | DOM | Three.js |
|---|---|---|
| 80 | 120 / 109 | 120 / 109 |
| 160 | 119 / 109 | 120 / 108 |
| 240 | 119 / 108 | 120 / 108 |
| 320 | 120 / 108 | 120 / 110 |

Formato: fps médio / 1% low. Os dois batem no limite da tela, então o computador não diferencia as opções. **Falta medir num tablet de verdade.**
