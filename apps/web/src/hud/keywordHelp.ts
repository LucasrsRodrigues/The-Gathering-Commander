// Short explanations of keywords for the card preview (Arena style). Keyed by Scryfall's keyword name (English).
// Written in our own words; the Portuguese name is the one printed on Portuguese cards when we are sure of it.

export interface KeywordHelp {
  name: string // shown name: "Voar (Flying)"
  help: string
}

const K: Record<string, [pt: string | null, help: string]> = {
  flying: ['Voar', 'Só pode ser bloqueada por criaturas com voar ou alcance.'],
  reach: ['Alcance', 'Pode bloquear criaturas com voar.'],
  trample: ['Atropelar', 'O dano de combate que sobra depois de dar dano letal aos bloqueadores vai para o jogador ou planeswalker atacado.'],
  deathtouch: ['Toque Mortífero', 'Qualquer quantidade de dano que ela causa a uma criatura é suficiente para destruí-la.'],
  lifelink: ['Vínculo com a Vida', 'O dano que ela causa também faz o controlador dela ganhar essa quantidade de vida.'],
  haste: ['Ímpeto', 'Pode atacar e usar habilidades com {T} no turno em que entra.'],
  vigilance: ['Vigilância', 'Atacar não faz ela virar.'],
  menace: ['Ameaça', 'Só pode ser bloqueada por duas ou mais criaturas.'],
  'first strike': ['Iniciativa', 'Causa dano de combate antes das criaturas sem iniciativa.'],
  'double strike': ['Golpe Duplo', 'Causa dano de combate duas vezes: junto com as de iniciativa e depois, no dano normal.'],
  defender: ['Defensor', 'Não pode atacar.'],
  flash: ['Lampejo', 'Pode ser conjurada a qualquer momento em que você poderia conjurar uma mágica instantânea.'],
  indestructible: ['Indestrutível', 'Não é destruída por dano letal nem por efeitos que dizem "destrua".'],
  hexproof: ['Resistência a Magia', 'Não pode ser alvo de mágicas nem habilidades dos oponentes.'],
  shroud: ['Manto', 'Não pode ser alvo de mágicas nem habilidades, nem as suas.'],
  ward: ['Resguardo', 'Quando um oponente mira nela, a mágica ou habilidade é anulada a menos que ele pague o custo extra.'],
  protection: ['Proteção', 'Contra a qualidade indicada: não pode ser bloqueada, mirada, encantada/equipada nem receber dano dessas fontes.'],
  equip: ['Equipar', 'Pague o custo para prender este Equipamento a uma criatura sua. Só como feitiço.'],
  crew: ['Tripular', 'Vire criaturas suas com força total igual ou maior que N: este Veículo vira criatura até o fim do turno.'],
  cycling: ['Reciclar', 'Pague o custo e descarte a carta da mão para comprar uma carta.'],
  kicker: ['Reforço', 'Custo adicional opcional ao conjurar; pago, a mágica faz algo a mais.'],
  flashback: ['Recapitular', 'Pode ser conjurada do cemitério pagando o custo de recapitular; depois vai para o exílio.'],
  prowess: ['Destreza', 'Sempre que você conjura uma mágica que não é criatura, ela ganha +1/+1 até o fim do turno.'],
  convoke: ['Convocar', 'Cada criatura que você vira ao conjurar paga {1} ou uma mana da cor dela.'],
  cascade: ['Cascata', 'Ao conjurar, exile do topo até achar uma mágica de valor menor; você pode conjurá-la de graça.'],
  storm: ['Tempestade', 'Ao conjurar, copie esta mágica uma vez para cada mágica conjurada antes dela neste turno.'],
  partner: ['Parceiro', 'Pode ser um dos dois comandantes, se o outro também tiver parceiro.'],
  infect: ['Infectar', 'Dá dano a criaturas como marcadores -1/-1 e a jogadores como marcadores de veneno.'],
  toxic: ['Tóxico', 'Quando causa dano de combate a um jogador, ele também recebe N marcadores de veneno.'],
  annihilator: ['Aniquilador', 'Sempre que ataca, o jogador defensor sacrifica N permanentes.'],
  persist: ['Persistir', 'Quando morre sem marcador -1/-1, volta ao campo com um marcador -1/-1.'],
  undying: [null, 'Quando morre sem marcador +1/+1, volta ao campo com um marcador +1/+1.'],
  landfall: [null, 'Habilidade que dispara sempre que um terreno entra no campo sob o seu controle.'],
  scry: ['Vidência', 'Olhe as N cartas do topo; ponha quantas quiser no fundo e o resto no topo, na ordem que quiser.'],
  surveil: [null, 'Olhe as N cartas do topo; ponha quantas quiser no cemitério e o resto no topo.'],
  mill: [null, 'Ponha as N cartas do topo do grimório no cemitério.'],
  proliferate: ['Proliferar', 'Escolha permanentes e jogadores com marcadores e dê mais um de cada tipo que já têm.'],
  treasure: [null, 'Ficha de artefato: {T}, sacrifique: adicione uma mana de qualquer cor.'],
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function keywordHelp(keywords: readonly string[]): KeywordHelp[] {
  const seen = new Set<string>()
  return keywords.flatMap((kw) => {
    const key = kw.toLowerCase()
    const entry = K[key]
    if (!entry || seen.has(key)) return []
    seen.add(key)
    const [pt, help] = entry
    return [{ name: pt ? `${pt} (${titleCase(kw)})` : titleCase(kw), help }]
  })
}
