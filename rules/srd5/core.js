// Creature-level rules: dice, D20 Tests, Armor Class, conditions, damage.
// A "creature" is a plain serializable object: a character (kind:'pc') or a monster (kind:'monster').
import { abilityMod, proficiencyBonus, SKILLS, SPECIES } from './data.js';

/**
 * Rolls dice notation such as "2d6+3" or "1d4-1" or "5". `crit` doubles the dice, not the modifier.
 * Returns the dice as thrown: `die` ("2d6" on that crit, null without dice), the `values` that count, `flat` and `total`.
 */
export function rollDice(rng, notation, { crit = false, reroll = false } = {}) {
  const m = String(notation).replace(/\s/g, '').match(/^(?:(\d+)d(\d+))?([+-]\d+|\d+)?$/);
  if (!m) throw new Error(`bad dice: ${notation}`);
  const count = (Number(m[1]) || 0) * (crit ? 2 : 1);
  const sides = Number(m[2]) || 0;
  const flat = Number(m[3]) || 0;
  const once = () => Array.from({ length: count }, () => rng.int(1, sides));
  const sum = (list) => list.reduce((t, v) => t + v, 0);
  let values = once();
  if (reroll) { const again = once(); if (sum(again) > sum(values)) values = again; }
  return { die: count ? `${count}d${sides}` : null, values, flat, total: sum(values) + flat };
}
export const roll = (rng, notation, opts) => rollDice(rng, notation, opts).total;

export const mod = (c, ability) => abilityMod(c.abilities[ability] ?? 10);
export const pb = (c) => (c.kind === 'pc' ? proficiencyBonus(c.level) : c.pb ?? 2);
export const hasCondition = (c, id) => (c.conditions ?? []).some((x) => x.id === id);
export const hasEffect = (c, id) => (c.effects ?? []).some((x) => x.id === id);
export const getEffect = (c, id) => (c.effects ?? []).find((x) => x.id === id);

/** Conditions that imply Incapacitated (SRD Rules Glossary). */
const INCAPACITATING = new Set(['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']);
export const isIncapacitated = (c) => (c.conditions ?? []).some((x) => INCAPACITATING.has(x.id));
export const isDown = (c) => c.dead || c.hp <= 0;
export const canAct = (c) => !isDown(c) && !isIncapacitated(c);
export const exhaustion = (c) => (c.conditions ?? []).find((x) => x.id === 'exhaustion')?.level ?? 0;

export function addCondition(c, id, { until = null, source = null, level = 1, saveEnds = null } = {}) {
  if (c.conditionImmunities?.includes(id)) return false;
  c.conditions ??= [];
  const found = c.conditions.find((x) => x.id === id);
  if (id === 'exhaustion') {
    if (found) found.level += level; else c.conditions.push({ id, level });
    return true;
  }
  if (found) { if (until === null || (found.until !== null && until > found.until)) found.until = until; return true; }
  c.conditions.push({ id, until, source, saveEnds });
  return true;
}
export const removeCondition = (c, id) => { c.conditions = (c.conditions ?? []).filter((x) => x.id !== id); };

export function addEffect(c, effect) {
  c.effects ??= [];
  c.effects = c.effects.filter((x) => x.id !== effect.id);
  c.effects.push(effect);
}
export const removeEffect = (c, id) => { c.effects = (c.effects ?? []).filter((x) => x.id !== id); };

// ------------------------------------------------------------------- armor
/**
 * SRD Cover from the share of sight lines a wall or shut door blocks: Half Cover (+2) when one or two of
 * the four are blocked, Three-Quarters Cover (+5) when three or more are. It adds to AC and Dexterity saves.
 * Total Cover needs no number: without a line of sight (centre to centre) there is no attack at all.
 */
export const coverBonus = (fraction) => (fraction >= 0.75 ? 5 : fraction > 0 ? 2 : 0);
export const coverName = (bonus) => (bonus >= 5 ? 'three-quarters cover' : bonus > 0 ? 'half cover' : '');
export function armorClass(c, srd) {
  if (c.kind !== 'pc') return c.ac + (hasEffect(c, 'shield-of-faith') ? 2 : 0);
  const armor = c.equipment.armor && srd.items[c.equipment.armor.proto];
  const off = c.equipment.offHand && srd.items[c.equipment.offHand.proto];
  const shield = off?.kind === 'shield';
  const dex = mod(c, 'dex');
  let ac = 10 + dex;
  if (armor?.kind === 'armor') {
    ac = armor.ac + (armor.dex ? Math.min(dex, armor.dexMax ?? 99) : 0) + (c.equipment.armor.bonus ?? 0);
    if (c.fightingStyle === 'defense') ac += 1;
  } else {
    if (hasEffect(c, 'mage-armor')) ac = Math.max(ac, 13 + dex);
    if (c.classId === 'barbarian') ac = Math.max(ac, 10 + dex + mod(c, 'con'));
    if (c.classId === 'monk' && !shield) ac = Math.max(ac, 10 + dex + mod(c, 'wis'));
  }
  if (shield) ac += off.ac;
  if (hasEffect(c, 'shield-of-faith')) ac += 2;
  if (hasEffect(c, 'shield-spell')) ac += 5;
  return ac;
}

/** True if the character wears armor or a shield it isn't trained with (SRD "Armor Training"). */
export function lacksArmorTraining(c, srd) {
  if (c.kind !== 'pc') return false;
  for (const slot of ['armor', 'offHand']) {
    const it = c.equipment[slot] && srd.items[c.equipment[slot].proto];
    if (it && (it.kind === 'armor' || it.kind === 'shield') && !c.armorTraining.includes(it.category)) return true;
  }
  return false;
}

export function speedOf(c, srd) {
  if (c.kind !== 'pc') return Math.max(c.speed?.walk ?? 0, c.speed?.fly ?? 0, c.speed?.climb ?? 0);
  let speed = SPECIES[c.speciesId]?.speed ?? 30;
  const armor = c.equipment.armor && srd.items[c.equipment.armor.proto];
  if (armor?.strength && c.abilities.str < armor.strength) speed -= 10;
  return Math.max(0, speed - 5 * exhaustion(c));
}

// ------------------------------------------------------------------- d20 tests
/**
 * Rolls a D20 Test. Advantage and Disadvantage cancel when both apply (SRD).
 * Returns the raw die as `natural`, the adjusted result as `total`, and in `values` every die thrown.
 */
export function d20(rng, c, { bonus = 0, advantage = false, disadvantage = false } = {}) {
  const lucky = c?.kind === 'pc' && SPECIES[c.speciesId]?.lucky;
  const one = () => { const r = rng.int(1, 20); return r === 1 && lucky ? rng.int(1, 20) : r; };
  const values = [one()];
  if (advantage !== disadvantage) values.push(one());
  const natural = advantage ? Math.max(...values) : Math.min(...values);
  return { natural, values, keep: values.length > 1 ? (advantage ? 'high' : 'low') : null, total: natural + bonus - 2 * exhaustion(c ?? {}) };
}

export function savingThrow(rng, c, ability, dc, { advantage = false, disadvantage = false, cover = 0 } = {}) {
  if ((ability === 'str' || ability === 'dex') && (hasCondition(c, 'paralyzed') || hasCondition(c, 'stunned') || hasCondition(c, 'unconscious') || hasCondition(c, 'petrified'))) {
    return { success: false, total: 0, natural: 0, auto: true };
  }
  let bonus;
  if (c.kind === 'pc') bonus = mod(c, ability) + (c.saveProficiencies.includes(ability) ? pb(c) : 0);
  else bonus = c.saves?.[ability] ?? mod(c, ability);
  if (hasEffect(c, 'bless')) bonus += roll(rng, '1d4');
  if (hasEffect(c, 'bane')) bonus -= roll(rng, '1d4');
  if (ability === 'dex') bonus += cover;
  const gnome = c.kind === 'pc' && SPECIES[c.speciesId]?.mentalSaveAdvantage && ['int', 'wis', 'cha'].includes(ability);
  const rageStr = ability === 'str' && hasEffect(c, 'rage');
  const r = d20(rng, c, {
    bonus,
    advantage: advantage || gnome || rageStr,
    disadvantage: disadvantage || (ability === 'dex' && hasCondition(c, 'restrained')),
  });
  return { ...r, success: r.total >= dc };
}

export function skillBonus(c, skill) {
  if (c.kind !== 'pc') return c.skills?.[skill] ?? mod(c, SKILLS[skill]);
  let b = mod(c, SKILLS[skill]);
  if (c.skills.includes(skill)) b += pb(c);
  if (c.expertise?.includes(skill)) b += pb(c);
  return b;
}
export const passivePerception = (c) => (c.kind === 'pc' ? 10 + skillBonus(c, 'perception') : c.passivePerception ?? 10);

/**
 * Advantage state of an attack roll from the conditions of both sides.
 * @param {{ ranged:boolean, feet:number, longRange?:boolean, enemyAdjacent?:boolean }} ctx
 */
export function attackModifiers(attacker, target, ctx) {
  let advantage = false, disadvantage = false;
  const has = (c, id) => hasCondition(c, id);
  if (has(attacker, 'blinded') || has(attacker, 'frightened') || has(attacker, 'poisoned') || has(attacker, 'prone') || has(attacker, 'restrained')) disadvantage = true;
  if (has(attacker, 'invisible')) advantage = true;
  if (hasEffect(attacker, 'sapped')) disadvantage = true;
  if (hasEffect(attacker, 'mocked')) disadvantage = true;
  if (hasEffect(attacker, 'dread')) disadvantage = true;
  if (hasEffect(attacker, 'reckless')) advantage = true;
  if (hasEffect(target, 'unaware')) advantage = true;
  if (has(target, 'blinded') || has(target, 'paralyzed') || has(target, 'petrified') || has(target, 'restrained') || has(target, 'stunned') || has(target, 'unconscious')) advantage = true;
  if (has(target, 'invisible')) disadvantage = true;
  if (has(target, 'prone')) { if (ctx.feet <= 5) advantage = true; else disadvantage = true; }
  if (hasEffect(target, 'dodging') && !isIncapacitated(target)) disadvantage = true;
  if (hasEffect(target, 'reckless') || hasEffect(target, 'guided') || hasEffect(target, 'faerie-fire')) advantage = true;
  const vex = getEffect(attacker, 'vex');
  if (vex && vex.target === target.uid) advantage = true;
  if (ctx.ranged && ctx.longRange) disadvantage = true;
  if (ctx.ranged && ctx.enemyAdjacent) disadvantage = true;
  // Attacks against a Paralyzed or Unconscious creature within 5 feet are Critical Hits.
  const autoCrit = ctx.feet <= 5 && (has(target, 'paralyzed') || has(target, 'unconscious'));
  return { advantage, disadvantage, autoCrit };
}

// ------------------------------------------------------------------- damage
function adjustForDefenses(c, amount, type) {
  const list = (k) => c[k] ?? [];
  const physical = ['bludgeoning', 'piercing', 'slashing'].includes(type);
  if (list('damageImmunities').includes(type)) return 0;
  const raging = physical && hasEffect(c, 'rage');
  if (list('resistances').includes(type) || raging) amount = Math.floor(amount / 2);
  if (list('vulnerabilities').includes(type)) amount *= 2;
  return amount;
}

/**
 * Applies damage: defenses, Temporary HP, then HP; handles massive damage, Undead Fortitude,
 * Relentless Endurance and dropping to 0 HP. Returns the outcome for logging and concentration.
 */
export function applyDamage(rng, c, amount, type, { crit = false, time = 0 } = {}) {
  const dealt = adjustForDefenses(c, amount, type);
  let remaining = dealt;
  if (c.tempHp > 0) { const absorbed = Math.min(c.tempHp, remaining); c.tempHp -= absorbed; remaining -= absorbed; }
  const before = c.hp;
  const wasDown = before <= 0;
  c.hp -= remaining;
  const out = { dealt, killed: false, droppedToZero: false, saved: null };
  if (hasCondition(c, 'unconscious') && c.sleeping && remaining > 0) { removeCondition(c, 'unconscious'); c.sleeping = false; }
  if (c.hp > 0) return out;

  const overflow = -c.hp;
  c.hp = 0;
  if (c.kind === 'monster') {
    const fortitude = (c.traits ?? []).some((t) => t.name === 'Undead Fortitude');
    if (fortitude && !wasDown && type !== 'radiant' && !crit && savingThrow(rng, c, 'con', 5 + remaining).success) {
      c.hp = 1; out.saved = 'Undead Fortitude';
      return out;
    }
    c.dead = true; out.killed = true;
    return out;
  }
  if (wasDown) { // Damage at 0 HP: a death save failure, or two on a Critical Hit (SRD "Damage at 0 Hit Points").
    if (remaining > 0) {
      if (overflow >= c.maxHp) { c.dead = true; out.killed = true; return out; }
      c.death.stable = false;
      c.death.fail += crit ? 2 : 1;
      if (c.death.fail >= 3) { c.dead = true; out.killed = true; }
    }
    return out;
  }
  if (overflow >= c.maxHp) { c.dead = true; out.killed = true; return out; } // Instant death.
  if (SPECIES[c.speciesId]?.relentless && !c.relentlessUsed) { c.relentlessUsed = true; c.hp = 1; out.saved = 'Relentless Endurance'; return out; }
  out.droppedToZero = true;
  c.death = { success: 0, fail: 0, stable: false };
  addCondition(c, 'unconscious');
  addCondition(c, 'prone');
  for (const id of ['rage', 'dodging']) removeEffect(c, id);
  return out;
}

export function heal(c, amount) {
  if (c.dead || c.maxHp == null) return 0;
  const before = c.hp;
  c.hp = Math.min(c.maxHp, c.hp + amount);
  if (before <= 0 && c.hp > 0) {
    removeCondition(c, 'unconscious');
    c.death = { success: 0, fail: 0, stable: false };
  }
  return c.hp - before;
}

export const grantTempHp = (c, amount) => { c.tempHp = Math.max(c.tempHp ?? 0, amount); };

/** Concentration save after damage: DC 10 or half the damage (max 30). Returns true if lost. */
export function checkConcentration(rng, c, dealt) {
  if (!c.concentration || dealt <= 0) return false;
  const dc = Math.min(30, Math.max(10, Math.floor(dealt / 2)));
  return !savingThrow(rng, c, 'con', dc).success;
}
