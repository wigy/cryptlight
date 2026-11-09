// The engine, run with a tiny made-up ruleset: proof that it isn't tied to any particular rules.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Game, buildLevel } from '../engine/world.js';

class StubRules {
  id = 'stub'; timeScale = 1; slots = [{ id: 'hand', label: 'Hand' }];
  monsterInfo(e) { return { name: e.name, sprite: 'x', scale: 1, fills: false }; }
  createMonster(_g, proto) { return { kind: 'monster', uid: `${proto}${Math.random()}`, proto, name: proto, hp: 1 }; }
  wake(_g, m) { m.awake = true; }
  itemInfo(i) { return { name: i.proto, icon: 'x', weight: 1, slots: ['hand'] }; }
  canEquip() { return true; }
  tick(game, dt) { this.ticks = (this.ticks ?? 0) + dt; for (const e of game.entities) if (e.awake) game.stepEntityToward(e, game.party.x, game.party.y); }
  light() { return { radius: 5, mono: false, bright: true }; }
  rule(_g, name, args) { this.lastRule = { name, args }; }
  tryUnlock(_g, lock, held) { return held?.proto === lock.key; }
  noticeHidden(_g, dc) { return dc <= 10; }
  consume() { return true; }
}

const MODULE = {
  id: 'stub', name: 'Stub', start: { level: 'a', x: 1, y: 3, dir: 0 },
  levels: {
    a: {
      name: 'A',
      grid: [
        '#######',
        '#..L#T#',
        '#.#.#.#',
        '#.P.Dk#',
        '#.#.#.#',
        '#ps.S.#',
        '#######',
      ],
      legend: {
        L: { type: 'wall', kind: 'lever', onUse: [{ do: 'toggleDoor', door: 'gate' }, { do: 'setFlag', flag: 'pulled' }] },
        P: { id: 'gate', type: 'door', style: 'portcullis', noHandle: true },
        D: { type: 'door', style: 'wood', lock: { key: 'brass' } },
        S: { type: 'door', secret: true, detectDc: 8, foundName: 'a hidden door' },
        k: { type: 'item', proto: 'brass' },
        s: { type: 'zone', once: true, onEnter: [{ do: 'rule', name: 'zap', power: 3 }] },
        p: { type: 'plate', hidden: true, detectDc: 99, onEnter: [{ do: 'setFlag', flag: 'plate' }] },
        T: { type: 'stairs', to: { level: 'b', x: 1, y: 1, dir: 1 } },
      },
    },
    b: { name: 'B', grid: ['###', '#.#', '###'], legend: {} },
  },
};
const fresh = (seed = 1) => { const g = new Game(structuredClone(MODULE), new StubRules(), { seed }); g.start([{ kind: 'pc', name: 'A', equipment: {}, pack: [null, null] }]); return g; };
const run = (g, s) => { for (let t = 0; t < s; t += 0.05) g.tick(0.05); };
/** Steps past the movement cooldown. */
const go = (g, rel) => { run(g, 0.4); return g.step(rel); };

test('the engine imports nothing from any ruleset', () => {
  const root = fileURLToPath(new URL('../engine', import.meta.url));
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
  for (const f of walk(root)) assert.ok(!/from\s+['"].*rules\//.test(readFileSync(f, 'utf8')), f);
});

test('level building infers door direction and wall faces', () => {
  const lv = buildLevel('a', MODULE.levels.a);
  const gate = lv.objects.find((o) => o.id === 'gate');
  assert.equal(gate.axis, 'x'); // Walls north and south, so you pass east-west.
  const lever = lv.objects.find((o) => o.kind === 'lever');
  assert.equal(lever.face, 2); // The first open side, checking N, E, S, W.
  assert.throws(() => buildLevel('x', { grid: ['?'], legend: {} }), /no legend/);
});

test('movement, walls and turning', () => {
  const g = fresh();
  assert.equal(go(g, 0), true);
  assert.deepEqual([g.party.x, g.party.y], [1, 2]);
  assert.equal(go(g, 1), false, 'wall to the east');
  g.turn(1);
  assert.equal(g.party.dir, 1);
  assert.equal(go(g, 3), true, 'sidestep left is now north');
  assert.deepEqual([g.party.x, g.party.y], [1, 1]);
});

test('step cooldown limits movement rate', () => {
  const g = fresh();
  assert.equal(g.step(0), true);
  assert.equal(g.step(0), false);
});

test('levers run scripts; doors take time; closed doors block', () => {
  const g = fresh();
  g.party.x = 1; g.party.y = 3; g.party.dir = 1;
  assert.equal(go(g, 0), false, 'gate is shut');
  const lever = g.objectById(g.level.objects.find((o) => o.kind === 'lever').id);
  g.useObject(lever);
  assert.equal(g.flags.pulled, true);
  run(g, 0.2);
  assert.ok(g.doorAt(2, 3).open > 0 && g.doorAt(2, 3).open < 1);
  run(g, 1);
  assert.equal(g.doorAt(2, 3).open, 1);
  assert.equal(go(g, 0), true);
  assert.equal(g.useObject(g.doorAt(2, 3)), false, 'no handle');
});

test('locks ask the ruleset, and a handed key opens them', () => {
  const g = fresh();
  const d = g.doorAt(4, 3);
  assert.equal(g.useObject(d), false);
  g.hand = { proto: 'brass' };
  assert.equal(g.useObject(d), true);
  assert.equal(d.lock, null);
});

test('items: pick up, equip, swap, drop, throw', () => {
  const g = fresh();
  const [m] = g.party.members;
  const [entry] = g.itemsAt(5, 3);
  assert.ok(g.pickUp(entry));
  assert.equal(g.itemsAt(5, 3).length, 0);
  g.swapSlot(m, 'hand');
  assert.equal(m.equipment.hand.proto, 'brass');
  assert.equal(g.hand, null);
  g.swapSlot(m, 'hand');
  g.swapPack(m, 0);
  assert.equal(m.pack[0].proto, 'brass');
  g.swapPack(m, 0);
  g.putDown();
  assert.equal(g.itemsAt(g.party.x, g.party.y).length, 1);
  g.pickUp(g.itemsAt(g.party.x, g.party.y)[0]);
  g.throwToFloor();
  assert.deepEqual(g.floorItems.map((f) => [f.x, f.y]), [[1, 1]], 'flies until a wall stops it');
});

test('zones and plates fire; once means once; rules hooks are called', () => {
  const g = fresh();
  g.party.x = 1; g.party.y = 5; g.party.dir = 1;
  g.runObjectsAt(1, 5, 'enter');
  assert.equal(g.flags.plate, true);
  go(g, 0);
  assert.deepEqual(g.ruleset.lastRule.name, 'zap');
  g.ruleset.lastRule = null;
  go(g, 2);
  go(g, 0);
  assert.equal(g.ruleset.lastRule, null);
});

test('secret doors stay walls until noticed', () => {
  const g = fresh();
  assert.ok(g.isSolid(4, 5));
  assert.equal(g.revealHidden(1, 9), '');
  assert.ok(g.isSolid(4, 5));
  assert.match(g.revealHidden(20, 9), /hidden door/);
  assert.ok(!g.isSolid(4, 5));
  assert.equal(g.cellAt(4, 5), 'D');
});

test('stairs change level', () => {
  const g = fresh();
  g.party.x = 5; g.party.y = 2; g.party.dir = 0;
  run(g, 0.4);
  g.step(0);
  assert.deepEqual([g.party.level, g.party.x, g.party.y, g.party.dir], ['b', 1, 1, 1]);
});

test('line of sight stops at walls and shut doors, not portcullises', () => {
  const g = fresh();
  assert.equal(g.los(1, 3, 3, 3), true, 'through the portcullis');
  assert.equal(g.los(3, 3, 5, 3), false, 'through the wooden door');
  assert.equal(g.los(1, 1, 3, 3), false, 'through the wall');
});

test('cover: none down a straight corridor, some around a corner, both ways', () => {
  const g = fresh();
  g.party.x = 1; g.party.y = 3;
  const [me] = g.party.members;
  const ahead = g.spawnMonster('m', 1, 1, 'a');
  assert.deepEqual(g.sightCover(ahead, me), { walls: 0, creatures: 0 }, 'straight up the corridor');
  assert.deepEqual(g.sightCover(me, ahead), { walls: 0, creatures: 0 });
  const round = g.spawnMonster('m', 2, 1, 'a');
  g.party.y = 4; // Two squares down the side passage.
  round.sx = 0; round.sy = 0; // The far half of its square, away from the corner.
  assert.ok(g.canSee(round, me));
  assert.ok(g.sightCover(round, me).walls > 0, 'the wall shields the party');
  assert.ok(g.sightCover(me, round).walls > 0, 'and the monster');
  round.sy = 1; // Tucked in behind the corner: no line between the two at all.
  assert.equal(g.canSee(round, me), false);
});

test('line of sight runs between where creatures stand, the same both ways', () => {
  const g = fresh();
  const spots = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (g.blocksSight(x, y)) continue;
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const m = g.spawnMonster('m', x, y, 'a'); m.sx = sx; m.sy = sy; spots.push(m); }
  }
  for (const a of spots) for (const b of spots) assert.equal(g.canSee(a, b), g.canSee(b, a), `${a.x},${a.y} and ${b.x},${b.y}`);
  const [a, b] = [spots.find((m) => m.x === 1 && m.y === 1), spots.find((m) => m.x === 3 && m.y === 3)];
  assert.equal(g.canSee(a, b), false, 'through the wall');
});

test('creatures in the way give cover, friend or foe', () => {
  const g = new Game(structuredClone(MODULE), new StubRules(), {});
  g.start([0, 1, 2, 3].map((i) => ({ kind: 'pc', name: `P${i}`, equipment: {}, pack: [] })));
  g.party.x = 1; g.party.y = 3; g.party.dir = 0;
  const foe = g.spawnMonster('m', 1, 1, 'a');
  const [front, , back] = g.party.members;
  assert.equal(g.sightCover(foe, front).creatures, 0, 'nobody between the foe and the front rank');
  assert.ok(g.sightCover(foe, back).creatures > 0, 'the front rank covers the back rank');
  assert.ok(g.sightCover(back, foe).creatures > 0, 'and the foe from the back rank');
});

test('five-foot positions: front rank is next to the cell ahead, back rank is not', () => {
  const g = new Game(structuredClone(MODULE), new StubRules(), {});
  g.start([0, 1, 2, 3].map((i) => ({ kind: 'pc', name: `P${i}`, equipment: {}, pack: [] })));
  g.party.x = 1; g.party.y = 3; g.party.dir = 0;
  const foe = g.spawnMonster('m', 1, 2, 'a');
  foe.sy = 1; foe.sx = 0;
  const [frontLeft, frontRight, backLeft] = g.party.members;
  assert.equal(g.feet(frontLeft, foe), 5);
  assert.equal(g.feet(frontRight, foe), 5);
  assert.equal(g.feet(backLeft, foe), 10);
  g.party.dir = 2; // Turned around: the former rear rank now holds the north side.
  assert.equal(g.feet(g.party.members[2], foe), 5);
  assert.equal(g.feet(g.party.members[0], foe), 10);
});

test('swapping members changes their ranks, takes as long as a step and waits for the last one', () => {
  const g = new Game(structuredClone(MODULE), new StubRules(), {});
  g.start([0, 1, 2, 3].map((i) => ({ kind: 'pc', name: `P${i}`, equipment: {}, pack: [] })));
  g.party.x = 1; g.party.y = 3; g.party.dir = 0;
  const foe = g.spawnMonster('m', 1, 2, 'a');
  foe.sy = 1; foe.sx = 0;
  const [first, , third] = g.party.members;
  assert.equal(g.feet(first, foe), 5);
  assert.equal(g.feet(third, foe), 10);
  assert.equal(g.swapMembers(0, 2), true);
  assert.equal(g.party.members[0], third);
  assert.equal(g.feet(first, foe), 10);
  assert.equal(g.feet(third, foe), 5);
  assert.equal(g.swapMembers(0, 2), false, 'still moving');
  g.party.stepReadyAt = 0;
  assert.equal(g.swapMembers(1, 1), false, 'not with themselves');
  g.paused = true;
  assert.equal(g.swapMembers(0, 2), false, 'not while paused');
});

test('a ward holds back what it names until it is broken, and scripts can wake by tag and remove objects', () => {
  const module = structuredClone(MODULE);
  const level = module.levels.a;
  level.grid = ['#####', '#.W.#', '#.R.#', '#####'];
  level.legend = {
    W: { id: 'line', type: 'ward', holdsTag: 'spirit', holdsItem: 'crown', text: 'A line of salt.', refuseText: 'The crown will not pass.', breakText: 'Scuffed.', onBreak: [{ do: 'setFlag', flag: 'broken' }] },
    R: { id: 'rock', type: 'feature', sprite: 'x', blocks: true },
  };
  const g = new Game(module, new StubRules(), {});
  g.start([{ kind: 'pc', name: 'A', equipment: {}, pack: [] }]);
  g.teleport({ level: 'a', x: 1, y: 1, dir: 1 });
  const spirit = g.spawnMonster('m', 3, 1, 'a', { tag: 'spirit', onWake: [{ do: 'setFlag', flag: 'woke' }] });
  const skeleton = g.spawnMonster('m', 3, 1, 'a');
  assert.equal(g.canEnter(spirit, 2, 1), false, 'the tagged are held');
  assert.equal(g.canEnter(skeleton, 2, 1), true, 'others are not');
  g.hand = { proto: 'crown' };
  assert.equal(g.step(0), false, 'nor can the party carry the item past');
  assert.equal(g.logLines.at(-1).text, 'The crown will not pass.');
  g.hand = null;
  assert.equal(g.step(0), true, 'the party itself passes');
  assert.equal(g.logLines.at(-1).text, 'A line of salt.');
  assert.equal(g.useObject(g.objectById('line')), true);
  assert.equal(g.flags.broken, true);
  g.party.x = 1; // Nobody can enter the party's own cell.
  assert.equal(g.canEnter(spirit, 2, 1), true);
  assert.equal(g.useObject(g.objectById('line')), false, 'it only breaks once');
  assert.equal(spirit.awake, undefined);
  g.run([{ do: 'wake', tag: 'spirit' }]);
  assert.equal(spirit.awake, true);
  assert.equal(skeleton.awake, undefined, 'only that tag');
  assert.equal(g.isPassable(2, 2), false);
  g.run([{ do: 'removeObject', id: 'rock' }]);
  assert.equal(g.isPassable(2, 2), true);
  assert.equal(g.objectById('rock'), null);
});

test('stairs can wait for a flag, and an alcove can keep what it was given', () => {
  const module = structuredClone(MODULE);
  module.levels.a.grid = ['#####', '#S..#', '#.A.#', '#####'];
  module.levels.a.legend = {
    S: { type: 'stairs', direction: 'up', to: { level: 'a', x: 3, y: 1, dir: 0 }, needsFlag: 'open', blockedText: 'Shut.' },
    A: { id: 'throne', type: 'wall', kind: 'alcove', art: 'throne', wants: 'crown', keepsFlag: 'crowned', keptText: 'It stays.', onWanted: [{ do: 'setFlag', flag: 'crowned' }] },
  };
  const g = new Game(module, new StubRules(), {});
  g.start([{ kind: 'pc', name: 'A', equipment: {}, pack: [] }]);
  g.teleport({ level: 'a', x: 1, y: 2, dir: 0 });
  g.step(0);
  assert.deepEqual([g.party.x, g.party.y], [1, 2], 'stays put while shut');
  assert.equal(g.logLines.at(-1).text, 'Shut.');
  g.flags.open = true;
  g.party.stepReadyAt = 0;
  g.step(0);
  assert.deepEqual([g.party.x, g.party.y], [3, 1]);
  const throne = g.objectById('throne');
  g.hand = { proto: 'ring' };
  g.useObject(throne);
  assert.equal(g.hand, null);
  g.useObject(throne);
  assert.equal(g.hand?.proto, 'ring', 'still free to take back before the flag');
  g.hand = { proto: 'crown' };
  g.useObject(throne);
  assert.equal(g.flags.crowned, true);
  g.hand = null;
  assert.equal(g.useObject(throne), false);
  assert.equal(g.hand, null);
  assert.equal(g.logLines.at(-1).text, 'It stays.');
});

test('creatures find a path, share a cell up to four, and never enter the party', () => {
  const g = fresh();
  g.party.x = 3; g.party.y = 5;
  g.setDoor('gate', 1); run(g, 1);
  const foes = [0, 1, 2, 3, 4].map(() => g.spawnMonster('m', 1, 1, 'a', { awake: true }));
  run(g, 4);
  for (const f of foes) assert.ok(!(f.x === g.party.x && f.y === g.party.y));
  const counts = {};
  for (const f of foes) counts[`${f.x},${f.y}`] = (counts[`${f.x},${f.y}`] ?? 0) + 1;
  for (const n of Object.values(counts)) assert.ok(n <= 4);
  const seats = new Set(foes.map((f) => `${f.x},${f.y},${f.sx},${f.sy}`));
  assert.equal(seats.size, foes.length, 'each holds its own square');
});

test('save and load restore the whole world', () => {
  const g = fresh(42);
  go(g, 0);
  g.flags.test = 1;
  g.setDoor('gate', 1); run(g, 1);
  const before = [g.rng.next(), g.rng.next()];
  const saved = g.serialize();
  const after = fresh(1);
  assert.throws(() => { const other = new Game({ ...structuredClone(MODULE), id: 'other' }, new StubRules()); other.restore(saved); }, /different game/);
  after.restore(saved);
  assert.deepEqual([after.party.x, after.party.y, after.flags.test, after.doorAt(2, 3).open], [g.party.x, g.party.y, 1, 1]);
  assert.notDeepEqual([after.rng.next()], [before[0]]);
});
