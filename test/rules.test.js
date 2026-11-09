// Rules behaviour, with fixed dice so each rule is exercised exactly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { addCondition, addEffect, applyDamage, armorClass, attackModifiers, d20, hasCondition, heal, roll, rollDice, savingThrow } from '../rules/srd5/core.js';
import { characterAttack, monsterAttack, multiattackPlan, usesMartialArts } from '../rules/srd5/combat.js';
import { createCharacter, longRest, makeItem, maybeLevelUp, shortRest } from '../rules/srd5/characters.js';
import { fakeRng, newGame, tick } from './helpers.mjs';

const R = (...v) => fakeRng(v);

test('dice notation, crits double dice but not the modifier', () => {
  assert.equal(roll(R(3, 4), '2d6+3'), 10);
  assert.equal(roll(R(1, 2, 3, 4), '2d6+3', { crit: true }), 13);
  assert.equal(roll(R(2), '1d4-1'), 1);
  assert.equal(roll(R(), '5'), 5);
});

test('advantage and disadvantage take best, worst, and cancel', () => {
  assert.equal(d20(R(5, 15), null, { advantage: true }).natural, 15);
  assert.equal(d20(R(5, 15), null, { disadvantage: true }).natural, 5);
  assert.equal(d20(R(5, 15), null, { advantage: true, disadvantage: true }).natural, 5);
});

test('character creation follows the standard array and class data', async () => {
  const { srd } = await newGame();
  const f = createCharacter(srd, { name: 'F', classId: 'fighter', speciesId: 'human', backgroundId: 'soldier' });
  // Fighter array 15/14/13 with Soldier (Str, Dex, Con): +2 to the highest, +1 to the next.
  assert.deepEqual([f.abilities.str, f.abilities.dex, f.abilities.con], [17, 15, 13]);
  assert.equal(f.maxHp, 10 + 1); // d10 max + Con +1.
  assert.equal(armorClass(f, srd), 17); // Chain Mail 16 + Defense 1.
  assert.deepEqual(f.saveProficiencies.sort(), ['con', 'str']);
  const dwarf = createCharacter(srd, { name: 'D', classId: 'fighter', speciesId: 'dwarf', backgroundId: 'soldier' });
  assert.equal(dwarf.maxHp, 12); // Dwarven Toughness adds 1.
  const w = createCharacter(srd, { name: 'W', classId: 'wizard', speciesId: 'elf', backgroundId: 'sage' });
  assert.equal(w.abilities.int, 17);
  assert.equal(w.slots.max, 2);
  assert.equal(w.prepared.length, 4);
  for (const classId of Object.keys(srd.classes)) {
    const c = createCharacter(srd, { name: 'X', classId, speciesId: 'human', backgroundId: 'sage' });
    assert.ok(c.maxHp > 0 && armorClass(c, srd) >= 10, classId);
  }
});

test('unarmored defense and armor rules', async () => {
  const { srd } = await newGame();
  const b = createCharacter(srd, { name: 'B', classId: 'barbarian', speciesId: 'human', backgroundId: 'soldier' });
  const dex = Math.floor((b.abilities.dex - 10) / 2), con = Math.floor((b.abilities.con - 10) / 2);
  assert.equal(armorClass(b, srd), 10 + dex + con);
  const m = createCharacter(srd, { name: 'M', classId: 'monk', speciesId: 'human', backgroundId: 'sage' });
  assert.equal(armorClass(m, srd), 10 + Math.floor((m.abilities.dex - 10) / 2) + Math.floor((m.abilities.wis - 10) / 2));
  m.equipment.offHand = makeItem('shield');
  assert.ok(!usesMartialArts(m, srd.items.spear, srd), 'a shield ends Martial Arts');
});

test('condition effects on attack rolls', () => {
  const a = { kind: 'monster', conditions: [], effects: [] }, t = { kind: 'pc', conditions: [], effects: [] };
  assert.deepEqual(attackModifiers(a, t, { feet: 5 }), { advantage: false, disadvantage: false, autoCrit: false });
  addCondition(t, 'prone');
  assert.equal(attackModifiers(a, t, { feet: 5 }).advantage, true);
  const far = attackModifiers(a, t, { feet: 30, ranged: true });
  assert.deepEqual([far.advantage, far.disadvantage], [false, true]);
  t.conditions = [];
  addCondition(t, 'unconscious');
  assert.equal(attackModifiers(a, t, { feet: 5 }).autoCrit, true);
  assert.equal(attackModifiers(a, t, { feet: 10 }).autoCrit, false);
  addCondition(a, 'poisoned');
  assert.equal(attackModifiers(a, t, { feet: 5 }).disadvantage, true);
});

test('damage: resistance, immunity, vulnerability, temp HP', () => {
  const c = () => ({ kind: 'monster', hp: 50, maxHp: 50, tempHp: 0, conditions: [], effects: [], resistances: ['fire'], damageImmunities: ['poison'], vulnerabilities: ['cold'] });
  let m = c(); assert.equal(applyDamage(R(), m, 10, 'fire').dealt, 5);
  m = c(); assert.equal(applyDamage(R(), m, 11, 'fire').dealt, 5); // Rounded down.
  m = c(); assert.equal(applyDamage(R(), m, 10, 'poison').dealt, 0);
  m = c(); assert.equal(applyDamage(R(), m, 10, 'cold').dealt, 20);
  m = c(); m.tempHp = 4; applyDamage(R(), m, 10, 'slashing'); assert.deepEqual([m.tempHp, m.hp], [0, 44]);
});

test('Undead Fortitude: saves unless radiant or a crit', () => {
  const z = () => ({ kind: 'monster', hp: 5, maxHp: 15, tempHp: 0, conditions: [], effects: [], saves: { con: 3 }, abilities: { con: 16 }, traits: [{ name: 'Undead Fortitude' }] });
  let m = z(); applyDamage(R(20), m, 6, 'slashing'); assert.deepEqual([m.hp, !!m.dead], [1, false]);
  m = z(); applyDamage(R(20), m, 6, 'radiant'); assert.equal(m.dead, true);
  m = z(); applyDamage(R(20), m, 6, 'slashing', { crit: true }); assert.equal(m.dead, true);
  m = z(); applyDamage(R(2), m, 6, 'slashing'); assert.equal(m.dead, true);
});

test('dropping to 0 HP, instant death, healing wakes, damage while down', async () => {
  const { srd } = await newGame();
  const make = () => createCharacter(srd, { name: 'C', classId: 'wizard', speciesId: 'human', backgroundId: 'sage' });
  let c = make();
  applyDamage(R(), c, c.maxHp, 'slashing');
  assert.equal(c.hp, 0);
  assert.ok(hasCondition(c, 'unconscious') && hasCondition(c, 'prone'));
  assert.ok(!c.dead);
  applyDamage(R(), c, 1, 'slashing');
  assert.equal(c.death.fail, 1);
  applyDamage(R(), c, 1, 'slashing', { crit: true });
  assert.equal(c.death.fail, 3);
  assert.equal(c.dead, true);
  c = make();
  applyDamage(R(), c, c.maxHp * 2, 'slashing'); // Remaining damage >= HP maximum.
  assert.equal(c.dead, true);
  c = make();
  applyDamage(R(), c, c.maxHp, 'slashing');
  heal(c, 3);
  assert.equal(c.hp, 3);
  assert.ok(!hasCondition(c, 'unconscious'));
  const orc = createCharacter(srd, { name: 'O', classId: 'fighter', speciesId: 'orc', backgroundId: 'soldier' });
  applyDamage(R(), orc, orc.maxHp, 'slashing');
  assert.equal(orc.hp, 1); // Relentless Endurance.
  applyDamage(R(), orc, 1, 'slashing');
  assert.equal(orc.hp, 0); // Once only.
});

test('saving throws use proficiency; paralyzed auto-fails Str/Dex', async () => {
  const { srd } = await newGame();
  const c = createCharacter(srd, { name: 'F', classId: 'fighter', speciesId: 'human', backgroundId: 'soldier' });
  assert.equal(savingThrow(R(5), c, 'str', 10).total, 5 + 3 + 2);
  assert.equal(savingThrow(R(5), c, 'wis', 10).total, 5 + 0);
  addCondition(c, 'paralyzed');
  assert.equal(savingThrow(R(20), c, 'dex', 5).success, false);
});

test('multiattack plans come from the stat block text', async () => {
  const { srd } = await newGame();
  const names = (id, ranged) => multiattackPlan(srd.monsters[id], ranged).map((e) => e.name);
  assert.deepEqual(names('goblin-boss', false), ['Scimitar', 'Scimitar']);
  assert.deepEqual(names('goblin-boss', true), ['Shortbow', 'Shortbow']);
  assert.deepEqual(names('ghoul', false), ['Bite', 'Bite']);
  assert.deepEqual(names('skeleton', false), ['Shortsword']);
  assert.deepEqual(names('giant-rat', false), ['Bite']);
});

function duel(game) {
  const [fighter] = game.party.members;
  const target = game.spawnMonster('goblin-warrior', game.party.x, game.party.y - 1, game.party.level, {});
  return { fighter, target };
}

test('weapon attacks: hit math, crits, nat 1, mastery, sneak attack', async () => {
  const { game, srd } = await newGame();
  const { fighter, target } = duel(game);
  const greatsword = srd.items.greatsword;
  const attack = (rng, extra = {}) => { game.rng = rng; return characterAttack({ game, attacker: fighter, target, weapon: greatsword, item: fighter.equipment.mainHand, ranged: false, feet: 5, handsFree: true, ...extra }); };
  fighter.abilities.str = 16; fighter.feat = null; fighter.fightingStyle = null;
  target.hp = target.maxHp = 200; target.effects = [];
  // Natural 1 always misses, natural 20 always hits and crits.
  assert.equal(attack(R(1)).hit, false);
  let r = attack(R(20, 1, 1, 1, 1));
  assert.ok(r.hit && r.crit);
  assert.equal(r.damage, 4 + 3); // Four dice at 1 each + Str 3.
  // To hit: Str +3, proficiency +2 vs AC 15.
  target.effects = [];
  assert.equal(attack(R(9)).hit, false);
  target.effects = [];
  assert.equal(attack(R(10, 3, 4)).hit, true);
  // Graze mastery: a miss still deals the ability modifier.
  target.effects = [];
  const before = target.hp;
  r = attack(R(2));
  assert.ok(r.graze);
  assert.equal(before - target.hp, 3);

  // Sneak Attack: needs Advantage or an ally next to the target, and a Finesse or Ranged weapon.
  const pip = game.party.members[1];
  pip.abilities.dex = 16;
  const sword = srd.items.shortsword;
  const stab = (rng) => { game.rng = rng; return characterAttack({ game, attacker: pip, target, weapon: sword, ranged: false, feet: 5 }); };
  game.feet = (a, b) => (a === fighter ? 5 : 5);
  target.effects = [];
  r = stab(R(15, 3, 6)); // Ally adjacent: 1d6 weapon + 1d6 sneak.
  assert.ok(r.sneak);
  game.time += 1;
  r = stab(R(15, 3, 6));
  assert.ok(!r.sneak, 'only once per turn');
});

test('monster attacks use parsed damage; advantage rider applies only with advantage', async () => {
  const { game, srd } = await newGame();
  const { fighter, target } = duel(game);
  fighter.hp = fighter.maxHp = 100;
  const scimitar = srd.monsters['goblin-warrior'].actions[0];
  game.rng = R(19, 3); // Hit; 1d6=3, +2.
  let r = monsterAttack(game, target, scimitar, fighter, { feet: 5, ranged: false });
  assert.equal(r.dealt, 5);
  addCondition(fighter, 'restrained'); // Gives the attacker Advantage.
  game.rng = R(19, 19, 3, 2);
  r = monsterAttack(game, target, scimitar, fighter, { feet: 5, ranged: false });
  assert.equal(r.dealt, 5 + 2);
});

test('rollDice reports the dice thrown, doubled on a crit, and the better set on a reroll', () => {
  assert.deepEqual(rollDice(R(3, 4), '2d6+3'), { die: '2d6', values: [3, 4], flat: 3, total: 10 });
  assert.equal(rollDice(R(1, 2, 3, 4), '2d6', { crit: true }).die, '4d6');
  assert.deepEqual(rollDice(R(1, 5), '1d8', { reroll: true }).values, [5]);
  assert.deepEqual(rollDice(R(), '5'), { die: null, values: [], flat: 5, total: 5 });
});

test('attacks write out the dice type and the result of every roll', async () => {
  const { game, srd } = await newGame();
  const { fighter, target } = duel(game);
  fighter.hp = fighter.maxHp = 100;
  fighter.abilities.str = 16; fighter.feat = null; fighter.fightingStyle = null;
  fighter.equipment.armor = null; fighter.equipment.offHand = null;
  const ac = armorClass(fighter, srd);
  const scimitar = srd.monsters['goblin-warrior'].actions[0];
  const bonus = scimitar.attack.bonus;
  const claw = (...dice) => { game.rng = R(...dice); return monsterAttack(game, target, scimitar, fighter, { feet: 5, ranged: false }).dice; };
  assert.equal(claw(19, 3), `d20(19) + ${bonus} = ${19 + bonus} vs AC ${ac}; 1d6(3) + 2 = 5`);
  assert.equal(claw(1), `d20(1) + ${bonus} = ${1 + bonus} vs AC ${ac}`, 'a miss has only the attack roll');
  assert.equal(claw(20, 3, 4), `d20(20) + ${bonus} = ${20 + bonus} vs AC ${ac}; 2d6(3,4) + 2 = 9`, 'a crit doubles the dice');
  addEffect(target, { id: 'bane' });
  assert.match(claw(2, 19, 3), new RegExp(`^d20\\(19\\) - 1d4\\(2\\) \\+ ${bonus} = ${19 - 2 + bonus} vs AC`), 'Bane shows its d4');

  // Str +3, proficiency +2 against a character's Advantage, then every damage die with the modifier last.
  target.hp = target.maxHp = 200; target.effects = [];
  const sword = srd.items.greatsword;
  addEffect(target, { id: 'guided' });
  game.rng = R(4, 15, 2, 6);
  const r = characterAttack({ game, attacker: fighter, target, weapon: sword, ranged: false, feet: 5, handsFree: true });
  assert.equal(r.dice, `d20(4,15 high) + 5 = 20 vs AC ${target.ac}; 2d6(2,6) + 3 = 11`);
  assert.equal(r.damage, 11);
});

test('a melee attack on the party shows one slash and one claw sound, however many attacks it makes', async () => {
  const { game, ruleset, srd } = await newGame();
  const { fighter, target } = duel(game);
  const sounds = [];
  game.listeners.sound = (n) => sounds.push(n);
  fighter.hp = fighter.maxHp = 100;
  const scimitar = srd.monsters['goblin-warrior'].actions[0];
  game.rng = R(19, 3, 19, 3);
  ruleset.resolveMonsterAttack(game, target, scimitar, fighter, { feet: 5, ranged: false });
  ruleset.resolveMonsterAttack(game, target, scimitar, fighter, { feet: 5, ranged: false });
  assert.equal(game.fx.filter((f) => f.kind === 'slash').length, 1);
  assert.equal(sounds.filter((n) => n === 'claw').length, 1);
  assert.match(game.logLines.at(-1).text, /^Goblin.* hits .* for 5\. d20\(19\)/);

  game.fx = []; sounds.length = 0;
  game.rng = R(19, 3);
  ruleset.resolveMonsterAttack(game, target, scimitar, fighter, { feet: 30, ranged: true });
  assert.equal(game.fx.filter((f) => f.kind === 'slash').length, 0, 'no claws at range');
  assert.deepEqual(sounds, ['throw']);
});

test('every monster is drawn with a sprite that has an attack pose', async () => {
  const { ruleset, srd } = await newGame();
  const index = JSON.parse(readFileSync(new URL('../assets/game/index.json', import.meta.url)));
  for (const [id, m] of Object.entries(srd.monsters)) {
    const { sprite } = ruleset.monsterInfo({ ...m, proto: id });
    assert.ok(index[`${sprite}-attack`], `${id} draws ${sprite}`);
  }
});

test('the Features screen lists species and class features by level, and what comes next', async () => {
  const { game, ruleset } = await newGame();
  const [brunna] = game.party.members; // Dwarf Fighter.
  const names = (g) => g.items.map((f) => f.name);
  let [species, cls] = ruleset.memberFeatures(game, brunna);
  assert.equal(species.title, 'Species: Dwarf');
  assert.deepEqual(names(species.groups[0]), ['Darkvision', 'Dwarven Resilience', 'Dwarven Toughness', 'Stonecunning']);
  assert.ok(species.groups[0].items.find((f) => f.name === 'Stonecunning').missing);
  assert.equal(cls.title, 'Class: Fighter');
  assert.deepEqual(cls.groups.map((g) => g.title), ['Level 1', 'Next: level 2 at 300 XP']);
  assert.deepEqual(names(cls.groups[0]), ['Fighting Style', 'Second Wind', 'Weapon Mastery']);
  assert.deepEqual(names(cls.groups[1]), ['Action Surge', 'Tactical Mind']);
  assert.equal(cls.groups[1].items[0].missing, false);
  assert.equal(cls.groups[1].items[1].missing, true);
  assert.equal(cls.groups[1].note, null);
  assert.ok(cls.groups[0].items[1].text.length > 20, 'features say what they do');

  // What the screen promises for the next level is what levelling gives.
  const hp = brunna.maxHp;
  const promised = Number(cls.groups[1].gains[0].match(/\d+/)[0]);
  brunna.xp = 300;
  assert.equal(maybeLevelUp(brunna), true);
  assert.equal(brunna.maxHp, hp + promised);

  // At the level cap level 3 is listed but flagged as out of reach.
  [, cls] = ruleset.memberFeatures(game, brunna);
  assert.deepEqual(cls.groups.map((g) => g.title), ['Level 1', 'Level 2', 'Next: level 3']);
  assert.deepEqual(names(cls.groups[2]), ['Fighter Subclass']);
  assert.match(cls.groups[2].note, /stop at level 2/);

  // A caster's next level names its slots and spells.
  const maren = game.party.members[2]; // Cleric.
  const gains = ruleset.memberFeatures(game, maren)[1].groups.at(-1).gains.join(', ');
  assert.match(gains, /spell slots 2 to 3/);
  assert.match(gains, /new spell: /);
});

test('Pack Tactics grants advantage only with an ally adjacent', async () => {
  const { game, srd } = await newGame();
  const [fighter] = game.party.members;
  const rat = game.spawnMonster('giant-rat', game.party.x, game.party.y - 1, game.party.level, {});
  for (const e of game.entities) if (e !== rat) e.dead = true;
  const bite = srd.monsters['giant-rat'].actions[0];
  fighter.hp = fighter.maxHp = 100;
  game.rng = R(1, 20, 3); // With no ally only the first die (a natural 1) counts.
  assert.equal(monsterAttack(game, rat, bite, fighter, { feet: 5, ranged: false }).hit, false);
  const ally = game.spawnMonster('giant-rat', game.party.x, game.party.y - 1, game.party.level, {});
  assert.ok(ally.sx !== rat.sx || ally.sy !== rat.sy);
  game.rng = R(1, 20, 3);
  assert.equal(monsterAttack(game, rat, bite, fighter, { feet: 5, ranged: false }).hit, true);
});

test('spells: slots, damage from SRD dice, healing, concentration', async () => {
  const { game, ruleset } = await newGame();
  const [, , maren, elowen] = game.party.members;
  const t = game.spawnMonster('goblin-boss', game.party.x, game.party.y - 1, game.party.level, {});
  t.hp = t.maxHp = 200;
  game.party.focus = t.uid;
  const slots = elowen.slots.used;
  game.rng = fakeRng([], 2);
  assert.ok(ruleset.doAction(game, elowen, 'cast:magic-missile'));
  assert.equal(elowen.slots.used, slots + 1);
  assert.equal(200 - t.hp, 3 * (2 + 1), 'three darts of 1d4+1');
  assert.ok(elowen.actionReadyAt > game.time);
  elowen.actionReadyAt = 0;
  elowen.slots.used = elowen.slots.max;
  elowen.freeSpell = null;
  assert.equal(ruleset.doAction(game, elowen, 'cast:magic-missile'), false, 'no slot, no spell');
  const before = t.hp;
  game.rng = fakeRng([], 15);
  ruleset.doAction(game, elowen, 'cast:fire-bolt'); // Cantrips need no slot.
  assert.ok(t.hp < before);

  maren.hp = 1;
  game.rng = fakeRng([], 3);
  const idx = game.party.members.indexOf(maren);
  assert.ok(ruleset.doAction(game, maren, `cast-cure-wounds:${idx}`));
  const wis = Math.floor((maren.abilities.wis - 10) / 2);
  assert.equal(maren.hp, Math.min(maren.maxHp, 1 + 6 + wis)); // 2d8 + Wisdom modifier.

  maren.actionReadyAt = 0;
  ruleset.doAction(game, maren, 'cast:bless');
  assert.equal(maren.concentration, 'bless');
  const brunna = game.party.members[0];
  assert.ok(brunna.effects.some((e) => e.id === 'bless'));
  ruleset.endConcentration(game, maren);
  assert.ok(!brunna.effects.some((e) => e.id === 'bless'), 'ending concentration ends the spell');
});

test('Sleep skips creatures immune to Exhaustion, as the spell says', async () => {
  const { game, ruleset, srd } = await newGame();
  assert.match(srd.spells.sleep.description, /Immunity to the Exhaustion condition/);
  const elowen = game.party.members[3];
  for (const e of game.entities) e.dead = true;
  const z = game.spawnMonster('zombie', game.party.x, game.party.y - 1, game.party.level, {});
  game.rng = fakeRng([], 1);
  ruleset.doAction(game, elowen, 'cast:sleep');
  assert.ok(!hasCondition(z, 'incapacitated'));
});

test('class features: Second Wind, Rage resistance', async () => {
  const { game, ruleset, srd } = await newGame();
  const brunna = game.party.members[0];
  brunna.hp = 1;
  game.rng = fakeRng([], 5);
  assert.ok(ruleset.doAction(game, brunna, 'second-wind'));
  assert.equal(brunna.hp, 1 + 5 + 1);
  assert.equal(brunna.resources.secondWind, 1);
  assert.ok(brunna.bonusReadyAt > game.time);
  const b = createCharacter(srd, { name: 'B', classId: 'barbarian', speciesId: 'human', backgroundId: 'soldier' });
  game.party.members[0] = b;
  ruleset.doAction(game, b, 'rage');
  const hp = b.hp;
  applyDamage(R(), b, 6, 'slashing');
  assert.equal(hp - b.hp, 3);
});

test('XP is split among the living; level up uses Hit Die average', async () => {
  const { srd } = await newGame();
  const c = createCharacter(srd, { name: 'F', classId: 'fighter', speciesId: 'human', backgroundId: 'soldier' });
  const hp = c.maxHp;
  c.xp = 299;
  assert.equal(maybeLevelUp(c), false);
  c.xp = 300;
  assert.equal(maybeLevelUp(c), true);
  assert.equal(c.level, 2);
  assert.equal(c.maxHp, hp + 6 + 1); // d10 average 6 + Con +1.
  const { game, ruleset } = await newGame();
  const t = game.spawnMonster('goblin-boss', game.party.x, game.party.y - 1, game.party.level, {});
  t.dead = true;
  ruleset.onMonsterDeath(game, t);
  for (const m of game.party.members) assert.equal(m.xp, 200 / 4);
  assert.ok(game.itemsAt(t.x, t.y).some((f) => f.item.proto === 'scimitar'), 'stat block gear drops');
});

test('rests recover what the SRD says they do', async () => {
  const { game, ruleset, srd } = await newGame();
  const w = createCharacter(srd, { name: 'W', classId: 'wizard', speciesId: 'human', backgroundId: 'sage' });
  w.hp = 1; w.slots.used = 2;
  shortRest(fakeRng([], 4), w);
  assert.equal(w.hitDice, 0);
  assert.ok(w.hp > 1);
  assert.equal(w.slots.used, 1, 'Arcane Recovery');
  w.hp = 1;
  longRest(w);
  assert.equal(w.hp, w.maxHp);
  assert.equal(w.slots.used, 0);
  assert.equal(w.hitDice, 1);
  for (const e of game.entities) e.dead = true;
  const m = game.party.members[0];
  m.hp = 1;
  assert.ok(ruleset.rest(game, 'long'));
  assert.equal(m.hp, m.maxHp);
  assert.ok(game.time >= 8 * 3600);
  const foe = game.spawnMonster('goblin-warrior', game.party.x, game.party.y - 2, game.party.level, { awake: true });
  assert.equal(ruleset.rest(game, 'short'), false, 'no resting beside enemies');
  foe.dead = true;
});

test('death saves tick once per round for a dying character', async () => {
  const { game } = await newGame();
  for (const e of game.entities) e.dead = true;
  const m = game.party.members[3];
  applyDamage(game.rng, m, m.maxHp, 'slashing');
  game.rng = fakeRng([], 15);
  tick(game, 13 / 1.5);
  assert.equal(m.death.success, 2);
  tick(game, 4);
  assert.equal(m.death.stable, true);
  assert.ok(!m.dead);
});

test('the game ends when nobody is left standing, even if some are only stable', async () => {
  const { game } = await newGame();
  for (const e of game.entities) e.dead = true;
  const [a, b, c, d] = game.party.members;
  for (const m of [a, b, c]) { m.hp = 0; m.death.stable = true; }
  tick(game, 0.2);
  assert.equal(game.over, null, 'one still standing');
  d.hp = 0; d.death.stable = true;
  tick(game, 0.2);
  assert.equal(game.over, 'lost');
});

test('quick actions keep their positions and follow the Action and Bonus Action timers', async () => {
  const { game: g } = await newGame();
  const members = g.party.members;
  const icons = (m) => Object.fromEntries(g.ruleset.memberQuickActions(g, m).map((a, i) => [i, a]));
  for (const m of members) assert.deepEqual(g.ruleset.memberQuickActions(g, m).map((a) => a.glyph), ['fist', 'fist', 'plus', 'plus', 'dodge', 'search', 'cast']);
  const fighter = members.find((m) => !g.ruleset.knownSpells(m).length);
  assert.equal(icons(fighter)[6].enabled, false, 'no spells, no Cast');
  const caster = members.find((m) => g.ruleset.knownSpells(m).length);
  assert.equal(icons(caster)[6].enabled, true);
  assert.equal(icons(caster)[6].submenu, 'cast');
  caster.actionReadyAt = g.time + 6;
  assert.equal(icons(caster)[0].enabled, false);
  assert.equal(icons(caster)[4].enabled, false);
  assert.equal(icons(caster)[5].enabled, false);
  caster.bonusReadyAt = g.time + 6;
  assert.equal(icons(caster)[6].enabled, false, 'nothing left to cast with');
  caster.actionReadyAt = caster.bonusReadyAt = g.time;
  assert.equal(icons(caster)[0].enabled, true);
});

test('Nick waives the Bonus Action but only works once per round', async () => {
  const { game: g, ruleset: r } = await newGame();
  const rogue = g.party.members.find((m) => m.classId === 'rogue');
  const off = () => r.memberActions(g, rogue).find((a) => a.id === 'attack:off');
  assert.equal(off().enabled, true);
  r.strike = () => true;
  assert.equal(r.doAction(g, rogue, 'attack:off'), true);
  assert.equal(off().enabled, false, 'spent for this round');
  assert.ok(rogue.bonusReadyAt <= g.time, 'the Bonus Action is still free');
  rogue.nickReadyAt = g.time;
  assert.equal(off().enabled, true, 'back next round');
});

test('two skills or spells can be picked for quick access, and the choice is saved', async () => {
  const { game: g, ruleset: r } = await newGame();
  const wizard = g.party.members.find((m) => m.classId === 'wizard');
  const ids = r.memberAbilities(g, wizard).map((a) => a.id);
  assert.ok(ids.length >= 3);
  assert.ok(r.toggleQuick(g, wizard, ids[0]));
  assert.ok(r.toggleQuick(g, wizard, ids[1]));
  assert.equal(r.toggleQuick(g, wizard, ids[2]), false, 'only two slots');
  assert.equal(r.toggleQuick(g, wizard, 'not-a-real-ability'), false);
  assert.deepEqual(r.memberQuickActions(g, wizard).slice(2, 4).map((a) => a.id), ids.slice(0, 2));
  assert.deepEqual(JSON.parse(g.serialize()).party.members.find((m) => m.classId === 'wizard').quick, ids.slice(0, 2));
  assert.ok(r.toggleQuick(g, wizard, ids[0]), 'picking again removes it');
  assert.equal(r.memberQuickActions(g, wizard)[2].empty, true);
  assert.equal(r.memberQuickActions(g, wizard)[3].id, ids[1], 'the other slot stays put');
  wizard.actionReadyAt = wizard.bonusReadyAt = g.time + 6;
  assert.equal(r.memberQuickActions(g, wizard)[3].enabled, false, 'dims while recovering');
});

test('a barbarian keeps Rage in its quick slot while raging', async () => {
  const { game: g, ruleset: r } = await newGame();
  const m = r.createMember({ classId: 'barbarian', speciesId: 'human', backgroundId: 'soldier', name: 'Test' });
  g.party.members[0] = m;
  assert.ok(r.toggleQuick(g, m, 'rage'));
  assert.equal(r.memberQuickActions(g, m)[2].id, 'rage');
  r.doAction(g, m, 'rage');
  assert.equal(r.memberQuickActions(g, m)[2].id, 'end-rage');
  r.doAction(g, m, 'end-rage');
  assert.equal(r.memberQuickActions(g, m)[2].id, 'rage');
});

test('Stabilize can be slotted and lights up only while an ally is dying', async () => {
  const { game: g, ruleset: r } = await newGame();
  const [a, b] = g.party.members;
  assert.ok(r.toggleQuick(g, a, 'menu:ally:stabilize'));
  const slot = () => r.memberQuickActions(g, a)[2];
  assert.equal(slot().enabled, false);
  b.hp = 0;
  assert.equal(slot().enabled, true);
  assert.equal(slot().submenu, 'ally:stabilize');
});

test('dwarves of every class have their own portrait, and other species share the class portrait', async () => {
  const { game: g } = await newGame();
  const index = JSON.parse(readFileSync(new URL('../assets/game/index.json', import.meta.url)));
  for (const classId of Object.keys(g.ruleset.srd.classes)) {
    assert.ok(index[g.ruleset.portrait({ classId, speciesId: 'dwarf' })], `dwarf ${classId}`);
    assert.equal(g.ruleset.portrait({ classId, speciesId: 'elf' }), `portrait-${classId}`);
  }
  assert.equal(g.ruleset.portrait({ classId: 'wizard', speciesId: 'dwarf' }), 'portrait-dwarf-wizard');
  assert.equal(g.ruleset.portrait({ classId: 'fighter', speciesId: 'dwarf' }), 'portrait-fighter');
});

test('the creator leaves out the classes and species held back for now, but their rules still work', async () => {
  const { game: g } = await newGame();
  const offered = (key) => g.ruleset.creationSteps().find((s) => s.key === key).options.map((o) => o.id);
  assert.deepEqual(offered('classId'), ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'wizard']);
  for (const id of ['orc', 'goliath', 'dragonborn', 'tiefling']) assert.ok(!offered('speciesId').includes(id), id);
  for (const id of ['dwarf', 'elf', 'halfling', 'human']) assert.ok(offered('speciesId').includes(id), id);
  assert.equal(g.ruleset.createMember({ name: 'T', classId: 'warlock', speciesId: 'tiefling' }).classId, 'warlock');
});
