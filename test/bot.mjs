// A bot that plays an adventure through the same calls the UI makes.
import assert from 'node:assert/strict';
import { DIRS } from '../engine/world.js';
import { isDown } from '../rules/srd5/core.js';

const DT = 0.1;

export class Bot {
  constructor(game, ruleset) { this.g = game; this.r = ruleset; this.guard = 0; }

  tick(s = DT) { for (let t = 0; t < s; t += DT) { this.g.tick(DT); this.fight(); if (this.g.over) return; } }

  /** Everyone acts whenever they can. */
  fight() {
    const g = this.g, r = this.r;
    if (g.over) return;
    const m = g.party.members;
    const hurt = m.filter((x) => !x.dead && x.hp * 2 < x.maxHp).sort((a, b) => a.hp - b.hp)[0];
    const near = g.entities.filter((e) => e.level === g.party.level && !e.dead && e.awake && Math.max(Math.abs(e.x - g.party.x), Math.abs(e.y - g.party.y)) <= 6 && g.los(g.party.x, g.party.y, e.x, e.y));
    // Face whoever is adjacent, so ranged attackers have something ahead.
    if (near.length && !near.some((e) => g.forwardness(e) >= 0.5)) {
      const e = near[0];
      for (let d = 0; d < 4; d++) {
        const dx = Math.sign(e.x - g.party.x), dy = Math.sign(e.y - g.party.y);
        if (DIRS[g.party.dir].x === (Math.abs(e.x - g.party.x) >= Math.abs(e.y - g.party.y) ? dx : 0) && DIRS[g.party.dir].y === (Math.abs(e.x - g.party.x) >= Math.abs(e.y - g.party.y) ? 0 : dy)) break;
        g.turn(1);
      }
    }
    m.forEach((x, i) => {
      if (x.dead || isDown(x)) return;
      const acts = () => r.memberActions(g, x);
      const can = (id) => acts().some((a) => a.id === id && a.enabled);
      if (hurt && x.bonusReadyAt <= g.time) {
        if (x.classId === 'fighter' && x === hurt && can('second-wind')) r.doAction(g, x, 'second-wind');
      }
      // Drink a potion when badly hurt, as a player would, going through the hand as the UI does.
      if (x.hp * 3 < x.maxHp && !g.hand) {
        const owner = m.find((o) => o.pack.some((it) => it?.proto === 'potion-of-healing'));
        if (owner) {
          const slot = owner.pack.findIndex((it) => it?.proto === 'potion-of-healing');
          g.swapPack(owner, slot);
          g.consumeHand(x);
          if (g.hand) g.swapPack(owner, slot);
        }
      }
      if (x.actionReadyAt > g.time) return;
      const heal = hurt && x.prepared.includes('cure-wounds') && x.slots.used < x.slots.max && g.feet(x, hurt) <= 10;
      if (heal) { r.doAction(g, x, `cast-cure-wounds:${m.indexOf(hurt)}`); return; }
      if (!near.length) return;
      if (x.cantrips.includes('fire-bolt')) {
        const big = near.length && x.prepared.includes('magic-missile') && x.slots.used < x.slots.max && near.some((e) => e.maxHp >= 20);
        r.doAction(g, x, big ? 'cast:magic-missile' : 'cast:fire-bolt');
      } else if (i >= 2 && x.cantrips.includes('sacred-flame')) r.doAction(g, x, 'cast:sacred-flame');
      else {
        r.doAction(g, x, 'attack:main');
        const off = x.equipment.offHand;
        if (off && acts().some((a) => a.id === 'attack:off' && a.enabled)) r.doAction(g, x, 'attack:off');
      }
    });
  }

  faceTo(tx, ty) {
    const g = this.g;
    for (let i = 0; i < 4; i++) {
      const f = DIRS[g.party.dir];
      if (g.party.x + f.x === tx && g.party.y + f.y === ty) return true;
      g.turn(1);
    }
    return false;
  }

  /** Walks to a cell by the shortest route, fighting anything met on the way. */
  walk(tx, ty) {
    const g = this.g;
    for (let n = 0; n < 4000 && !g.over; n++) {
      if (g.party.x === tx && g.party.y === ty) return true;
      if (this.threat()) { this.tick(0.5); continue; }
      const step = this.route(tx, ty);
      assert.ok(step, `no route from ${g.party.x},${g.party.y} to ${tx},${ty} on ${g.party.level}`);
      if (g.doorAt(step.x, step.y) && g.doorAt(step.x, step.y).open < 0.9) {
        const d = g.doorAt(step.x, step.y);
        if (!d.target && !d.noHandle) g.useObject(d);
        this.tick(0.5);
        continue;
      }
      for (let d = 0; d < 4; d++) {
        const f = DIRS[(g.party.dir + d) % 4];
        if (g.party.x + f.x === step.x && g.party.y + f.y === step.y) { g.step(d); break; }
      }
      this.tick(0.4);
    }
    return g.party.x === tx && g.party.y === ty;
  }

  threat() {
    const g = this.g;
    return g.entities.some((e) => e.level === g.party.level && !e.dead && e.awake && Math.max(Math.abs(e.x - g.party.x), Math.abs(e.y - g.party.y)) <= 3 && g.los(g.party.x, g.party.y, e.x, e.y));
  }

  /** Next cell toward a target, avoiding known pits and going through workable doors. */
  route(tx, ty) {
    const g = this.g;
    const open = (x, y) => {
      if (g.isSolid(x, y)) return false;
      const d = g.doorAt(x, y);
      if (d && d.noHandle && d.open < 0.9) return false;
      if (g.objectsAt(x, y).some((o) => (o.type === 'pit') || (o.type === 'feature' && o.blocks))) return false;
      return true;
    };
    const dist = new Map([[`${tx},${ty}`, 0]]);
    let frontier = [[tx, ty]];
    while (frontier.length) {
      const next = [];
      for (const [x, y] of frontier) for (const d of DIRS) {
        const k = `${x + d.x},${y + d.y}`;
        if (!dist.has(k) && open(x + d.x, y + d.y)) { dist.set(k, dist.get(`${x},${y}`) + 1); next.push([x + d.x, y + d.y]); }
      }
      frontier = next;
    }
    let best = null, bestD = dist.get(`${g.party.x},${g.party.y}`);
    if (bestD === undefined) return null;
    for (const d of DIRS) {
      const nx = g.party.x + d.x, ny = g.party.y + d.y, v = dist.get(`${nx},${ny}`);
      if (v !== undefined && v < bestD && !g.occupants(nx, ny, g.party.level).length) { best = { x: nx, y: ny }; bestD = v; }
    }
    return best;
  }

  /** Clears every monster in a rectangle, walking up to each. */
  clear(x0, y0, x1, y1) {
    const g = this.g;
    for (let n = 0; n < 400 && !g.over; n++) {
      const foes = g.entities.filter((e) => e.level === g.party.level && !e.dead && e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1);
      if (!foes.length) break;
      if (this.threat()) { this.tick(1); continue; }
      const e = foes[0];
      const spot = DIRS.map((d) => [e.x + d.x, e.y + d.y]).find(([x, y]) => g.isPassable(x, y) && !g.occupants(x, y, g.party.level).length);
      if (!spot) { this.tick(1); continue; }
      this.walk(spot[0], spot[1]);
      this.faceTo(e.x, e.y);
      this.tick(1);
    }
    this.tick(1);
  }

  rest(kind = 'short') {
    const g = this.g;
    if (g.over) return;
    const low = g.party.members.some((m) => !m.dead && m.hp < m.maxHp * 0.6);
    if (kind === 'long' || low) {
      for (let i = 0; i < 40 && g.ruleset.canRest(g); i++) this.tick(0.5);
      g.ruleset.rest(g, kind);
    }
  }

  take(proto) {
    const g = this.g;
    if (g.over) return;
    const e = g.itemsAt(g.party.x, g.party.y).find((f) => f.item.proto === proto);
    assert.ok(e, `${proto} is on the floor here`);
    g.pickUp(e);
    const m = g.party.members.find((x) => !x.dead);
    const free = m.pack.indexOf(null);
    assert.ok(free >= 0);
    g.swapPack(m, free);
  }

  useWall(x, y, wx, wy) {
    this.walk(x, y);
    if (this.g.over) return;
    assert.ok(this.faceTo(wx, wy));
    const o = this.g.objectsAt(wx, wy).find((w) => w.type === 'wall');
    assert.ok(o, `fixture at ${wx},${wy}`);
    this.g.useObject(o);
    this.tick(1.5);
  }
}
