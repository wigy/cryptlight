// Loads the extracted SRD JSON and adds the few tables the extractor doesn't parse.
// `readJson(name)` is injected so this works under both the browser and node.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const SKILLS = {
  acrobatics: 'dex', 'animal-handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int',
  insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', 'sleight-of-hand': 'dex', stealth: 'dex', survival: 'wis',
};
/** Character Advancement table (SRD "Character Creation"). */
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
/** XP Budget per Character (SRD "Combat Encounters"), by party level. */
export const XP_BUDGET = { 1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100] };

/** Standard Array by Class table, in str/dex/con/int/wis/cha order. */
export const STANDARD_ARRAY = {
  barbarian: [15, 13, 14, 10, 12, 8], bard: [8, 14, 12, 13, 10, 15], cleric: [14, 8, 13, 10, 15, 12], druid: [8, 12, 14, 13, 15, 10],
  fighter: [15, 14, 13, 8, 10, 12], monk: [12, 15, 13, 10, 14, 8], paladin: [15, 10, 13, 8, 12, 14], ranger: [12, 15, 13, 8, 14, 10],
  rogue: [12, 15, 13, 14, 10, 8], sorcerer: [10, 13, 14, 8, 12, 15], warlock: [8, 14, 13, 12, 10, 15], wizard: [8, 12, 13, 15, 14, 10],
};

/** Per-class data for levels 1-2 (class feature tables). This ruleset currently caps characters at level 2. */
export const CLASS_TABLE = {
  barbarian: { ability: null, masteries: 2, rages: [2, 2], rageDamage: 2 },
  bard: { ability: 'cha', cantrips: [2, 2], prepared: [4, 5], slots: [2, 3] },
  cleric: { ability: 'wis', cantrips: [3, 3], prepared: [4, 5], slots: [2, 3] },
  druid: { ability: 'wis', cantrips: [2, 2], prepared: [4, 5], slots: [2, 3] },
  fighter: { ability: null, masteries: 3, secondWind: [2, 2] },
  monk: { ability: null, martialDie: '1d6' },
  paladin: { ability: 'cha', masteries: 2, cantrips: [0, 0], prepared: [2, 3], slots: [2, 2] },
  ranger: { ability: 'wis', masteries: 2, cantrips: [0, 0], prepared: [2, 3], slots: [2, 2] },
  rogue: { ability: null, masteries: 2, sneak: '1d6' },
  sorcerer: { ability: 'cha', cantrips: [4, 4], prepared: [2, 4], slots: [2, 3] },
  warlock: { ability: 'cha', cantrips: [2, 2], prepared: [2, 3], slots: [1, 2] },
  wizard: { ability: 'int', cantrips: [3, 3], prepared: [4, 5], slots: [2, 3] },
};

/** Species traits with mechanical effects here; others are described in chapters.json. */
export const SPECIES = {
  human: { name: 'Human', speed: 30, darkvision: 0, size: 'Medium', notes: 'Heroic Inspiration after a Long Rest' },
  dwarf: { name: 'Dwarf', speed: 30, darkvision: 120, size: 'Medium', resist: ['poison'], hpPerLevel: 1, notes: 'Toughness, poison resistance' },
  elf: { name: 'Elf', speed: 30, darkvision: 60, size: 'Medium', notes: 'Keen Senses (Perception)', skills: ['perception'] },
  halfling: { name: 'Halfling', speed: 30, darkvision: 0, size: 'Small', lucky: true, notes: 'Luck: reroll natural 1s' },
  gnome: { name: 'Gnome', speed: 30, darkvision: 60, size: 'Small', mentalSaveAdvantage: true, notes: 'Advantage on Int/Wis/Cha saves' },
  orc: { name: 'Orc', speed: 30, darkvision: 120, size: 'Medium', relentless: true, notes: 'Relentless Endurance' },
  goliath: { name: 'Goliath', speed: 35, darkvision: 0, size: 'Medium', notes: 'Speed 35 ft.' },
  dragonborn: { name: 'Dragonborn', speed: 30, darkvision: 60, size: 'Medium', resist: ['fire'], breath: true, notes: 'Fire breath, fire resistance' },
  tiefling: { name: 'Tiefling', speed: 30, darkvision: 60, size: 'Medium', resist: ['fire'], notes: 'Fire resistance' },
};

/** Backgrounds. `feat` drives behaviour; `abilities` are the three the background may raise. */
export const BACKGROUNDS = {
  acolyte: { name: 'Acolyte', abilities: ['int', 'wis', 'cha'], skills: ['insight', 'religion'], feat: 'magic-initiate-cleric', items: ['holy-symbol'] },
  criminal: { name: 'Criminal', abilities: ['dex', 'con', 'int'], skills: ['sleight-of-hand', 'stealth'], feat: 'alert', items: ['thieves-tools', 'dagger'] },
  sage: { name: 'Sage', abilities: ['con', 'int', 'wis'], skills: ['arcana', 'history'], feat: 'magic-initiate-wizard', items: ['quarterstaff'] },
  soldier: { name: 'Soldier', abilities: ['str', 'dex', 'con'], skills: ['athletics', 'intimidation'], feat: 'savage-attacker', items: ['spear', 'healers-kit'] },
};

/** Default skill picks from each class's options, in preference order. */
export const CLASS_SKILLS = {
  barbarian: ['athletics', 'perception'], bard: ['persuasion', 'perception', 'stealth'], cleric: ['medicine', 'history'],
  druid: ['perception', 'nature'], fighter: ['athletics', 'perception'], monk: ['acrobatics', 'stealth'],
  paladin: ['athletics', 'medicine'], ranger: ['perception', 'stealth', 'survival'],
  rogue: ['stealth', 'perception', 'investigation', 'sleight-of-hand'], sorcerer: ['arcana', 'insight'], warlock: ['arcana', 'investigation'], wizard: ['arcana', 'investigation'],
};

/** Starting equipment option (A) from each class's Core Traits table, as item ids. */
export const STARTING_GEAR = {
  barbarian: { mainHand: 'greataxe', pack: ['handaxe:4', 'torch:2', 'rations:2'] },
  bard: { armor: 'leather-armor', mainHand: 'dagger', offHand: 'dagger', pack: ['torch:2', 'rations:2'] },
  cleric: { armor: 'chain-shirt', mainHand: 'mace', offHand: 'shield', pack: ['holy-symbol', 'torch:2', 'rations:2'] },
  druid: { armor: 'leather-armor', mainHand: 'sickle', offHand: 'shield', pack: ['quarterstaff', 'torch:2', 'rations:2'] },
  fighter: { armor: 'chain-mail', mainHand: 'greatsword', pack: ['flail', 'javelin:8', 'torch:2', 'rations:2'] },
  monk: { mainHand: 'spear', pack: ['dagger:5', 'torch:2', 'rations:2'] },
  paladin: { armor: 'chain-mail', mainHand: 'longsword', offHand: 'shield', pack: ['javelin:6', 'holy-symbol', 'torch:2', 'rations:2'] },
  ranger: { armor: 'studded-leather-armor', mainHand: 'longbow', pack: ['scimitar', 'shortsword', 'arrows:20', 'torch:2', 'rations:2'] },
  rogue: { armor: 'leather-armor', mainHand: 'shortsword', offHand: 'dagger', pack: ['dagger', 'shortbow', 'arrows:20', 'thieves-tools', 'torch:2', 'rations:2'] },
  sorcerer: { mainHand: 'spear', pack: ['dagger:2', 'torch:2', 'rations:2'] },
  warlock: { armor: 'leather-armor', mainHand: 'sickle', pack: ['dagger:2', 'torch:2', 'rations:2'] },
  wizard: { mainHand: 'quarterstaff', pack: ['dagger:2', 'spellbook', 'torch:2', 'rations:2'] },
};

/** Weapon-mastery picks, chosen from what STARTING_GEAR gives each class. */
export const DEFAULT_MASTERIES = {
  barbarian: ['greataxe', 'handaxe'], fighter: ['greatsword', 'longsword', 'flail'], paladin: ['longsword', 'javelin'],
  ranger: ['longbow', 'scimitar'], rogue: ['shortsword', 'dagger'],
};

/** Items the SRD lists in tables the extractor leaves as prose (ammunition and tools). */
const EXTRA_ITEMS = [
  { id: 'arrows', name: 'Arrows', kind: 'ammo', ammoType: 'arrow', weight: 0.05, cost: '1 GP/20', stackable: true },
  { id: 'bolts', name: 'Bolts', kind: 'ammo', ammoType: 'bolt', weight: 0.075, cost: '1 GP/20', stackable: true },
  { id: 'bullets', name: 'Bullets', kind: 'ammo', ammoType: 'bullet', weight: 0.075, cost: '4 CP/20', stackable: true },
  { id: 'needles', name: 'Needles', kind: 'ammo', ammoType: 'needle', weight: 0.02, cost: '1 GP/50', stackable: true },
  { id: 'thieves-tools', name: 'Thieves’ Tools', kind: 'gear', weight: 1, cost: '25 GP' },
  { id: 'holy-symbol', name: 'Holy Symbol', kind: 'gear', weight: 1, cost: '5 GP' },
  { id: 'spellbook', name: 'Spellbook', kind: 'gear', weight: 3, cost: '50 GP' },
  { id: 'healers-kit', name: 'Healer’s Kit', kind: 'gear', weight: 3, cost: '5 GP', charges: 10 },
  { id: 'gold', name: 'Gold Pieces', kind: 'coin', weight: 0.02, cost: '1 GP', stackable: true },
];
/** Items usable from the pack. Numbers come from their SRD descriptions (checked in test/srd-data.test.js). */
const ITEM_USE = {
  'potion-of-healing': { heal: '2d4+2', action: 'bonus' },
  rations: { eat: true },
};
const STACKABLE = new Set(['javelin', 'dagger', 'handaxe', 'dart', 'torch', 'rations', 'potion-of-healing']);

export async function loadSrd(readJson) {
  const [monsters, spells, magicItems, weapons, armor, gear, classes, conditions, attribution] = await Promise.all(
    ['monsters', 'spells', 'magic-items', 'weapons', 'armor', 'gear', 'classes', 'conditions', 'attribution'].map(readJson),
  );
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const items = {};
  for (const list of [magicItems.map((m) => ({ ...m, magicKind: m.kind, kind: 'magic' })), gear, EXTRA_ITEMS, armor, weapons]) {
    for (const it of list) items[it.id] = it;
  }
  for (const [id, use] of Object.entries(ITEM_USE)) if (items[id]) items[id] = { ...items[id], use };
  for (const id of STACKABLE) if (items[id]) items[id] = { ...items[id], stackable: true };
  return { monsters: byId(monsters), spells: byId(spells), items, classes: byId(classes), conditions: byId(conditions), attribution };
}

export const abilityMod = (score) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
