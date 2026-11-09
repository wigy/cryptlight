// A bot plays the real adventure from the first step to the win, through the same calls the UI makes.
// That proves it can be finished, and many seeds give a rough idea of its difficulty.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bot } from './bot.mjs';
import { newGame } from './helpers.mjs';

function play(game, ruleset) {
  const b = new Bot(game, ruleset);
  const g = game;
  // Warren: rats, goblins, the guard room's lever, Skarn, the key, the iron door, the stairs.
  b.walk(11, 19);
  assert.ok(g.itemsAt(11, 19).length, 'the first potion is by the door');
  b.take('potion-of-healing');
  b.clear(8, 14, 14, 17);
  b.rest();
  b.clear(18, 14, 24, 17);
  const chest = g.objectsAt(19, 17).find((o) => o.type === 'feature');
  if (!g.over) { b.walk(18, 17); b.faceTo(19, 17); g.useObject(chest); }
  b.rest();
  b.clear(15, 2, 21, 6);
  b.rest();
  b.useWall(21, 4, 22, 4);
  if (g.over) return g.over;
  assert.ok(g.objectById('boss-gate').target === 1, 'lever raises the gate');
  b.tick(1);
  b.clear(3, 1, 9, 5);
  b.rest('long');
  const hoard = g.objectsAt(8, 5).find((o) => o.type === 'feature');
  if (!g.over) { b.walk(8, 4); b.faceTo(8, 5); g.useObject(hoard); b.walk(8, 5); b.take('iron-key'); b.take('potion-of-healing'); }
  if (g.over) return g.over;
  b.walk(4, 11);
  b.faceTo(3, 11);
  assert.ok(g.useObject(g.doorAt(3, 11)), 'the key opens the iron door');
  b.tick(1.5);
  b.walk(2, 11);
  b.faceTo(1, 11);
  g.step(g.party.dir === 3 ? 0 : 0);
  assert.equal(g.party.level, 'crypt', 'stairs lead down');

  // Crypt: skeletons, zombies and a lever, cultists and another lever, then Vesper.
  assert.ok(g.party.members.filter((x) => !x.dead).every((x) => x.xp >= 50), 'milestone awarded');
  b.walk(8, 3);
  b.walk(8, 4); // The hidden plate is on the upper row; the lower is safe.
  b.walk(14, 4);
  b.clear(16, 2, 23, 6);
  b.rest();
  b.clear(25, 3, 28, 6);
  b.rest();
  b.useWall(28, 4, 29, 4);
  if (g.over) return g.over;
  b.clear(18, 9, 26, 12);
  b.rest();
  b.useWall(22, 9, 22, 8);
  if (g.over) return g.over;
  assert.ok(g.objectById('ritual-door').target === 1, 'both levers open the ritual door');
  b.tick(1);
  b.rest('long');
  if (g.over) return g.over;
  b.clear(3, 9, 11, 13);
  if (g.over) return g.over;
  b.walk(7, 11);
  if (g.over) return g.over;
  const stone = g.itemsAt(7, 11).find((f) => f.item.proto === 'wellstone');
  assert.ok(stone, 'Vesper drops the Wellstone');
  g.pickUp(stone);
  const held = g.hand;
  g.hand = null;
  const m = g.party.members.find((x) => !x.dead);
  m.pack[m.pack.indexOf(null)] = held;
  b.walk(4, 1);
  b.faceTo(4, 0);
  m.pack[m.pack.indexOf(held)] = null;
  g.hand = held;
  g.useObject(g.objectsAt(4, 0).find((o) => o.kind === 'alcove'));
  return g.over;
}

test('the adventure can be played to a win, and is fair', async () => {
  const results = { won: 0, lost: 0, unfinished: 0 };
  const killers = {};
  const levels = [];
  let survivors = 0;
  const N = 40;
  for (let seed = 1; seed <= N; seed++) {
    const { game, ruleset } = await newGame(seed * 7919);
    const out = play(game, ruleset);
    results[out === 'won' ? 'won' : out === 'lost' ? 'lost' : 'unfinished']++;
    if (out === 'lost') {
      const near = game.entities.filter((e) => !e.dead && e.awake && e.level === game.party.level && Math.max(Math.abs(e.x - game.party.x), Math.abs(e.y - game.party.y)) <= 3).map((e) => e.name.replace(/ .*/, ''));
      const key = [...new Set(near)].sort().join('+') || 'none';
      killers[key] = (killers[key] ?? 0) + 1;
    }
    if (out === 'won') {
      survivors += game.party.members.filter((x) => !x.dead).length;
      levels.push(Math.max(...game.party.members.map((x) => x.level)));
      assert.match(game.winText, /Clear water/);
    }
  }
  console.log(`bot over ${N} seeds:`, results, `average survivors on a win: ${(survivors / Math.max(1, results.won)).toFixed(1)}`, 'level reached:', [...new Set(levels)], 'lost to:', killers);
  assert.equal(results.unfinished, 0, 'every run must reach an ending');
  assert.ok(results.won >= N * 0.25, `the bot should win a fair share, won ${results.won}/${N}`);
  assert.ok(results.lost >= 1 || results.won === N, 'sanity');
  assert.ok(levels.every((l) => l === 2), 'finishing reaches level 2');
});
