import { FanContentNotice } from '../legal/FanContentNotice'

export function AboutScreen() {
  return (
    <main className="about">
      <h1>Sobre</h1>
      <p>
        The Gathering Hall é um fan game gratuito e de código aberto (licença MIT) para jogar Commander numa mesa
        interativa. Não exige conta, não tem conteúdo pago e nunca terá.
      </p>
      <h2>Dados das cartas</h2>
      <p>
        Nomes, textos e imagens das cartas vêm da API pública do <a href="https://scryfall.com" target="_blank" rel="noreferrer">Scryfall</a> em
        tempo de execução. Nada disso é distribuído com o código. As imagens aparecem inteiras, com o crédito de
        artista e copyright originais.
      </p>
      <h2>Contas e privacidade</h2>
      <p>
        A conta é opcional. Sem ela, seus decks ficam só neste navegador, e o servidor guarda apenas o que a sala online
        precisa, apagado depois de 24 horas sem uso.
      </p>
      <p>
        Com conta, guardamos o id do Discord ou do Google, o nome, a foto, as sessões abertas, os decks e as regras da casa
        que você salvar, e o histórico das partidas online. Nunca guardamos e-mail, senha nem os tokens do provedor. Não
        há anúncios nem rastreamento.
      </p>
      <p>
        Em "Minha conta", dá para baixar tudo em JSON ou excluir a conta. Excluir apaga a conta e a nuvem, e o
        histórico fica só para os outros jogadores, como "Jogador N". Os detalhes estão no LEGAL.md do repositório.
      </p>
      <h2>O que este projeto não faz</h2>
      <ul>
        <li>Não usa logos nem marcas da Wizards of the Coast.</li>
        <li>Não imprime nem exporta cartas (proxies).</li>
        <li>Não cobra pelo acesso.</li>
      </ul>
      <h2>Aviso legal</h2>
      <FanContentNotice />
    </main>
  )
}
