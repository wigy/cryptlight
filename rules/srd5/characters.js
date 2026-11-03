// Character creation, advancement and rests.
import {
  ABILITIES, BACKGROUNDS, CLASS_SKILLS, CLASS_TABLE, DEFAULT_MASTERIES, SPECIES, STANDARD_ARRAY, STARTING_GEAR, XP_TABLE, abilityMod,
} from './data.js';
import { DEFAULT_SPELLS, MAGIC_INITIATE } from './spells.js';
import { addCondition, mod, removeCondition, removeEffect, roll } from './core.js';

export const MAX_LEVEL = 2;
export const SLOTS = ['head', 'neck', 'armor', 'cloak', 'mainHand', 'offHand', 'ring', 'feet'];
export const PACK_SIZE = 16;

let uidCounter = 0;
export const newUid = (prefix) => `${prefix}${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

/** "javelin:8" -> an item instance. Item instances are all the engine stores; their stats live in the item tables. */
export function makeItem(spec) {
  const [proto, qty] = String(spec).split(':');
  const it = { uid: newUid('i'), proto };
  if (qty) it.qty = Number(qty);
  return it;
}

function armorTrainingFor(srdClass) {
  const t = srdClass.armorTraining;
  const out = [];
  for (const [word, id] of [['Light', 'light'], ['Medium', 'medium'], ['Heavy', 'heavy'], ['Shield', 'shield']]) if (t.includes(word)) out.push(id);
  return out;
}

/**
 * Applies a background's ability increases: +2 to the highest-priority listed ability, +1 to the next
 * (SRD: "Increase one by 2 and another one by 1"), choosing what most helps the class.
 */
function applyBackground(scores, bg, classId) {
  const order = [...bg.abilities].sort((a, b) => scores[b] - scores[a]);
  const primary = CLASS_TABLE[classId].ability;
  if (primary && bg.abilities.includes(primary)) order.unshift(...order.splice(order.indexOf(primary), 1));
  scores[order[0]] = Math.min(20, scores[order[0]] + 2);
  scores[order[1]] = Math.min(20, scores[order[1]] + 1);
}

export function createCharacter(srd, { name, classId, speciesId = 'human', backgroundId = 'soldier', fightingStyle }) {
  const cls = srd.classes[classId];
  const table = CLASS_TABLE[classId];
  const species = SPECIES[speciesId];
  const bg = BACKGROUNDS[backgroundId];
  if (!cls || !species || !bg) throw new Error(`unknown character option: ${classId}/${speciesId}/${backgroundId}`);

  const abilities = Object.fromEntries(ABILITIES.map((a, i) => [a, STANDARD_ARRAY[classId][i]]));
  applyBackground(abilities, bg, classId);

  const c = {
    kind: 'pc', uid: newUid('c'), name, classId, speciesId, backgroundId, level: 1, xp: 0, abilities,
    hitDie: cls.hitDie, saveProficiencies: [...cls.savingThrows],
    skills: [...new Set([...CLASS_SKILLS[classId], ...bg.skills, ...(species.skills ?? [])])],
    expertise: classId === 'rogue' ? ['stealth', 'perception'] : [],
    armorTraining: armorTrainingFor(cls),
    martialWeapons: /Martial weapons/.test(cls.weaponProficiencies),
    weaponRule: cls.weaponProficiencies,
    weaponMasteries: [...(DEFAULT_MASTERIES[classId] ?? [])],
    fightingStyle: classId === 'fighter' ? fightingStyle ?? 'defense' : undefined,
    feat: bg.feat, size: species.size, resistances: [...(species.resist ?? [])], darkvision: species.darkvision,
    tempHp: 0, conditions: [], effects: [], concentration: null, resources: {},
    equipment: Object.fromEntries(SLOTS.map((s) => [s, null])), pack: new Array(PACK_SIZE).fill(null),
    actionReadyAt: 0, bonusReadyAt: 0, reactionReadyAt: 0, death: { success: 0, fail: 0, stable: false },
    cantrips: [], prepared: [], slots: { max: 0, used: 0 }, inspiration: speciesId === 'human',
  };
  // Divine Order / Primal Order: the Protector and Warden options suit a front-line party member.
  if (classId === 'cleric') { c.armorTraining.push('heavy'); c.martialWeapons = true; c.order = 'protector'; }
  if (classId === 'druid') { c.armorTraining.push('medium'); c.martialWeapons = true; c.order = 'warden'; }

  c.maxHp = cls.hitDie + mod(c, 'con') + (species.hpPerLevel ?? 0); // Level 1: max Hit Die + Con modifier.
  c.hp = c.maxHp;
  c.hitDice = 1;

  const gear = STARTING_GEAR[classId];
  for (const slot of ['armor', 'mainHand', 'offHand']) if (gear[slot]) c.equipment[slot] = makeItem(gear[slot]);
  const packItems = [...gear.pack, ...bg.items.filter((id) => !gear.pack.some((g) => g.startsWith(id)) && !Object.values(gear).includes(id))];
  packItems.slice(0, PACK_SIZE).forEach((spec, i) => { c.pack[i] = makeItem(spec); });

  if (table.slots) {
    const spells = DEFAULT_SPELLS[classId];
    c.cantrips = spells.cantrips.slice(0, table.cantrips[0]);
    c.prepared = spells.prepared.slice(0, table.prepared[0]);
    c.slots = { max: table.slots[0], used: 0 };
  }
  const initiate = MAGIC_INITIATE[bg.feat];
  if (initiate) {
    c.cantrips.push(...initiate.cantrips.filter((s) => !c.cantrips.includes(s)));
    if (!c.prepared.includes(initiate.spell)) c.prepared.push(initiate.spell);
    c.freeSpell = { id: initiate.spell, used: false };
    c.initiateAbility = initiate.ability;
  }
  resetResources(c);
  return c;
}

/** Long-rest resource pools from the class tables. */
function resetResources(c) {
  const t = CLASS_TABLE[c.classId];
  const r = c.resources;
  if (t.rages) r.rage = t.rages[c.level - 1];
  if (t.secondWind) r.secondWind = t.secondWind[c.level - 1];
  if (c.classId === 'paladin') r.layOnHands = 5 * c.level;
  if (c.classId === 'bard') r.inspiration = Math.max(1, mod(c, 'cha'));
  if (c.classId === 'ranger') r.favoredEnemy = 2;
  if (c.classId === 'sorcerer') r.innateSorcery = 2;
  if (c.classId === 'wizard') r.arcaneRecovery = 1;
  if (c.classId === 'fighter' && c.level >= 2) r.actionSurge = 1;
  if (c.classId === 'cleric' && c.level >= 2) r.channelDivinity = 2;
  if (c.classId === 'monk' && c.level >= 2) r.focus = 2;
  if (c.speciesId === 'dragonborn') r.breath = 2;
}

export const xpForNextLevel = (c) => XP_TABLE[c.level] ?? Infinity;

/** Grants a level if earned, at the fixed Hit Die average (SRD: average rounded up). Returns true if levelled. */
export function maybeLevelUp(c) {
  if (c.dead || c.level >= MAX_LEVEL || c.xp < xpForNextLevel(c)) return false;
  c.level += 1;
  const gain = Math.max(1, Math.floor(c.hitDie / 2) + 1 + mod(c, 'con') + (SPECIES[c.speciesId].hpPerLevel ?? 0));
  c.maxHp += gain;
  if (c.hp > 0) c.hp += gain;
  c.hitDice += 1;
  const t = CLASS_TABLE[c.classId];
  if (t.slots) {
    c.slots.max = t.slots[c.level - 1];
    const known = DEFAULT_SPELLS[c.classId].prepared.slice(0, t.prepared[c.level - 1]);
    for (const id of known) if (!c.prepared.includes(id)) c.prepared.push(id);
  }
  resetResources(c);
  return true;
}

export function shortRest(rng, c) {
  if (c.dead) return 0;
  let healed = 0;
  if (c.hp > 0) {
    while (c.hitDice > 0 && c.hp < c.maxHp) {
      c.hitDice -= 1;
      const gained = Math.max(1, roll(rng, `1d${c.hitDie}`) + mod(c, 'con'));
      const before = c.hp;
      c.hp = Math.min(c.maxHp, c.hp + gained);
      healed += c.hp - before;
    }
  }
  if (c.classId === 'warlock') c.slots.used = 0; // Pact Magic returns on a Short Rest.
  if (c.classId === 'wizard' && c.resources.arcaneRecovery > 0 && c.slots.used > 0) { c.slots.used -= 1; c.resources.arcaneRecovery = 0; }
  if (c.classId === 'barbarian') c.resources.rage = Math.min(CLASS_TABLE.barbarian.rages[c.level - 1], c.resources.rage + 1);
  if (c.classId === 'fighter') {
    c.resources.secondWind = Math.min(CLASS_TABLE.fighter.secondWind[c.level - 1], c.resources.secondWind + 1);
    if (c.level >= 2) c.resources.actionSurge = 1;
  }
  if (c.classId === 'cleric' && c.level >= 2) c.resources.channelDivinity = Math.min(2, c.resources.channelDivinity + 1);
  if (c.classId === 'monk' && c.level >= 2) c.resources.focus = 2;
  return healed;
}

export function longRest(c) {
  if (c.dead) return;
  c.hp = c.maxHp;
  c.tempHp = 0;
  c.hitDice = Math.min(c.level, c.hitDice + c.level); // All spent Hit Dice return (SRD 5.2).
  c.slots.used = 0;
  c.death = { success: 0, fail: 0, stable: false };
  if (c.freeSpell) c.freeSpell.used = false;
  c.relentlessUsed = false;
  if (c.speciesId === 'human') c.inspiration = true;
  c.concentration = null;
  c.effects = [];
  for (const id of ['unconscious', 'prone', 'poisoned', 'paralyzed', 'frightened']) removeCondition(c, id);
  const ex = c.conditions.find((x) => x.id === 'exhaustion');
  if (ex) { ex.level -= 1; if (ex.level <= 0) removeCondition(c, 'exhaustion'); }
  removeEffect(c, 'rage');
  resetResources(c);
}

export { abilityMod, addCondition };
