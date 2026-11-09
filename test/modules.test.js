// Adventures as the player meets them: chosen from a list, entered at the start, and left by an exit.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Game, outgrown } from '../engine/world.js';
import { loadModule, newGame, tick } from './helpers.mjs';

test('every listed module has a usable recommended level range', () => {
  const ids = JSON.parse(readFileSync(new URL('../modules/index.json', import.meta.url)));
  assert.ok(ids.includes('thornwick'));
  for (const id of ids) {
    const m = JSON.parse(readFileSync(new URL(`../modules/${id}/module.json`, import.meta.url)));
    assert.equal(m.id, id);
    assert.ok(m.summary, `${id} has a summary`);
    assert.ok(m.license?.name && m.license.credit, `${id} has a license and credit`);
    assert.ok(existsSync(new URL(`../${m.license.file}`, import.meta.url)), `${id} has its license text`);
    const { min, max } = m.recommendedLevels;
    assert.ok(Number.isInteger(min) && Number.isInteger(max) && min >= 1 && min <= max, `${id} level range`);
  }
  const thornwick = JSON.parse(readFileSync(new URL('../modules/thornwick/module.json', import.meta.url)));
  assert.deepEqual(thornwick.recommendedLevels, { min: 1, max: 2 });
});

/** Walks from Thornwick's start to the rope, which is in the wall south of the far corner of the first room. */
function takeTheRope(g) {
  g.teleport({ x: 9, y: 21, dir: 2 });
  g.party.stepReadyAt = 0;
  assert.equal(g.step(0), true);
}

test('taking the exit ends the adventure, and the next one starts from where the party got to', async () => {
  const { game: g, ruleset } = await newGame();
  const [first] = g.party.members;
  first.xp = 250;
  first.hp = 3;
  first.actionReadyAt = 500;
  g.time = 400; g.realTime = 300;
  takeTheRope(g);
  assert.equal(g.over, 'left');
  assert.match(g.leaveText, /rope/);
  g.tick(1);
  assert.equal(g.time, 400, 'the adventure has stopped');

  const save = JSON.parse(g.vacationSave());
  assert.equal(save.vacation, true);
  const next = new Game(g.module, ruleset, { seed: 2 });
  next.start(save.members, save);
  assert.deepEqual([next.party.level, next.party.x, next.party.y], ['warren', 11, 20], 'moved to the starting point');
  assert.equal(next.over, null);
  assert.equal(next.party.members[0].xp, 250);
  assert.deepEqual([next.time, next.realTime], [400 + 8 * 3600, 300], 'the clock carries on, past the rest');
  assert.ok(next.party.members[0].actionReadyAt <= next.time, 'cooldowns are over');
});

test('what belongs to the adventure stays behind, and the rest comes along', async () => {
  const { game: g } = await newGame();
  const [a, b] = g.party.members;
  const free = a.pack.indexOf(null);
  a.pack[free] = { uid: 'k', proto: 'iron-key' };
  a.equipment.neck = { uid: 's', proto: 'wellstone' };
  b.pack[b.pack.indexOf(null)] = { uid: 'f', proto: 'thornwick-fang' };
  g.hand = { uid: 'p', proto: 'potion-of-healing' };

  const save = JSON.parse(g.vacationSave());
  assert.equal(save.members[0].pack[free], null);
  assert.equal(save.members[0].equipment.neck, null);
  assert.ok(save.members[1].pack.some((it) => it?.proto === 'thornwick-fang'), 'loot is kept');
  assert.equal(save.hand.proto, 'potion-of-healing');
  assert.equal(a.pack[free].proto, 'iron-key', 'the game itself is untouched, in case the save fails');

  g.hand = { uid: 'k2', proto: 'iron-key' };
  assert.equal(JSON.parse(g.vacationSave()).hand, null);
});

test('concentration ends with the adventure, on copies only', async () => {
  const { game: g, ruleset } = await newGame();
  const cleric = g.party.members[2];
  ruleset.startConcentration(g, cleric, 'bless');
  g.party.members[0].effects.push({ id: 'bless', caster: cleric.uid });
  const save = JSON.parse(g.vacationSave());
  assert.equal(save.members[2].concentration, null);
  assert.equal(save.members[0].effects.some((e) => e.id === 'bless'), false);
  assert.equal(cleric.concentration, 'bless');
  assert.equal(g.party.members[0].effects.some((e) => e.id === 'bless'), true);
});

test('going on vacation is a Long Rest, which does not bring back the dead', async () => {
  const { game: g } = await newGame();
  const [fighter, rogue, cleric, wizard] = g.party.members;
  fighter.hp = 3;
  cleric.slots.used = 2;
  rogue.dead = true; rogue.hp = 0;
  wizard.hp = 0; wizard.conditions.push({ id: 'unconscious' }); wizard.death = { success: 1, fail: 2, stable: false };
  const rations = fighter.pack.find((it) => it?.proto === 'rations');
  const eaten = rations ? rations.qty - 1 : null;

  const after = JSON.parse(g.vacationSave()).members;
  assert.equal(after[0].hp, fighter.maxHp);
  assert.equal(after[2].slots.used, 0);
  assert.equal(after[3].hp, wizard.maxHp, 'someone down gets back up');
  assert.deepEqual(after[3].death, { success: 0, fail: 0, stable: false });
  assert.deepEqual([after[1].dead, after[1].hp], [true, 0], 'the dead stay dead');
  if (rations) assert.equal(after[0].pack.find((it) => it?.proto === 'rations')?.qty ?? 0, eaten, 'a ration is eaten, as on any Long Rest');
  assert.equal(fighter.hp, 3, 'the game itself is untouched, in case the save fails');
});

test('an adventure stays open until the average level is above its range', async () => {
  const { game: g, ruleset } = await newGame();
  const members = g.party.members;
  const levels = (...l) => l.forEach((n, i) => { members[i].level = n; });
  assert.equal(outgrown(g.module, ruleset, members), false, 'level 1');
  levels(2, 2, 2, 2);
  assert.equal(outgrown(g.module, ruleset, members), false, 'exactly at the top of the range is still in it');
  levels(3, 3, 1, 1);
  assert.equal(outgrown(g.module, ruleset, members), false, 'one or two ahead of the others is not enough');
  levels(3, 2, 2, 2);
  assert.equal(outgrown(g.module, ruleset, members), true, 'an average of 2.25');
  members[0].dead = true;
  assert.equal(outgrown(g.module, ruleset, members), false, 'the dead do not count');
  members.forEach((m) => { m.dead = true; });
  assert.equal(ruleset.partyLevel(members), 0);
});

test('a replacement starts at the lowest living level, the same as if it had earned it', async () => {
  const { game: g, ruleset } = await newGame();
  const members = g.party.members;
  assert.equal(ruleset.hireLevel(members), 1);
  members.forEach((m) => { m.level = 2; });
  members[0].level = 1; members[0].dead = true;
  assert.equal(ruleset.hireLevel(members), 2, 'the dead do not count');
  members[1].level = 1;
  assert.equal(ruleset.hireLevel(members), 1);
  members.forEach((m) => { m.dead = true; });
  assert.equal(ruleset.hireLevel(members), 1);

  const choices = { name: 'Nell', classId: 'cleric', speciesId: 'human', backgroundId: 'acolyte' };
  const hired = ruleset.createMember({ ...choices, level: 2 });
  const earned = ruleset.createMember(choices);
  assert.deepEqual([earned.level, earned.xp], [1, 0]);
  earned.xp = 300;
  ruleset.awardXp({ party: { members: [earned] }, log() {}, sound() {} }, 0);
  const same = (c) => ({ level: c.level, xp: c.xp, maxHp: c.maxHp, hp: c.hp, hitDice: c.hitDice, slots: c.slots, prepared: c.prepared, resources: c.resources });
  assert.deepEqual(same(hired), same(earned));
  assert.equal(ruleset.createMember({ ...choices, level: 9 }).level, 2, 'not past the level cap');
  assert.ok(ruleset.memberSheet(null, hired).length > 5, 'the sheet can be read outside an adventure');
});

test('a unique item carried out of the adventure is not there on later runs', async () => {
  const { game: g, ruleset } = await newGame();
  const fangs = (game) => game.floorItems.filter((f) => f.item.proto === 'thornwick-fang').length;
  assert.equal(fangs(g), 1);

  // Leaving without it changes nothing.
  assert.deepEqual(JSON.parse(g.vacationSave()).collected, []);

  const entry = g.floorItems.find((f) => f.item.proto === 'thornwick-fang');
  g.pickUp(entry);
  const save = JSON.parse(g.vacationSave());
  assert.deepEqual(save.collected, ['thornwick-fang']);
  assert.equal(save.hand.proto, 'thornwick-fang', 'the party keeps it');

  const next = new Game(g.module, ruleset, { seed: 2 });
  next.start(save.members, save);
  assert.equal(fangs(next), 0);
  assert.ok(next.floorItems.some((f) => f.item.proto === 'potion-of-healing'), 'everything else is back');

  // Every way of placing an item honours it, and the record survives saves and further adventures.
  next.run([{ do: 'placeItem', proto: 'thornwick-fang', x: 1, y: 1 }, { do: 'giveItem', proto: 'thornwick-fang' }]);
  next.useFeature({ items: [{ proto: 'thornwick-fang' }], x: 1, y: 1, level: 'warren' });
  assert.equal(fangs(next), 0);
  const restored = new Game(g.module, ruleset, { seed: 3 });
  restored.restore(next.serialize());
  assert.deepEqual(restored.collected, ['thornwick-fang']);
  next.hand = null;
  assert.deepEqual(JSON.parse(next.vacationSave()).collected, ['thornwick-fang']);
});

test('saves from before unique items load with nothing collected', async () => {
  const { game: g, ruleset } = await newGame();
  const saved = JSON.parse(g.serialize());
  delete saved.collected;
  const other = new Game(g.module, ruleset, { seed: 2 });
  other.restore(JSON.stringify(saved));
  assert.deepEqual(other.collected, []);
  const next = new Game(g.module, ruleset, { seed: 3 });
  next.start(g.party.members, { hand: null, time: 0, realTime: 0 });
  assert.equal(next.floorItems.filter((f) => f.item.proto === 'thornwick-fang').length, 1);
});

test('a dead character\'s gear follows the party when someone is hired', async () => {
  const { game: g, ruleset } = await newGame();
  const members = g.party.members;
  const choices = { name: 'Nell', classId: 'wizard', speciesId: 'human', backgroundId: 'sage' };
  const pip = members[1];
  pip.dead = true;
  pip.equipment.ring = { uid: 'fang', proto: 'thornwick-fang' };
  const gear = [...Object.values(pip.equipment), ...pip.pack].filter(Boolean);
  const total = (party, proto) => party.flatMap((m) => [...Object.values(m.equipment), ...m.pack]).filter((it) => it?.proto === proto).reduce((n, it) => n + (it.qty ?? 1), 0);
  const protos = [...new Set(gear.map((it) => it.proto))];
  const before = new Map(protos.map((p) => [p, total(members, p)]));
  const fresh = ruleset.createMember(choices);

  const party = ruleset.hire(members, 1, choices);
  assert.equal(party[1].name, 'Nell');
  assert.equal(party[1].dead, undefined);
  for (const p of protos) assert.equal(total(party, p), before.get(p) + total([fresh], p), `${p} is all still there`);
  assert.ok(party[1].pack.some((it) => it?.uid === 'fang'), 'the replacement carries it');
  assert.equal(members[1], pip, 'the party passed in is untouched, in case the save fails');
  assert.equal(pip.equipment.ring.uid, 'fang');

  // When everyone's full, the gear still fits.
  const full = structuredClone(members);
  for (const m of full) if (!m.dead) m.pack = m.pack.map((it, i) => it ?? { uid: `x${m.uid}${i}`, proto: 'chalk' });
  full[1].pack = full[1].pack.map((it, i) => it ?? { uid: `y${i}`, proto: 'ball-bearings-ignored' });
  const crowded = ruleset.hire(full, 1, choices);
  const held = crowded.flatMap((m) => [...Object.values(m.equipment), ...m.pack]);
  for (const it of [...Object.values(full[1].equipment), ...full[1].pack].filter(Boolean)) {
    if (it.qty == null) assert.ok(held.some((h) => h?.uid === it.uid), `${it.proto} survives a full party`);
  }
  assert.ok(crowded[1].pack.length > fresh.pack.length, 'the replacement\'s pack grows');
});

test('a torch still burning from the last adventure is not joined by another', async () => {
  const { game: g, ruleset } = await newGame();
  const lit = () => g.party.members.flatMap((m) => [m.equipment.mainHand, m.equipment.offHand]).filter((it) => it?.proto === 'torch').length;
  const count = () => g.party.members.flatMap((m) => m.pack).filter((it) => it?.proto === 'torch').reduce((n, it) => n + (it.qty ?? 1), 0);
  assert.equal(lit(), 1);
  const packed = count();
  ruleset.onAdventureStart(g);
  assert.equal(lit(), 1);
  assert.equal(count(), packed);
});

test('old saves from inside an adventure still load', async () => {
  const { game: g, ruleset } = await newGame();
  const saved = JSON.parse(g.serialize());
  assert.equal(saved.vacation, undefined);
  assert.equal(saved.module, 'thornwick');
  const other = new Game(g.module, ruleset, { seed: 2 });
  other.restore(JSON.stringify(saved));
  assert.equal(other.party.members.length, 4);
});

test('a unique weapon shows its base weapon icon, whatever it is called', async () => {
  const { ruleset } = await newGame();
  assert.equal(ruleset.itemInfo({ proto: 'thornwick-fang' }).icon, 'sword');
});

test('time passing alone leaves nothing new to save, but moving does', async () => {
  for (const id of ['thornwick', 'barrow']) {
    const { game: g } = await newGame(1, loadModule(id));
    const saved = g.progress();
    tick(g, 20);
    assert.equal(g.progress(), saved, `${id}: waiting changes nothing worth saving`);
    g.turn(1);
    assert.notEqual(g.progress(), saved, `${id}: turning does`);
  }
});
