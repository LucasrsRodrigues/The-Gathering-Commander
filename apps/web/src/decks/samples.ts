// Sample mono-color decks for quick games. Only card names (facts) live here; data and images
// come from Scryfall at runtime. Basics fill the deck up to 99 + commander.

const STAPLES = [
  'Sol Ring', 'Arcane Signet', 'Mind Stone', 'Fellwar Stone', "Commander's Sphere", 'Thought Vessel',
  'Lightning Greaves', 'Swiftfoot Boots', 'Skullclamp', "Wayfarer's Bauble", 'Burnished Hart', 'Solemn Simulacrum',
  'Reliquary Tower', "Rogue's Passage", 'Myriad Landscape', 'Path of Ancestry',
]

interface Sample {
  id: string
  title: string
  commander: string
  basic: string
  cards: string[]
}

export const SAMPLE_DECKS: Sample[] = [
  {
    id: 'elfos', title: 'Elfos (verde)', commander: 'Ezuri, Renegade Leader', basic: 'Forest',
    cards: [
      'Llanowar Elves', 'Elvish Mystic', 'Fyndhorn Elves', 'Priest of Titania', 'Elvish Archdruid', 'Elvish Visionary',
      'Imperious Perfect', 'Elvish Warmaster', 'Wood Elves', 'Sakura-Tribe Elder', 'Eternal Witness', 'Reclamation Sage',
      'Beast Whisperer', 'Craterhoof Behemoth', 'Avenger of Zendikar', 'Oracle of Mul Daya', 'Birds of Paradise',
      'Joraga Treespeaker', 'Heritage Druid', 'Nettle Sentinel', 'Wirewood Symbiote', 'Elvish Harbinger',
      "Dwynen's Elite", 'Marwyn, the Nurturer', 'Steel Leaf Champion', 'Lys Alana Huntmaster', 'Timberwatch Elf',
      'Elvish Clancaller', 'Selvala, Heart of the Wilds', "Ezuri's Predation", 'Beast Within', "Nature's Lore",
      'Three Visits', 'Cultivate', "Kodama's Reach", 'Rampant Growth', 'Farseek', 'Harmonize',
      'Return of the Wildspeaker', 'Overrun', 'Triumph of the Hordes', 'Heroic Intervention', 'Sylvan Library',
      'Doubling Season', 'Parallel Lives', 'Guardian Project', "Rishkar's Expertise",
    ],
  },
  {
    id: 'goblins', title: 'Goblins (vermelho)', commander: 'Krenko, Mob Boss', basic: 'Mountain',
    cards: [
      'Goblin Matron', 'Goblin Recruiter', 'Goblin Chieftain', 'Goblin King', 'Goblin Warchief', 'Goblin Rabblemaster',
      'Legion Warboss', 'Siege-Gang Commander', 'Beetleback Chief', 'Goblin Instigator', 'Mogg War Marshal',
      'Skirk Prospector', 'Goblin Bombardment', 'Impact Tremors', 'Purphoros, God of the Forge', 'Shared Animosity',
      'Goblin Lackey', 'Muxus, Goblin Grandee', 'Krenko, Tin Street Kingpin', 'Battle Hymn', 'Lightning Bolt',
      'Chaos Warp', 'Blasphemous Act', 'Vandalblast', 'Faithless Looting', "Jeska's Will", 'Seething Song',
      'Goblin Ringleader', 'Conspicuous Snoop', 'Goblin Chainwhirler', 'Goblin Piledriver', 'Hellrider', 'Coat of Arms',
      'Pashalik Mons', 'Goblin Trashmaster', 'Goblin Rally', 'Brightstone Ritual', 'Hordeling Outburst',
      "Krenko's Command", 'Dragon Fodder', 'Goblin Sharpshooter', 'Mogg Fanatic', 'Goblin Guide', 'Tuktuk Scrapper',
      'Goblin Settler', 'Goblin Goon', 'Reckless Bushwhacker',
    ],
  },
  {
    id: 'magias', title: 'Magias (azul)', commander: 'Talrand, Sky Summoner', basic: 'Island',
    cards: [
      'Ponder', 'Preordain', 'Brainstorm', 'Opt', 'Consider', 'Counterspell', 'Arcane Denial', 'Negate', 'Swan Song',
      'Mana Leak', 'Delay', 'Cyclonic Rift', 'Rhystic Study', 'Mystic Remora', 'Frantic Search', 'Gitaxian Probe',
      'Mystic Sanctuary', 'Snapcaster Mage', 'Archmage Emeritus', 'Murmuring Mystic', 'Metallurgic Summonings',
      "Jace's Erasure", 'Reality Shift', 'Pongify', 'Rapid Hybridization', 'Capsize', 'Fact or Fiction',
      'Dig Through Time', 'Treasure Cruise', 'Impulse', 'Turnabout', 'High Tide', 'Think Twice', 'Deep Analysis',
      'Chart a Course', 'Into the Roil', 'Repeal', 'Blink of an Eye', 'Echoing Truth', 'Paradoxical Outcome',
      'Sea Gate Oracle', 'Baral, Chief of Compliance', 'Mystical Tutor', 'Words of Wisdom', 'Vedalken Shackles',
      'Font of Mythos', 'Thing in the Ice',
    ],
  },
  {
    id: 'sangue', title: 'Sacrifício (preto)', commander: "K'rrik, Son of Yawgmoth", basic: 'Swamp',
    cards: [
      'Dark Ritual', 'Cabal Ritual', 'Vampiric Tutor', 'Demonic Tutor', 'Toxic Deluge', 'Damnation', 'Feed the Swarm',
      'Snuff Out', 'Dismember', 'Sign in Blood', "Night's Whisper", 'Read the Bones', 'Phyrexian Arena',
      'Necropotence', "Bolas's Citadel", 'Gray Merchant of Asphodel', 'Erebos, God of the Dead', 'Exsanguinate',
      'Torment of Hailfire', 'Sheoldred, the Apocalypse', 'Vilis, Broker of Blood', 'Fleshbag Marauder',
      'Plaguecrafter', 'Grave Pact', 'Dictate of Erebos', 'Reanimate', 'Animate Dead', 'Victimize', 'Living Death',
      'Black Market Connections', 'Ophiomancer', 'Zulaport Cutthroat', 'Blood Artist', 'Bloodghast', 'Gravecrawler',
      'Carrion Feeder', 'Village Rites', 'Deadly Rollick', 'Infernal Grasp', 'Go for the Throat', 'Doom Blade',
      'Whip of Erebos', 'Massacre Wurm', 'Graveborn Muse', 'Cabal Coffers', 'Urborg, Tomb of Yawgmoth',
    ],
  },
]

export function sampleDecklist(id: string): string {
  const sample = SAMPLE_DECKS.find((s) => s.id === id)
  if (!sample) return ''
  const nonBasics = [...STAPLES, ...sample.cards]
  const basics = Math.max(0, 99 - nonBasics.length)
  return ['Commander', `1 ${sample.commander}`, '', 'Deck', ...nonBasics.map((n) => `1 ${n}`), `${basics} ${sample.basic}`].join('\n')
}
