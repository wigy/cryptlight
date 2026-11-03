// Spell behaviours. Names, ranges, components, dice and descriptions all come from data/srd/spells.json;
// this table only says how each spell maps onto the real-time game. Spells without an entry here are
// in the data but aren't castable yet.
export const SPELL_FX = {
  // Cantrips
  'fire-bolt': { mode: 'attack', color: 11 },
  'ray-of-frost': { mode: 'attack', color: 15, onHit: { effect: 'slowed', rounds: 1 } },
  'chill-touch': { mode: 'attack', melee: true, color: 13 },
  'shocking-grasp': { mode: 'attack', melee: true, color: 9 },
  'starry-wisp': { mode: 'attack', color: 9 },
  'produce-flame': { mode: 'attack', color: 11, rangeOverride: 60 },
  'eldritch-blast': { mode: 'attack', color: 15 },
  'poison-spray': { mode: 'attack', color: 13 },
  'sorcerous-burst': { mode: 'attack', color: 11, dice: '1d8', type: 'fire' },
  'sacred-flame': { mode: 'save', color: 9 },
  'vicious-mockery': { mode: 'save', color: 15, onFail: { effect: 'mocked', rounds: 1 } },
  'acid-splash': { mode: 'save', color: 13, radiusFeet: 5 },
  light: { mode: 'light' },
  'spare-the-dying': { mode: 'stabilize' },
  // Level 1
  'magic-missile': { mode: 'auto', count: 3, color: 15 },
  'guiding-bolt': { mode: 'attack', color: 9, onHit: { effect: 'guided', rounds: 1 } },
  'chromatic-orb': { mode: 'attack', color: 11, dice: '3d8', type: 'fire' },
  'ray-of-sickness': { mode: 'attack', color: 13, onHit: { condition: 'poisoned', rounds: 1 } },
  'inflict-wounds': { mode: 'save', color: 10, half: true },
  'burning-hands': { mode: 'save', color: 11, half: true, cone: true, rangeOverride: 15 },
  thunderwave: { mode: 'save', color: 15, half: true, cone: true, rangeOverride: 15, push: true },
  'dissonant-whispers': { mode: 'save', color: 15, half: true },
  'cure-wounds': { mode: 'heal', ally: true, touch: true, dice: '2d8' },
  'healing-word': { mode: 'heal', dice: '2d4', ally: true, bonus: true },
  bless: { mode: 'party', effect: 'bless', rounds: 10, maxTargets: 3, concentration: true },
  'shield-of-faith': { mode: 'ally', effect: 'shield-of-faith', rounds: 100, concentration: true, bonus: true },
  'mage-armor': { mode: 'ally', effect: 'mage-armor', rounds: 4800 },
  'false-life': { mode: 'selfTemp', dice: '2d4+4' },
  heroism: { mode: 'ally', effect: 'heroism', rounds: 10, concentration: true, tempFromMod: true },
  'divine-favor': { mode: 'self', effect: 'divine-favor', rounds: 10, bonus: true },
  shield: { mode: 'reaction' },
  'hunters-mark': { mode: 'mark', dice: '1d6', bonus: true, concentration: true },
  hex: { mode: 'mark', dice: '1d6', bonus: true, concentration: true },
  'divine-smite': { mode: 'smite', dice: '2d8', bonus: true },
  bane: { mode: 'saveDebuff', ability: 'cha', effect: 'bane', rounds: 10, concentration: true, maxTargets: 3 },
  'faerie-fire': { mode: 'saveDebuff', ability: 'dex', effect: 'faerie-fire', rounds: 10, concentration: true, maxTargets: 4 },
  entangle: { mode: 'saveDebuff', ability: 'str', condition: 'restrained', rounds: 10, concentration: true, maxTargets: 4 },
  sleep: { mode: 'saveDebuff', ability: 'wis', condition: 'incapacitated', rounds: 10, concentration: true, maxTargets: 4, sleeping: true },
  'hideous-laughter': { mode: 'saveDebuff', ability: 'wis', condition: 'incapacitated', rounds: 10, concentration: true, maxTargets: 1 },
  command: { mode: 'saveDebuff', ability: 'wis', condition: 'prone', rounds: 1, maxTargets: 1 },
};

/** Recommended picks per class, using spells that have behaviours above. */
export const DEFAULT_SPELLS = {
  bard: { cantrips: ['vicious-mockery', 'starry-wisp'], prepared: ['healing-word', 'dissonant-whispers', 'sleep', 'faerie-fire', 'cure-wounds'] },
  cleric: { cantrips: ['sacred-flame', 'light', 'spare-the-dying'], prepared: ['cure-wounds', 'bless', 'guiding-bolt', 'healing-word', 'shield-of-faith'] },
  druid: { cantrips: ['produce-flame', 'starry-wisp'], prepared: ['cure-wounds', 'healing-word', 'entangle', 'faerie-fire', 'thunderwave'] },
  paladin: { cantrips: [], prepared: ['cure-wounds', 'bless', 'divine-smite'] },
  ranger: { cantrips: [], prepared: ['cure-wounds', 'entangle', 'hunters-mark'] },
  sorcerer: { cantrips: ['fire-bolt', 'ray-of-frost', 'shocking-grasp', 'light'], prepared: ['magic-missile', 'shield', 'burning-hands', 'sleep'] },
  warlock: { cantrips: ['eldritch-blast', 'chill-touch'], prepared: ['hex', 'bane', 'hideous-laughter'] },
  wizard: { cantrips: ['fire-bolt', 'ray-of-frost', 'light'], prepared: ['magic-missile', 'sleep', 'mage-armor', 'shield', 'burning-hands'] },
};

/** Magic Initiate (from a background): two cantrips, one level 1 spell castable once per Long Rest. */
export const MAGIC_INITIATE = {
  'magic-initiate-cleric': { ability: 'wis', cantrips: ['sacred-flame', 'spare-the-dying'], spell: 'cure-wounds' },
  'magic-initiate-wizard': { ability: 'int', cantrips: ['fire-bolt', 'light'], spell: 'magic-missile' },
};
