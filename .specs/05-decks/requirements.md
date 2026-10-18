# Requirements — 05 · Decks (esboço, fase 2)

> Esboço. Na fase 1 existe só o parser de decklist e os decks de exemplo (épico 03).

## Objetivo
Importar, montar, salvar e validar decks de Commander contra o preset de regras escolhido.

## Escopo
- **Dentro:**
  - importar texto e formatos conhecidos (Moxfield, Archidekt);
  - editor com busca no catálogo;
  - escolher a impressão preferida de cada carta;
  - validar contra o preset do épico 04;
  - estatísticas (curva, cores, tipos);
  - goldfish a partir do editor.
- **Fora:** coleção pessoal e preços.

## Requisitos (rascunho EARS)
1. QUANDO um deck for importado, o sistema DEVE apontar cada carta pelo `oracle_id` e, opcionalmente, pela
   impressão preferida.
2. QUANDO um deck for validado, o sistema DEVE listar cada violação (tamanho, singleton, identidade de cor,
   banidas, pareamento de partner) com a regra correspondente.
3. O sistema DEVE salvar decks localmente sem exigir conta.
4. O sistema DEVE mostrar o bracket sugerido (épico 04).
