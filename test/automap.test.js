// The automap records what the party has walked and seen, per level, and survives saving.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { floorColor } from '../engine/ui/automap.js';
import { newGame } from './helpers.mjs';

const at = (g, x, y, level = g.level) => level.explored?.[y * level.width + x];
const age = (g, x, y, level = g.level) => g.party.walked - level.visitedAt?.[y * level.width + x];

test('the start cell is visited and only what lies ahead is seen', async () => {
  const { game: g } = await newGame();
  const { x, y, dir } = g.party; // Starts at 11,20 facing north, with a closed door at 11,18.
  assert.deepEqual([x, y, dir], [11, 20, 0]);
  assert.equal(at(g, 11, 20), 2);
  assert.equal(at(g, 11, 19), 1, 'ahead');
  assert.equal(at(g, 11, 18), 1, 'the door itself');
  assert.equal(at(g, 11, 17), 0, 'nothing shows through a closed door');
  assert.equal(at(g, 11, 21), 0, 'behind the party');
});

test('turning, walking and opening doors reveal more', async () => {
  const { game: g } = await newGame();
  g.turn(1); g.turn(1);
  g.tick(0.05);
  assert.equal(at(g, 11, 21), 1, 'turning around shows what was behind');
  g.turn(1); g.turn(1);
  g.tick(0.05);
  g.step(0);
  g.tick(0.05);
  assert.equal(at(g, 11, 19), 2, 'walking marks the cell visited');
  assert.equal(at(g, 11, 20), 2, 'and it stays visited');
  g.doorAt(11, 18).open = 1;
  g.tick(0.05);
  assert.equal(at(g, 11, 17), 1, 'an open door lets the view through');
});

test('sight stops where the light does', async () => {
  const { game: g } = await newGame();
  g.teleport({ level: 'warren', x: 3, y: 11, dir: 1 });
  g.tick(0.05);
  assert.equal(at(g, 7, 11), 1, 'inside torchlight');
  assert.equal(at(g, 9, 11), 0, 'beyond it');
});

test('each level has its own map, and maps survive save and load', async () => {
  const { game: g } = await newGame();
  const warren = g.level;
  const before = warren.explored.filter(Boolean).length;
  g.teleport({ level: 'crypt', x: 2, y: 2, dir: 1 });
  g.tick(0.05);
  assert.equal(at(g, 2, 2), 2);
  assert.equal(warren.explored.filter(Boolean).length, before, 'the crypt does not touch the warren');
  const saved = g.serialize();
  const { game: other } = await newGame(2);
  other.restore(saved);
  assert.equal(other.party.level, 'crypt');
  assert.equal(at(other, 2, 2), 2);
  assert.equal(other.levels.warren.explored.filter(Boolean).length, before);
});

test('a save from before the automap still loads and starts mapping', async () => {
  const { game: g } = await newGame();
  const saved = JSON.parse(g.serialize());
  for (const l of Object.values(saved.levels)) delete l.explored;
  const { game: other } = await newGame(2);
  other.restore(JSON.stringify(saved));
  other.tick(0.05);
  assert.equal(at(other, 11, 20), 2);
});

test('a walked cell ages by one for each new square, and turning does not age it', async () => {
  const { game: g } = await newGame();
  g.tick(0.05);
  assert.equal(age(g, 11, 20), 0, 'standing on it');
  assert.ok(Number.isNaN(age(g, 11, 19)), 'seen but never walked has no age');
  g.turn(1); g.tick(0.05); g.turn(-1); g.tick(0.05);
  assert.equal(age(g, 11, 20), 0, 'turning on the spot');
  g.step(0); g.tick(0.05);
  assert.equal(age(g, 11, 19), 0);
  assert.equal(age(g, 11, 20), 1);
  g.tick(0.5); // Let the step finish.
  g.step(2); g.tick(0.05);
  assert.equal(age(g, 11, 20), 0, 'walking back makes it new again');
  assert.equal(age(g, 11, 19), 1);
});

test('cell ages survive save and load, and leaving a level keeps them counting', async () => {
  const { game: g } = await newGame();
  const warren = g.level;
  g.tick(0.05);
  g.teleport({ level: 'crypt', x: 2, y: 2, dir: 1 });
  g.tick(0.05);
  assert.equal(age(g, 11, 20, warren), 1);
  const { game: other } = await newGame(2);
  other.restore(g.serialize());
  other.tick(0.05);
  assert.equal(age(other, 2, 2), 0);
  assert.equal(age(other, 11, 20, other.levels.warren), 1);
});

test('a save from before cell ages shows walked cells as plain floor', async () => {
  const { game: g } = await newGame();
  g.tick(0.05);
  const saved = JSON.parse(g.serialize());
  for (const l of Object.values(saved.levels)) delete l.visitedAt;
  delete saved.party.walked;
  const { game: other } = await newGame(2);
  other.restore(JSON.stringify(saved));
  assert.equal(floorColor(other.party.walked - other.level.visitedAt?.[0]), floorColor(Infinity));
  other.tick(0.05);
  assert.equal(age(other, 11, 20), 0);
});

test('floor colour fades evenly from visited to plain over ten squares', () => {
  const channels = (c) => c.match(/\d+/g).map(Number);
  assert.deepEqual(channels(floorColor(0)), [0xd0, 0xb9, 0x83], 'newest is the visited colour');
  assert.equal(floorColor(10), '#7d6c4c', 'plain floor from ten squares on');
  assert.equal(floorColor(500), '#7d6c4c');
  assert.equal(floorColor(NaN), '#7d6c4c', 'never walked');
  for (let a = 1; a < 10; a++) assert.ok(channels(floorColor(a))[0] < channels(floorColor(a - 1))[0], `age ${a} is dimmer than ${a - 1}`);
  assert.ok(channels(floorColor(9))[0] > 0x7d, 'age 9 is still brighter than plain floor');
});
