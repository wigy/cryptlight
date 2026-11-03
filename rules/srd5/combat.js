// Attack resolution for characters and monsters, including weapon mastery and class damage riders.
import { applyDamage, addCondition, addEffect, armorClass, attackModifiers, canAct, checkConcentration, d20, getEffect, hasEffect, isDown, mod, pb, removeEffect, roll } from './core.js';
import { CLASS_TABLE } from './data.js';

export const ROUND = 6; // Game seconds in a round.

export function isProficient(c, weapon) {
  if (c.kind !== 'pc') return true;
  if (weapon.training === 'simple') return true;
  if (c.martialWeapons) return true;
  const rule = c.weaponRule ?? '';
  if (/Finesse/.test(rule) && weapon.props.finesse) return true;
  if (/Light/.test(rule) && weapon.props.light) return true;
  return false;
}

const UNARMED = { id: 'unarmed', name: 'Unarmed Strike', kind: 'weapon', training: 'simple', style: 'melee', damage: { dice: '1', type: 'bludgeoning' }, props: {}, unarmed: true };
export const unarmedStrike = () => UNARMED;

export function usesMartialArts(c, weapon, srd) {
  if (c.classId !== 'monk' || c.equipment.armor) return false;
  const off = c.equipment.offHand && srd.items[c.equipment.offHand.proto];
  if (off?.kind === 'shield') return false;
  return weapon.unarmed || (weapon.style === 'melee' && (weapon.training === 'simple' || weapon.props.light));
}

/** Melee reach of a held weapon in feet. */
export const reachOf = (weapon) => (weapon?.props?.reach ? 10 : 5);
/** Max range in feet when using the weapon at range (long range included), or 0 when it can't be. */
export function rangeOf(weapon) {
  const p = weapon?.props;
  return p?.ammunition?.long ?? p?.thrown?.long ?? 0;
}

function attackAbility(c, weapon, { ranged, martialArts }) {
  if (martialArts || weapon.props.finesse) return mod(c, 'dex') > mod(c, 'str') ? 'dex' : 'str';
  return weapon.style === 'ranged' ? 'dex' : 'str';
}

/** All of the once-per-turn riders reset when `lastAt` is at least one round old. */
const available = (c, key, time) => (c.oncePerTurn?.[key] ?? -Infinity) <= time - ROUND + 0.001;
const spend = (c, key, time) => { (c.oncePerTurn ??= {})[key] = time; };

/**
 * A character's weapon attack.
 * @param ctx {{ game, attacker, target, weapon, item, ranged, feet, longRange, enemyAdjacent, isExtra?:boolean, noMod?:boolean, handsFree?:boolean }}
 * @returns {{hit, crit, damage, natural, total, ac, killed}}
 */
export function characterAttack(ctx) {
  const { game, attacker: a, target: t, weapon, ranged } = ctx;
  const { rng } = game;
  const srd = game.ruleset.srd;
  const time = game.time;
  const martialArts = usesMartialArts(a, weapon, srd);
  const ability = attackAbility(a, weapon, { ranged, martialArts });
  const abilityBonus = mod(a, ability);
  let bonus = abilityBonus + (isProficient(a, weapon) ? pb(a) : 0) + (weapon.bonus ?? 0);
  if (a.fightingStyle === 'archery' && ranged && weapon.style === 'ranged') bonus += 2;
  if (hasEffect(a, 'bless')) bonus += roll(rng, '1d4');
  if (hasEffect(a, 'bane')) bonus -= roll(rng, '1d4');

  const m = attackModifiers(a, t, { ranged, feet: ctx.feet, longRange: ctx.longRange, enemyAdjacent: ctx.enemyAdjacent });
  if (weapon.props.heavy && ((weapon.style === 'melee' && a.abilities.str < 13) || (weapon.style === 'ranged' && a.abilities.dex < 13))) m.disadvantage = true;
  if (game.ruleset.cannotSee?.(game, a)) m.disadvantage = true;
  if (armorUntrained(a, srd) && (ability === 'str' || ability === 'dex')) m.disadvantage = true;

  const r = d20(rng, a, { bonus, advantage: m.advantage, disadvantage: m.disadvantage });
  removeEffect(a, 'sapped'); removeEffect(a, 'vex'); removeEffect(a, 'mocked');
  removeEffect(t, 'guided');
  const ac = armorClass(t, srd);
  const mastery = a.weaponMasteries?.includes(weapon.id) ? weapon.mastery : null;
  const crit = r.natural === 20 || (m.autoCrit && r.natural !== 1);
  const hit = r.natural !== 1 && (r.natural === 20 || r.total >= ac);
  const out = { hit, crit: hit && crit, natural: r.natural, total: r.total, ac, damage: 0, killed: false, advantage: m.advantage && !m.disadvantage };

  if (!hit) {
    if (mastery === 'graze' && !ctx.isExtra && abilityBonus > 0) {
      const res = applyDamage(rng, t, abilityBonus, weapon.damage.type, { time });
      out.damage = res.dealt; out.killed = res.killed; out.graze = true;
    }
    return out;
  }

  // Damage dice.
  let dice = weapon.damage.dice;
  if (weapon.props.versatile && ctx.handsFree && !ranged) dice = weapon.props.versatile;
  if (martialArts) {
    const die = CLASS_TABLE.monk.martialDie;
    const sidesOf = (d) => Number(String(d).split('d')[1] ?? 1);
    if (sidesOf(die) > sidesOf(dice)) dice = die;
  }
  const savage = a.feat === 'savage-attacker' && !weapon.unarmed && available(a, 'savage', time);
  if (savage) spend(a, 'savage', time);
  let total = roll(rng, dice, { crit: out.crit, reroll: savage });
  // Great Weapon Fighting counts 1s and 2s as 3s; averaged here as +1 rather than tracking each die.
  if (a.fightingStyle === 'great-weapon' && weapon.style === 'melee' && (weapon.props.twoHanded || weapon.props.versatile)) total += 1;
  const addAbility = !ctx.isExtra || abilityBonus < 0 || a.fightingStyle === 'two-weapon';
  if (addAbility && !ctx.noMod) total += abilityBonus;
  else if (ctx.noMod && abilityBonus < 0) total += abilityBonus;
  total += weapon.bonus ?? 0;
  if (weapon.unarmed && !martialArts) total = Math.max(1, 1 + abilityBonus);
  if (hasEffect(a, 'rage') && ability === 'str' && !ranged) total += CLASS_TABLE.barbarian.rageDamage;

  // Sneak Attack: Advantage, or an enemy of the target within 5 feet of it, with a Finesse or Ranged weapon.
  let extra = 0;
  if (a.classId === 'rogue' && (weapon.props.finesse || weapon.style === 'ranged') && !m.disadvantage && available(a, 'sneak', time)) {
    const allyAdjacent = game.party.members.some((o) => o !== a && canAct(o) && game.feet(o, t) <= 5);
    if (m.advantage || allyAdjacent) {
      extra += roll(rng, CLASS_TABLE.rogue.sneak, { crit: out.crit });
      spend(a, 'sneak', time);
      out.sneak = true;
    }
  }
  const mark = getEffect(a, 'marking');
  if (mark && mark.target === t.uid) extra += roll(rng, mark.dice, { crit: out.crit });
  if (hasEffect(a, 'divine-favor')) extra += roll(rng, '1d4', { crit: out.crit });
  const smite = getEffect(a, 'smite');
  if (smite && weapon.style === 'melee') {
    extra += roll(rng, smite.dice, { crit: out.crit });
    if (t.type === 'undead' || t.type === 'fiend') extra += roll(rng, '1d8', { crit: out.crit });
    removeEffect(a, 'smite');
    out.smite = true;
  }

  const res = applyDamage(rng, t, Math.max(1, total) + extra, weapon.damage.type, { crit: out.crit, time });
  out.damage = res.dealt; out.killed = res.killed; out.saved = res.saved;
  if (!res.killed && !isDown(t) && mastery && !ctx.isExtra) applyMastery(game, a, t, weapon, mastery, out, abilityBonus);
  return out;
}

function armorUntrained(c, srd) {
  for (const slot of ['armor', 'offHand']) {
    const it = c.equipment[slot] && srd.items[c.equipment[slot].proto];
    if (it && (it.kind === 'armor' || it.kind === 'shield') && !c.armorTraining.includes(it.category)) return true;
  }
  return false;
}

/** Weapon Mastery properties (SRD "Equipment"). Cleave is resolved by the caller, which knows the crowd. */
function applyMastery(game, a, t, weapon, mastery, out, abilityBonus) {
  const time = game.time;
  switch (mastery) {
    case 'sap': addEffect(t, { id: 'sapped', until: time + ROUND }); out.mastery = 'sapped'; break;
    case 'vex': addEffect(a, { id: 'vex', target: t.uid, until: time + ROUND }); out.mastery = 'vexed'; break;
    case 'slow': addEffect(t, { id: 'slowed', until: time + ROUND }); out.mastery = 'slowed'; break;
    case 'push': if (game.pushFromParty?.(t)) out.mastery = 'pushed back'; break;
    case 'topple': {
      const dc = 8 + abilityBonus + pb(a);
      const save = game.ruleset.save(game, t, 'con', dc);
      if (!save.success && addCondition(t, 'prone')) out.mastery = 'knocked prone';
      break;
    }
    case 'cleave':
      if (available(a, 'cleave', time)) { spend(a, 'cleave', time); out.cleave = true; }
      break;
    default: break; // Graze applies on a miss; Nick changes the action cost of the Light attack.
  }
}

/** Parses "makes two Rend attacks" / "makes two attacks, using Scimitar or Shortbow in any combination". */
const WORD_COUNT = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
export function multiattackPlan(monster, wantRanged) {
  const entries = monster.actions ?? [];
  const usable = entries.filter((e) => e.attack);
  const pick = (names) => {
    const pool = names ? usable.filter((e) => names.includes(e.name.replace(/ \(.*$/, ''))) : usable;
    const ranged = pool.filter((e) => e.attack.range);
    const melee = pool.filter((e) => e.attack.reach);
    return (wantRanged ? ranged[0] : melee[0]) ?? null;
  };
  const multi = entries.find((e) => e.name === 'Multiattack');
  if (!multi) { const one = pick(); return one ? [one] : []; }
  const plan = [];
  for (const m of multi.text.matchAll(/\b(one|two|three|four|five|six) (?:([A-Z][\w’' ]*?) )?attacks?\b/g)) {
    const count = WORD_COUNT[m[1]];
    const named = m[2] ? pick([m[2].trim()]) : pick();
    if (named) for (let i = 0; i < count; i++) plan.push(named);
  }
  if (!plan.length) { const one = pick(); return one ? [one] : []; }
  return plan;
}

/** A monster's attack action from its parsed stat block. Damage comes straight from the SRD entry. */
export function monsterAttack(game, m, entry, target, { feet, ranged, longRange, enemyAdjacent }) {
  const { rng } = game;
  const srd = game.ruleset.srd;
  const am = attackModifiers(m, target, { ranged, feet, longRange, enemyAdjacent });
  const pack = (m.traits ?? []).some((t) => t.name === 'Pack Tactics');
  if (pack) {
    const friend = game.entities.some((o) => o !== m && o.level === m.level && !isDown(o) && canAct(o) && game.feet(o, target) <= 5);
    if (friend) am.advantage = true;
  }
  if (game.ruleset.cannotSee?.(game, target)) am.advantage = true;
  let bonus = entry.attack.bonus;
  if (hasEffect(m, 'bane')) bonus -= roll(rng, '1d4');
  if (hasEffect(m, 'bless')) bonus += roll(rng, '1d4');
  const r = d20(rng, m, { bonus, advantage: am.advantage, disadvantage: am.disadvantage });
  removeEffect(m, 'sapped'); removeEffect(m, 'mocked');
  const hadAdvantage = am.advantage && !am.disadvantage;
  const crit = r.natural === 20 || (am.autoCrit && r.natural !== 1);
  let ac = armorClass(target, srd);
  let hit = r.natural !== 1 && (r.natural === 20 || r.total >= ac);
  // The Shield spell is a Reaction taken after being hit.
  if (hit && r.natural !== 20 && game.ruleset.tryShieldReaction?.(game, target, r.total)) { ac = armorClass(target, srd); hit = r.total >= ac; }
  const out = { hit, crit: hit && crit, natural: r.natural, total: r.total, ac, dealt: 0, killed: false, droppedToZero: false };
  if (!hit) return out;
  for (const d of entry.damage ?? []) {
    if (d.onAdvantage && !hadAdvantage) continue;
    const res = applyDamage(rng, target, Math.max(0, roll(rng, d.dice, { crit: out.crit })), d.type, { crit: out.crit, time: game.time });
    out.dealt += res.dealt;
    out.killed ||= res.killed;
    out.droppedToZero ||= res.droppedToZero;
    out.saved ??= res.saved;
    if (checkConcentration(rng, target, res.dealt)) out.lostConcentration = true;
  }
  return out;
}
