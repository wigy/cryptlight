import { readFileSync } from 'node:fs';
import { loadSrd } from '../rules/srd5/data.js';
import { Srd5Ruleset } from '../rules/srd5/ruleset.js';
import { Game } from '../engine/world.js';

const readJson = async (n) => JSON.parse(readFileSync(new URL(`../data/srd/${n}.json`, import.meta.url)));
export const loadModule = () => JSON.parse(readFileSync(new URL('../modules/thornwick/module.json', import.meta.url)));
export const srdChapters = () => JSON.parse(readFileSync(new URL('../data/srd/chapters.json', import.meta.url)));

export async function newGame(seed = 1, module = loadModule()) {
  const srd = await loadSrd(readJson);
  const ruleset = new Srd5Ruleset(srd, module.items);
  const game = new Game(module, ruleset, { seed });
  game.start(ruleset.defaultParty());
  return { game, ruleset, srd };
}

/** A fixed die: returns the given values in turn. */
export function fakeRng(values, fallback = 10) {
  const q = [...values];
  return { int: (min, max) => (q.length ? q.shift() : Math.min(max, Math.max(min, fallback))), pick: (l) => l[0], next: () => 0.5 };
}
export const tick = (game, seconds, dt = 0.05) => { for (let t = 0; t < seconds; t += dt) game.tick(dt); };
