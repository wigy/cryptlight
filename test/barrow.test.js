// Barrow of the Two Brothers: the scripted parts, then a bot playing it to the end.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attackModifiers } from '../rules/srd5/core.js';
import { makeItem } from '../rules/srd5/characters.js';
import { Bot } from './bot.mjs';
import { loadModule, newGame, tick } from './helpers.mjs';

const CROWN = 'two-brothers-crown';
const start = (seed = 1, collected = []) => newGame(seed, loadModule('barrow')).then(({ game, ruleset, srd }) => { game.collected = collected; return { g: game, r: ruleset, srd }; });
const named = (g, name) => g.entities.filter((e) => e.name === name && !e.dead);
const guards = (g) => g.entities.filter((e) => e.tag === 'guard');
const at = (g, level, x, y, dir = 0) => { g.teleport({ level, x, y, dir }); g.party.stepReadyAt = 0; };
const enter = at; // Teleporting runs whatever is on the floor there, as walking in does.
const object = (g, level, x, y, type) => g.objectsAt(x, y, level).find((o) => o.type === type);
const liftCrown = (g) => { const f = g.itemsAt(14, 2, 'lower').find((e) => e.item.proto === CROWN); assert.ok(f, 'the crown lies between the thrones'); g.hand = g.takeFloorItem(f); };

test('the guards wait for orders, even with the party beside them', async () => {
  const { g } = await start();
  at(g, 'lower', 14, 3);
  tick(g, 5);
  assert.equal(guards(g).length, 4);
  assert.ok(guards(g).every((e) => !e.awake));
});

for (const [x, wears, foe] of [[11, 'Ethelred', "Olaf's Spirit"], [17, 'Olaf', "Ethelred's Spirit"]]) {
  test(`crowning ${wears} lays him to rest, and turns the other brother and the guards on the party`, async () => {
    const { g } = await start();
    enter(g, 'lower', 14, 3);
    liftCrown(g);
    const xp = g.party.members[0].xp;
    g.useObject(object(g, 'lower', x, 0, 'wall'));
    assert.equal(g.flags.crowned, true);
    assert.equal(g.flags[`rest-${wears.toLowerCase()}`], true);
    assert.equal(named(g, foe).length, 1);
    assert.equal(g.entities.filter((e) => /Spirit/.test(e.name)).length, 1, 'his own spirit has gone');
    assert.ok(guards(g).every((e) => e.awake));
    assert.equal(g.party.members[0].xp, xp + 50);
    assert.equal(g.useObject(object(g, 'lower', x, 0, 'wall')), false, 'and the crown stays');
    assert.equal(g.hand, null);
    enter(g, 'lower', 14, 4);
    assert.equal(g.entities.filter((e) => /Spirit/.test(e.name)).length, 1, 'leaving now changes nothing');
  });
}

test('leaving the chamber without crowning anyone sets both brothers on the party, once', async () => {
  const { g } = await start();
  enter(g, 'lower', 14, 4);
  assert.equal(g.entities.filter((e) => /Spirit/.test(e.name)).length, 0, 'not on the way in');
  enter(g, 'lower', 14, 3);
  enter(g, 'lower', 14, 4);
  assert.equal(named(g, "Ethelred's Spirit").length, 1);
  assert.equal(named(g, "Olaf's Spirit").length, 1);
  assert.ok(guards(g).every((e) => e.awake));
  enter(g, 'lower', 14, 3);
  enter(g, 'lower', 14, 4);
  assert.equal(g.entities.filter((e) => /Spirit/.test(e.name)).length, 2);
  assert.equal(g.flags.crowned, undefined);
});

test('attacking a guard does the same', async () => {
  const { g, r } = await start();
  r.wake(g, guards(g)[0]);
  assert.equal(g.entities.filter((e) => /Spirit/.test(e.name)).length, 2);
  assert.ok(guards(g).every((e) => e.awake));
});

test('a crown put on a throne once the fight has begun does nothing, and can still be taken', async () => {
  const { g, r } = await start();
  r.wake(g, guards(g)[0]);
  at(g, 'lower', 11, 1);
  liftCrown(g);
  g.useObject(object(g, 'lower', 11, 0, 'wall'));
  assert.equal(g.flags.crowned, undefined);
  assert.equal(g.entities.filter((e) => /Spirit/.test(e.name)).length, 2);
  g.useObject(object(g, 'lower', 11, 0, 'wall'));
  assert.equal(g.hand?.proto, CROWN);
});

test('the spirits can\'t cross unbroken salt, though the skeletons can', async () => {
  const { g, r } = await start();
  r.wake(g, guards(g)[0]);
  const spirit = named(g, "Ethelred's Spirit")[0];
  const line = object(g, 'lower', 14, 5, 'ward');
  assert.equal(g.canEnter(spirit, 14, 5), false);
  assert.equal(g.canEnter(guards(g)[0], 14, 5), true);
  g.useObject(line);
  assert.equal(g.canEnter(spirit, 14, 5), true);
});

test('the crown can\'t pass a salt line in hand or pack, until the line is broken', async () => {
  const { g } = await start();
  liftCrown(g);
  at(g, 'lower', 14, 4, 2);
  assert.equal(g.step(0), false, 'in hand');
  const crown = g.hand;
  g.hand = null;
  g.party.members[0].pack[g.party.members[0].pack.indexOf(null)] = crown;
  assert.equal(g.step(0), false, 'in a pack');
  assert.equal(g.party.y, 4);
  g.useObject(object(g, 'lower', 14, 5, 'ward'));
  assert.equal(g.step(0), true);
  assert.equal(g.party.y, 5);
  at(g, 'upper', 6, 2, 0);
  assert.equal(g.step(0), false, 'and again at the stairs');
  g.useObject(object(g, 'upper', 6, 1, 'ward'));
  assert.equal(g.step(0), true);
});

test('a tomb needs its salt ring broken, and gives up its prize before its shaft', async () => {
  const { g } = await start();
  const tomb = object(g, 'upper', 6, 8, 'feature');
  at(g, 'upper', 6, 7, 2);
  g.useObject(tomb);
  assert.equal(g.itemsAt(6, 7).length, 0);
  assert.equal(g.party.level, 'upper');
  g.useObject(object(g, 'upper', 6, 7, 'ward'));
  g.useObject(tomb);
  assert.ok(g.itemsAt(6, 7).some((f) => f.item.proto === 'ethelred-dagger'));
  assert.equal(g.party.level, 'upper');
  g.useObject(tomb);
  assert.deepEqual([g.party.level, g.party.x, g.party.y], ['lower', 2, 10]);
});

test('Olaf\'s tomb can\'t be opened from below, only by digging in from outside', async () => {
  const { g } = await start();
  at(g, 'lower', 26, 10, 1);
  g.step(0);
  assert.equal(g.party.level, 'lower');
  assert.match(g.logLines.at(-1).text, /digging in from above/);
  at(g, 'hillside', 11, 2, 1);
  assert.equal(g.step(0), false, 'the rubble blocks the way');
  const time = g.time;
  g.useObject(g.objectById('rubble'));
  assert.ok(g.time >= time + 3600 && g.time <= time + 6 * 3600, 'digging takes 1d6 hours');
  assert.equal(g.step(0), true);
  g.party.stepReadyAt = 0;
  g.turn(-1);
  g.step(0);
  assert.deepEqual([g.party.level, g.party.x, g.party.y], ['upper', 24, 1]);
  at(g, 'upper', 24, 7, 2);
  g.useObject(object(g, 'upper', 24, 7, 'ward'));
  g.useObject(object(g, 'upper', 24, 8, 'feature'));
  assert.ok(g.itemsAt(24, 7).some((f) => f.item.proto === 'wrath'));
  at(g, 'lower', 26, 10, 1);
  g.step(0);
  assert.deepEqual([g.party.level, g.party.x, g.party.y], ['upper', 24, 7], 'open from above, the shaft works both ways');
});

test('each trapped slab goes off once, with three skeletons', async () => {
  const { g } = await start();
  const before = g.entities.length;
  enter(g, 'upper', 9, 3);
  assert.equal(g.entities.length, before + 3);
  enter(g, 'upper', 9, 4);
  assert.equal(g.entities.length, before + 3, 'the band is one trap');
  enter(g, 'upper', 20, 4);
  enter(g, 'upper', 28, 4);
  assert.equal(g.entities.length, before + 9);
  assert.ok(g.entities.slice(before).every((e) => e.proto === 'skeleton' && e.awake));
});

test('Anders\'s parents pay once, on the way out, and only if he was found', async () => {
  const { g } = await start();
  enter(g, 'hillside', 2, 2);
  assert.equal(g.over, null, 'not without news of him');
  at(g, 'upper', 3, 3);
  g.useObject(object(g, 'upper', 3, 4, 'feature'));
  assert.equal(g.flags['anders-found'], true);
  assert.ok(g.itemsAt(3, 4).some((f) => f.item.proto === 'anders-diary'));
  const gold = (game) => game.party.members.flatMap((m) => m.pack).filter((it) => it?.proto === 'gold').reduce((n, it) => n + it.qty, 0);
  const had = gold(g);
  enter(g, 'hillside', 2, 2);
  assert.equal(g.over, 'won');
  assert.equal(gold(g), had + 50);
  assert.ok(g.party.members.some((m) => m.pack.some((it) => it?.proto === 'anders-thanks')));
  assert.ok(JSON.parse(g.vacationSave()).collected.includes('anders-thanks'));
  const { g: again } = await start(1, ['anders-thanks']);
  again.flags['anders-found'] = true;
  enter(again, 'hillside', 2, 2);
  assert.equal(again.over, null, 'a second trip earns nothing, and just walks out');
});

test('what belongs to the adventure stays, and unique rewards aren\'t there again', async () => {
  const { g } = await start();
  const m = g.party.members[0];
  m.pack[m.pack.indexOf(null)] = makeItem('anders-diary');
  m.pack[m.pack.indexOf(null)] = makeItem(CROWN);
  m.pack[m.pack.indexOf(null)] = makeItem('wrath');
  const save = JSON.parse(g.vacationSave());
  const carried = save.members[0].pack.filter(Boolean).map((it) => it.proto);
  assert.ok(!carried.includes('anders-diary'));
  assert.ok(carried.includes(CROWN) && carried.includes('wrath'));
  const { g: again } = await start(1, save.collected);
  again.flags['olaf-salt'] = true;
  at(again, 'upper', 24, 7, 2);
  again.useObject(object(again, 'upper', 24, 8, 'feature'));
  assert.equal(again.itemsAt(24, 7).length, 0, 'no second Wrath');
});

test('with the crown already carried off, the brothers attack on sight', async () => {
  const { g } = await start(1, [CROWN]);
  enter(g, 'lower', 14, 3);
  assert.equal(g.entities.filter((e) => /Spirit/.test(e.name)).length, 2);
});

test('dread falls only on those with treachery in their past, and hampers attacks and checks', async () => {
  const { g } = await start();
  const members = g.party.members;
  const pip = members.find((m) => m.backgroundId === 'criminal');
  const honest = members.find((m) => m.backgroundId !== 'criminal');
  enter(g, 'lower', 14, 9);
  const foe = g.entities[0];
  assert.equal(attackModifiers(pip, foe, { feet: 5, ranged: false }).disadvantage, true);
  assert.equal(attackModifiers(honest, foe, { feet: 5, ranged: false }).disadvantage, false);
  assert.match(g.logLines.at(-1).text, new RegExp(pip.name));
  g.entities = []; // Nobody left to end the wait early.
  tick(g, 200);
  assert.equal(attackModifiers(pip, foe, { feet: 5, ranged: false }).disadvantage, false, 'it passes');
});

/** A party member holding Wrath, facing a skeleton and with another beside it. */
async function wielder() {
  const { g, r } = await start();
  const m = g.party.members[0];
  m.equipment.mainHand = makeItem('wrath');
  at(g, 'upper', 7, 6, 0);
  g.party.x = 6; g.party.y = 3;
  const near = g.spawnMonster('skeleton', 6, 2, 'upper', { awake: true });
  const other = g.spawnMonster('skeleton', 6, 2, 'upper', { awake: true });
  return { g, r, m, near, other };
}
const wrathAction = (g, r, m) => r.memberAbilities(g, m).find((a) => a.id === 'wrath');

test('Wrath is listed only in the main hand, and binds its wielder to one target', async () => {
  const { g, r, m, near, other } = await wielder();
  const free = g.party.members[1];
  assert.equal(wrathAction(g, r, free), undefined);
  assert.equal(wrathAction(g, r, m).enabled, true);
  g.party.focus = near.uid;
  r.doAction(g, m, 'wrath');
  assert.equal(attackModifiers(m, near, { feet: 5, ranged: false }).advantage, true, 'Advantage on the next attack');
  assert.equal(attackModifiers(m, other, { feet: 5, ranged: false }).advantage, false, 'against that target only');
  assert.deepEqual(r.targetsFor(g, m, { maxFeet: 30 }).map((t) => t.uid ?? t.m?.uid), [near.uid], 'nobody else can be attacked');
  assert.equal(wrathAction(g, r, m).enabled, false, 'not again');
  near.dead = true; near.hp = 0;
  tick(g, 0.2);
  assert.ok(r.targetsFor(g, m, { maxFeet: 30 }).map((t) => t.uid ?? t.m?.uid).includes(other.uid), 'free again once it falls');
});

test('Wrath\'s binding ends if the party leaves the level or the wielder falls', async () => {
  const left = await wielder();
  left.r.doAction(left.g, left.m, 'wrath');
  at(left.g, 'lower', 2, 10);
  tick(left.g, 0.2);
  assert.equal(left.m.effects.some((e) => e.id === 'wrath'), false);
  const fell = await wielder();
  fell.r.doAction(fell.g, fell.m, 'wrath');
  fell.m.hp = 0;
  tick(fell.g, 0.2);
  assert.equal(fell.m.effects.some((e) => e.id === 'wrath'), false);
});

test('Wrath comes back with a Long Rest, including the one on leaving, and passing it on gives no extra use', async () => {
  const { g, r, m } = await wielder();
  r.doAction(g, m, 'wrath');
  const sword = m.equipment.mainHand;
  assert.equal(sword.powerUsed, true);
  const friend = g.party.members[1];
  m.effects = m.effects.filter((e) => e.id !== 'wrath' && e.id !== 'vex');
  m.equipment.mainHand = null;
  friend.equipment.mainHand = sword;
  assert.equal(wrathAction(g, r, friend).enabled, false, 'the sword remembers');
  r.longRestMember(friend);
  assert.equal(sword.powerUsed, false, 'a Long Rest in the dungeon');
  r.doAction(g, friend, 'wrath');
  assert.equal(sword.powerUsed, true);
  const save = JSON.parse(g.vacationSave());
  assert.equal(save.members[1].equipment.mainHand.powerUsed, false, 'going on vacation');
});

function play(g, r) {
  const b = new Bot(g, r);
  const climb = (tx, ty) => { b.faceTo(tx, ty); g.party.stepReadyAt = 0; g.step(0); };
  // Down the open entrance, past the skeletons to Anders.
  b.walk(7, 2);
  climb(7, 1);
  assert.equal(g.party.level, 'upper');
  b.walk(6, 3);
  b.clear(1, 3, 5, 5);
  if (g.over) return g.over;
  b.walk(4, 3);
  g.useObject(object(g, 'upper', 3, 4, 'feature'));
  assert.equal(g.flags['anders-found'], true);
  b.rest();
  // The tomb, and down.
  b.walk(6, 7);
  if (g.over) return g.over;
  g.useObject(object(g, 'upper', 6, 7, 'ward'));
  const tomb = object(g, 'upper', 6, 8, 'feature');
  g.useObject(tomb);
  b.take('ethelred-dagger');
  b.rest('long');
  g.useObject(tomb);
  assert.equal(g.party.level, 'lower');
  // The Tomb of the Traitors.
  b.walk(14, 10);
  b.walk(14, 9);
  b.clear(9, 7, 19, 8);
  if (g.over) return g.over;
  b.rest('long');
  if (g.over) return g.over;
  // The chamber: crown a brother and fight the other, going by the seed.
  b.walk(14, 7);
  b.walk(14, 3);
  if (g.over) return g.over;
  b.walk(14, 2);
  if (g.over) return g.over;
  const entry = g.itemsAt(14, 2).find((f) => f.item.proto === CROWN);
  g.pickUp(entry);
  const x = g.rng.next() < 0.5 ? 11 : 17;
  const crown = g.hand;
  g.hand = null;
  b.walk(x, 1);
  if (g.over) return g.over;
  b.faceTo(x, 0);
  g.hand = crown;
  g.useObject(object(g, 'lower', x, 0, 'wall'));
  assert.equal(g.flags.crowned, true);
  b.clear(9, 1, 19, 4);
  if (g.over) return g.over;
  b.rest();
  // Out the way the party came, then dig into Olaf's barrow for his sword.
  b.walk(2, 10);
  if (g.over) return g.over;
  climb(1, 10);
  assert.equal(g.party.level, 'upper');
  b.walk(6, 1);
  if (g.over) return g.over;
  climb(6, 0);
  assert.equal(g.party.level, 'hillside');
  b.walk(11, 2);
  b.faceTo(12, 2);
  g.useObject(g.objectById('rubble'));
  b.walk(12, 2);
  climb(12, 1);
  assert.equal(g.party.level, 'upper');
  b.walk(24, 7);
  if (g.over) return g.over;
  g.useObject(object(g, 'upper', 24, 7, 'ward'));
  g.useObject(object(g, 'upper', 24, 8, 'feature'));
  b.take('wrath');
  b.walk(24, 1);
  if (g.over) return g.over;
  climb(24, 0);
  assert.equal(g.party.level, 'hillside');
  b.walk(2, 2);
  return g.over;
}

test('the barrow can be played to a win, and is fair', async () => {
  const results = { won: 0, lost: 0, unfinished: 0 };
  const killers = {};
  const levels = [];
  let survivors = 0;
  const N = 40;
  for (let seed = 1; seed <= N; seed++) {
    const { g, r } = await start(seed * 6113);
    const out = play(g, r);
    results[out === 'won' ? 'won' : out === 'lost' ? 'lost' : 'unfinished']++;
    if (out === 'lost') {
      const near = g.entities.filter((e) => !e.dead && e.awake && e.level === g.party.level && Math.max(Math.abs(e.x - g.party.x), Math.abs(e.y - g.party.y)) <= 3).map((e) => e.name);
      const key = `${g.party.level}: ${[...new Set(near)].sort().join('+') || 'none'}`;
      killers[key] = (killers[key] ?? 0) + 1;
    }
    if (out === 'won') {
      survivors += g.party.members.filter((x) => !x.dead).length;
      levels.push(Math.max(...g.party.members.map((x) => x.level)));
      assert.match(g.winText, /one brother at last wears the crown/);
    }
  }
  console.log(`barrow bot over ${N} seeds:`, results, `average survivors on a win: ${(survivors / Math.max(1, results.won)).toFixed(1)}`, 'level reached:', [...new Set(levels)], 'lost to:', killers);
  assert.equal(results.unfinished, 0, 'every run must reach an ending');
  assert.ok(results.won >= N * 0.25, `the bot should win a fair share, won ${results.won}/${N}`);
});
