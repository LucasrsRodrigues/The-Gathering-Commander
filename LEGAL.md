# Aviso legal e Fan Content Policy

The Gathering Hall is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

Este projeto segue a [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).

## O que fazemos
- O jogo é **gratuito**. Não exigimos pagamento, assinatura nem cadastro por e-mail para jogar.
- O código é aberto (licença MIT) e livre para qualquer pessoa, inclusive a Wizards, usar sem pedir permissão
  nem dar crédito.
- O aviso acima aparece no app (tela inicial e tela Sobre) e neste repositório.
- Dados e imagens de cartas vêm da API pública do [Scryfall](https://scryfall.com) **em tempo de execução**.
  As imagens aparecem inteiras, sem remover crédito de artista nem avisos de copyright.

## O que não fazemos
- Não incluímos logos nem marcas da Wizards of the Coast. O verso de carta e a identidade visual são próprios.
- Não redistribuímos dados nem imagens de cartas neste repositório.
- Não oferecemos impressão nem exportação de cartas (proxies).
- Não vendemos nem licenciamos o projeto.

## Privacidade
A conta é **opcional**. Tudo no jogo funciona sem ela.

**Sem conta**, o servidor só guarda o que uma sala online precisa:
- o nome digitado e o deck de cada lugar;
- a partida e um token por pessoa (só o hash dele).

A sala é apagada depois de 24 horas sem uso. Os decks e as regras da casa ficam só no seu navegador.

**Com conta** (Discord ou Google), o servidor guarda:
- o id da conta no provedor, o nome de exibição e o link da foto;
- as sessões abertas: o hash do cookie e as datas de início e de último uso, por até 30 dias sem uso;
- os decks e as regras da casa que você salvar, para aparecerem em outros aparelhos;
- o histórico das partidas online: data, nomes, comandantes, resultado e as jogadas, para um replay futuro.

Por enquanto, o histórico não tem prazo para ser apagado.

**Não guardamos** e-mail, senha nem os tokens do provedor, que são descartados logo depois de ler o perfil.
Também não há anúncios, rastreamento nem analytics.

**Cookies:**
- `gh_session`: a sessão, só com conta, `HttpOnly`;
- `gh_oauth`: dura 10 minutos, só durante o login.

**Como baixar ou apagar seus dados:** em "Minha conta", "Baixar meus dados" entrega um JSON com tudo o que o
servidor guarda sobre a conta.

"Excluir conta":
- apaga a conta, as sessões em todos os aparelhos e os decks e regras da nuvem;
- tira o vínculo do histórico, que fica para os outros jogadores com o nome "Jogador N";
- não mexe nos decks salvos no seu navegador.

Partidas jogadas sem conta também entram no histórico, sem vínculo com ninguém.

## Pedido de remoção
Se a Wizards of the Coast ou outro titular de direitos pedir a remoção de algum conteúdo, os mantenedores tiram o
conteúdo do ar assim que o pedido chegar. Abra uma issue marcada como `legal` ou fale diretamente com os
mantenedores.

## Para contribuidores
- Não adicione ao repositório imagens, PDFs, textos de regras ou dumps de cartas da Wizards.
- Scripts de carta são escritos a partir do texto Oracle. Não copie nem traduza scripts de outros projetos,
  como Forge (GPL) ou XMage.
