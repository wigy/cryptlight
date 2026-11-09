// The generic game world: a real-time, party-based, first-person grid dungeon.
// Knows nothing about any particular rules; see docs/ENGINE.md for the ruleset and module contracts.
import { Rng } from './rng.js';

export const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]; // N E S W
const LOG_LIMIT = 60;
const DOOR_SPEED = 1.4; // Fractions of a door per real second.
const UNSEEN = 0, SEEN = 1, VISITED = 2; // Values in level.explored, one per cell.

const clone = (x) => structuredClone(x);

/** Builds a level's mutable state from its module definition: cell chars plus placed objects. */
export function buildLevel(id, def) {
  const rows = def.grid;
  const width = Math.max(...rows.map((r) => r.length));
  const cells = rows.map((r) => r.padEnd(width, ' ').split(''));
  const objects = [];
  const spawns = [];
  let nextId = 1;
  cells.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === '#' || ch === '.' || ch === ' ') return;
    const defs = def.legend?.[ch];
    if (!defs) throw new Error(`level ${id}: no legend for '${ch}' at ${x},${y}`);
    let base = '.';
    for (const raw of Array.isArray(defs) ? defs : [defs]) {
      const o = { ...clone(raw), x, y, level: id };
      o.id ??= `${id}:${o.type}:${nextId++}`;
      switch (o.type) {
        case 'door': base = o.secret ? 'S' : 'D'; o.open = o.startOpen ? 1 : 0; o.target = o.open; objects.push(o); break;
        case 'wall': base = '#'; objects.push(o); break;
        case 'stairs': base = '<'; objects.push(o); break;
        case 'item': case 'monster': spawns.push(o); break;
        default: objects.push(o);
      }
    }
    row[x] = base;
  }));
  for (const o of objects) {
    if (o.type === 'door') o.axis = isSolidChar(cells, o.x - 1, o.y) ? 'y' : 'x'; // Which way you pass through.
    if (o.type === 'wall') o.face ??= autoFace(cells, o.x, o.y);
    if (o.type === 'stairs') o.face ??= autoFace(cells, o.x, o.y);
  }
  return { id, name: def.name, textures: def.textures ?? {}, width, height: cells.length, cells, objects, spawns };
}
const isSolidChar = (cells, x, y) => { const c = cells[y]?.[x]; return c === undefined || c === '#' || c === ' ' || c === 'S' || c === '<'; };
function autoFace(cells, x, y) {
  for (let d = 0; d < 4; d++) if (!isSolidChar(cells, x + DIRS[d].x, y + DIRS[d].y)) return d;
  return 0;
}

export class Game {
  constructor(module, ruleset, { seed = Date.now() >>> 0, listeners = {} } = {}) {
    this.module = module;
    this.ruleset = ruleset;
    this.rng = new Rng(seed);
    this.listeners = listeners;
    this.time = 0;       // Game seconds.
    this.realTime = 0;   // Seconds played.
    this.paused = false;
    this.over = null;    // null | 'won' | 'lost'
    this.fx = [];
    this.memberFx = new Map();
    this.logLines = [];
    this.flags = {};
    this.entities = [];
    this.floorItems = [];
    this.levels = {};
    this.hand = null;
    this.party = null;
    this.lastAlert = -100;
  }

  /** Starts a new game with a party from the ruleset. */
  start(members) {
    for (const [id, def] of Object.entries(this.module.levels)) {
      const level = buildLevel(id, def);
      this.levels[id] = level;
      for (const s of level.spawns) {
        if (s.type === 'item') this.dropItem(this.instantiateItem(s), s.x, s.y, id);
        else this.spawnMonster(s.proto, s.x, s.y, id, s);
      }
      delete level.spawns;
    }
    const st = this.module.start;
    this.party = { x: st.x, y: st.y, dir: st.dir ?? 0, level: st.level, members, stepReadyAt: 0, focus: null };
    this.ruleset.onNewGame?.(this);
    if (this.module.intro) for (const line of this.module.intro) this.log(line, 9);
    this.runObjectsAt(this.party.x, this.party.y, 'enter');
    this.updateExplored();
  }

  instantiateItem(s) {
    const it = { uid: `i${this.rng.int(0, 1e9).toString(36)}${Math.floor(this.rng.next() * 1e9).toString(36)}`, proto: s.proto };
    if (s.qty) it.qty = s.qty;
    return it;
  }

  get level() { return this.levels[this.party.level]; }

  // ---------------------------------------------------------------- notifications
  log(text, color = 5) {
    this.logLines.push({ text, color, at: this.realTime });
    if (this.logLines.length > LOG_LIMIT) this.logLines.shift();
    this.listeners.log?.(text, color);
  }
  sound(name) { this.listeners.sound?.(name); }
  fxBolt(color, target) {
    const f = DIRS[this.party.dir];
    this.fx.push({ kind: 'bolt', color, born: this.realTime, life: 0.28, fromX: this.party.x + 0.5 + f.x * 0.2, fromY: this.party.y + 0.5 + f.y * 0.2, toX: target.x + 0.5, toY: target.y + 0.5 });
  }
  fxBoltFrom(entity, color) {
    this.fx.push({ kind: 'bolt', color, born: this.realTime, life: 0.28, fromX: entity.x + 0.5, fromY: entity.y + 0.5, toX: this.party.x + 0.5, toY: this.party.y + 0.5 });
  }
  /** A melee attack on the party, once per attacker at any one moment: returns false if this one already showed. */
  fxSlash(entity) {
    if (this.fx.some((f) => f.kind === 'slash' && f.from === entity.uid && f.born === this.realTime)) return false;
    this.fx.push({ kind: 'slash', from: entity.uid, born: this.realTime, life: 0.4, x: entity.x + 0.5, y: entity.y + 0.5 });
    return true;
  }
  fxHit(entity, amount) { entity.hitAt = this.realTime; entity.hitAmount = amount; }
  memberHit(member, amount) { this.memberFx.set(member, { at: this.realTime, amount }); }
  gameOver() { if (!this.over) { this.over = 'lost'; this.sound('down'); this.listeners.over?.('lost'); } }
  win(text) { if (!this.over) { this.over = 'won'; this.winText = text; this.sound('level'); this.listeners.over?.('won'); } }

  // ---------------------------------------------------------------- map queries
  cellAt(x, y, level = this.party.level) { return this.levels[level].cells[y]?.[x] ?? ' '; }
  objectsAt(x, y, level = this.party.level) { return this.levels[level].objects.filter((o) => o.x === x && o.y === y); }
  doorAt(x, y, level = this.party.level) { return this.levels[level].objects.find((o) => o.type === 'door' && o.x === x && o.y === y); }
  objectById(id) {
    for (const level of Object.values(this.levels)) {
      const found = level.objects.find((o) => o.id === id);
      if (found) return found;
    }
    return null;
  }
  isSolid(x, y, level = this.party.level) {
    const c = this.cellAt(x, y, level);
    return c === '#' || c === ' ' || c === 'S' || c === '<';
  }
  blocksSight(x, y, level = this.party.level) {
    if (this.isSolid(x, y, level)) return true;
    const d = this.cellAt(x, y, level) === 'D' && this.doorAt(x, y, level);
    return !!d && d.open < 0.5 && d.style !== 'portcullis';
  }
  isPassable(x, y, level = this.party.level) {
    if (this.isSolid(x, y, level)) return false;
    if (this.cellAt(x, y, level) === 'D') { const d = this.doorAt(x, y, level); if (d && d.open < 0.9) return false; }
    return !this.objectsAt(x, y, level).some((o) => o.type === 'feature' && o.blocks);
  }

  /** Grid line of sight between two cells; corners block when both sides are solid. */
  los(x0, y0, x1, y1, level = this.party.level) {
    let x = x0, y = y0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (x !== x1 || y !== y1) {
      const e2 = 2 * err;
      const stepX = e2 > -dy, stepY = e2 < dx;
      if (stepX && stepY && this.blocksSight(x + sx, y, level) && this.blocksSight(x, y + sy, level)) return false;
      if (stepX) { err -= dy; x += sx; }
      if (stepY) { err += dx; y += sy; }
      if ((x !== x1 || y !== y1) && this.blocksSight(x, y, level)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- automap
  /**
   * Records what the party can see now: lit cells in the first-person view with a clear line, walls included.
   * Cheap to call every tick, because it only looks again when something that affects the view has changed.
   */
  updateExplored() {
    const p = this.party, level = this.level;
    const radius = (this.ruleset.light?.(this).radius ?? 4) + 0.6; // The renderer's light reaches this far too.
    const doors = level.objects.filter((o) => o.type === 'door').map((d) => (d.open >= 0.5 ? 1 : 0)).join('');
    const key = [level.id, p.x, p.y, p.dir, radius, this.geometryVersion ?? 0, doors].join();
    if (this.exploredKey === key) return;
    this.exploredKey = key;
    level.explored ??= new Array(level.width * level.height).fill(UNSEEN);
    const f = DIRS[p.dir];
    const reach = Math.ceil(radius);
    const mark = (x, y, value) => {
      const i = y * level.width + x;
      if (level.explored[i] < value) { level.explored[i] = value; this.exploreVersion = (this.exploreVersion ?? 0) + 1; }
    };
    for (let y = Math.max(0, p.y - reach); y <= Math.min(level.height - 1, p.y + reach); y++) {
      for (let x = Math.max(0, p.x - reach); x <= Math.min(level.width - 1, p.x + reach); x++) {
        const dx = x - p.x, dy = y - p.y;
        if (Math.hypot(dx, dy) > radius) continue;
        const ahead = dx * f.x + dy * f.y, across = Math.abs(dx * f.y - dy * f.x);
        if (ahead < 0 || across > ahead + 1) continue; // Outside the view: 45 degrees each way, plus your own cell's width.
        if (this.los(p.x, p.y, x, y)) mark(x, y, SEEN);
      }
    }
    mark(p.x, p.y, VISITED);
    // Stamp the cell with the squares walked so far, which is how the automap tells a cell's age.
    level.visitedAt ??= {};
    p.walked ??= 0;
    const here = p.y * level.width + p.x;
    if (level.visitedAt[here] !== p.walked) {
      level.visitedAt[here] = ++p.walked;
      this.exploreVersion = (this.exploreVersion ?? 0) + 1;
    }
  }

  // ---------------------------------------------------------------- five-foot-square positions
  /** Position of a party member: which of the cell's four squares it holds, given facing. */
  memberPos(member) {
    const i = this.party.members.indexOf(member);
    return this.formationPos(i, this.party.x, this.party.y, this.party.dir);
  }
  formationPos(i, cx, cy, dir) {
    const f = DIRS[dir], r = DIRS[(dir + 1) % 4];
    const fs = i < 2 ? 0.5 : -0.5, rs = i % 2 === 0 ? -0.5 : 0.5;
    const ox = f.x * fs + r.x * rs, oy = f.y * fs + r.y * rs;
    return { x: 2 * cx + (ox > 0 ? 1 : 0), y: 2 * cy + (oy > 0 ? 1 : 0), w: 1 };
  }
  posOf(c) {
    if (c.kind === 'pc') return this.memberPos(c);
    const fills = this.ruleset.monsterInfo(c).fills;
    return fills ? { x: 2 * c.x, y: 2 * c.y, w: 2 } : { x: 2 * c.x + (c.sx ?? 0), y: 2 * c.y + (c.sy ?? 0), w: 1 };
  }
  /** Distance in feet on the five-foot grid; diagonals count as one square, per the common rule. */
  feet(a, b) { return this.feetBetween(this.posOf(a), this.posOf(b)); }
  feetFromPos(pos, c) { return this.feetBetween(pos, this.posOf(c)); }
  feetBetween(p, q) {
    const gx = Math.max(0, p.x - (q.x + q.w - 1), q.x - (p.x + p.w - 1));
    const gy = Math.max(0, p.y - (q.y + q.w - 1), q.y - (p.y + p.w - 1));
    return Math.max(5, Math.max(gx, gy) * 5);
  }
  /** How directly ahead of the party an entity is: 1 dead ahead, 0 beside, negative behind. */
  forwardness(e) {
    const f = DIRS[this.party.dir];
    const dx = e.x - this.party.x, dy = e.y - this.party.y;
    const len = Math.hypot(dx, dy) || 1;
    return (dx * f.x + dy * f.y) / len;
  }

  // ---------------------------------------------------------------- party movement
  turn(delta) {
    if (this.over) return;
    this.party.dir = (this.party.dir + delta + 4) % 4;
    this.sound('turn');
  }
  /** rel: 0 forward, 1 right, 2 back, 3 left. */
  step(rel) {
    if (this.over || this.realTime < this.party.stepReadyAt) return false;
    const blocked = this.ruleset.moveBlocked?.(this);
    if (blocked) { this.log(blocked, 11); return false; }
    const d = DIRS[(this.party.dir + rel) % 4];
    const nx = this.party.x + d.x, ny = this.party.y + d.y;
    const stairs = this.objectsAt(nx, ny).find((o) => o.type === 'stairs');
    if (stairs) { this.useStairs(stairs); return true; }
    if (!this.isPassable(nx, ny)) { this.sound('bump'); return false; }
    if (this.entities.some((e) => e.level === this.party.level && !e.dead && e.x === nx && e.y === ny)) { this.sound('bump'); return false; }
    const before = new Map(this.party.members.map((m) => [m, this.memberPos(m)]));
    this.party.x = nx; this.party.y = ny;
    this.moves = (this.moves ?? 0) + 1;
    this.party.stepReadyAt = this.realTime + (this.ruleset.partyStepSeconds?.(this) ?? 0.3);
    this.ruleset.onPartyWillMove?.(this, before);
    this.sound('step');
    this.noticeNearby();
    this.runObjectsAt(nx, ny, 'enter');
    return true;
  }
  useStairs(s) {
    this.teleport(s.to);
    this.sound('stairs');
    if (s.text) this.log(s.text);
  }
  teleport(to) {
    if (to.level) this.party.level = to.level;
    this.party.x = to.x; this.party.y = to.y;
    if (to.dir != null) this.party.dir = to.dir;
    this.party.focus = null;
    this.teleports = (this.teleports ?? 0) + 1; // Tells the camera to cut rather than glide.
    this.noticeNearby();
    this.runObjectsAt(this.party.x, this.party.y, 'enter');
  }

  /** Runs whatever triggers on the floor of a cell. */
  runObjectsAt(x, y, event) {
    if (event !== 'enter') return;
    for (const o of this.objectsAt(x, y)) {
      switch (o.type) {
        case 'zone': case 'plate':
          if (o.once && o.triggered) break;
          if (o.disarmed) break;
          o.triggered = true;
          if (o.hidden) o.hidden = false;
          if (o.type === 'plate') this.sound('click');
          this.run(o.onEnter ?? []);
          break;
        case 'pit':
          if (o.covered) break;
          o.hidden = false;
          this.log(o.text ?? 'The floor gives way!', 11);
          this.sound('fall');
          this.run(o.onEnter ?? []);
          if (o.to) this.teleport(o.to);
          break;
        default: break;
      }
    }
  }

  /** Passive noticing of hidden objects within two cells. Returns nothing; reveals as a side effect. */
  noticeNearby() {
    for (const o of this.level.objects) {
      if (!o.hidden && !o.secret) continue;
      if (Math.max(Math.abs(o.x - this.party.x), Math.abs(o.y - this.party.y)) > 2) continue;
      if (o.detectDc != null && this.ruleset.noticeHidden?.(this, o.detectDc)) this.reveal(o, true);
    }
  }
  reveal(o, passive = false) {
    if (o.type === 'door' && o.secret) {
      o.secret = false;
      this.levels[o.level].cells[o.y][o.x] = 'D';
      o.axis = isSolidChar(this.levels[o.level].cells, o.x - 1, o.y) ? 'y' : 'x';
    }
    o.hidden = false;
    o.revealed = true;
    this.geometryVersion = (this.geometryVersion ?? 0) + 1;
    this.log(o.revealText ?? (passive ? 'You notice something odd nearby.' : 'You found something.'), 9);
  }
  /** Active search: reveals hidden things within `radius` cells whose DC the total meets. */
  revealHidden(total, radius) {
    const found = [];
    for (const o of this.level.objects) {
      if (!o.hidden && !o.secret) continue;
      if (Math.max(Math.abs(o.x - this.party.x), Math.abs(o.y - this.party.y)) > radius) continue;
      if (total >= (o.detectDc ?? 10)) { found.push(o.foundName ?? (o.type === 'door' ? 'a hidden door' : `a ${o.type}`)); this.reveal(o); }
    }
    return found.join(' and ');
  }

  // ---------------------------------------------------------------- scripting
  /** Runs a list of data-driven actions from a module. */
  run(actions) {
    for (const a of actions) {
      switch (a.do) {
        case 'message': this.log(a.text, a.color ?? 9); break;
        case 'sound': this.sound(a.name); break;
        case 'openDoor': this.setDoor(a.door, 1); break;
        case 'closeDoor': this.setDoor(a.door, 0); break;
        case 'toggleDoor': { const d = this.objectById(a.door); if (d) this.setDoor(a.door, d.target ? 0 : 1); break; }
        case 'setFlag': this.flags[a.flag] = a.value ?? true; break;
        case 'if': this.run(this.flags[a.flag] ? a.then ?? [] : a.else ?? []); break;
        case 'ifAll': this.run(a.flags.every((f) => this.flags[f]) ? a.then ?? [] : a.else ?? []); break;
        case 'spawn': this.spawnMonster(a.proto, a.x, a.y, a.level ?? this.party.level, { awake: true, ...a.opts }); break;
        case 'teleport': this.teleport(a.to); break;
        case 'rule': this.ruleset.rule(this, a.name, a); break;
        case 'giveItem': this.dropItem(this.instantiateItem(a), this.party.x, this.party.y, this.party.level); break;
        case 'placeItem': this.dropItem(this.instantiateItem(a), a.x, a.y, a.level ?? this.party.level); break;
        case 'win': this.win(a.text); break;
        case 'disarm': { const o = this.objectById(a.id); if (o) o.disarmed = true; break; }
        default: throw new Error(`unknown script action: ${a.do}`);
      }
    }
  }
  setDoor(id, target) {
    const d = this.objectById(id);
    if (!d) throw new Error(`no door: ${id}`);
    if (d.target !== target) this.sound('door');
    d.target = target;
  }

  /** Uses a clickable object: wall decoration, door or feature. Called from the UI. */
  useObject(o) {
    switch (o.type) {
      case 'door': return this.useDoor(o);
      case 'wall': return this.useWall(o);
      case 'feature': return this.useFeature(o);
      default: return false;
    }
  }
  useDoor(d) {
    if (d.noHandle) { this.log(d.text ?? 'There is no way to work this from here.'); return false; }
    if (d.lock && !d.target) {
      if (!this.ruleset.tryUnlock(this, d.lock, this.hand)) return false;
      d.lock = null;
    }
    this.setDoor(d.id, d.target ? 0 : 1);
    return true;
  }
  useWall(o) {
    if (o.kind === 'alcove') {
      o.items ??= [];
      if (this.hand) {
        o.items.push(this.hand); this.hand = null; this.sound('drop');
        this.run(o.onPlace ?? []);
        if (o.wants && o.items.some((it) => it.proto === o.wants)) this.run(o.onWanted ?? []);
      } else if (o.items.length) { this.hand = o.items.pop(); this.sound('pickup'); }
      return true;
    }
    if (o.kind === 'plaque' && o.text) { this.log(o.text, 9); return true; }
    if (o.once && o.used) { this.log(o.usedText ?? 'Nothing happens.'); return false; }
    o.used = !o.used || o.once ? true : false;
    if (o.kind === 'lever') o.down = !o.down;
    this.sound('click');
    if (o.text) this.log(o.text, 9);
    this.run(o.onUse ?? []);
    return true;
  }
  useFeature(o) {
    if (o.lock) {
      if (!this.ruleset.tryUnlock(this, o.lock, this.hand)) return false;
      o.lock = null;
    }
    if (o.trap && !o.trap.disarmed) { o.trap.disarmed = true; this.run(o.trap.onTrigger ?? []); }
    if (o.items?.length) {
      for (const s of o.items) this.dropItem(this.instantiateItem(s), o.x, o.y, o.level);
      o.items = [];
      o.opened = true;
      this.sound('door');
      if (o.text) this.log(o.text, 9);
    } else if (o.text && !o.opened) this.log(o.text, 9);
    else if (o.emptyText) this.log(o.emptyText);
    this.run(o.onUse ?? []);
    return true;
  }

  // ---------------------------------------------------------------- items
  dropItem(item, x, y, level = this.party.level, near = false) {
    const stackable = item.qty != null;
    const existing = stackable && this.floorItems.find((f) => f.level === level && f.x === x && f.y === y && f.item.proto === item.proto);
    if (existing) { existing.item.qty += item.qty; return; }
    this.floorItems.push({ item, x, y, level, sx: this.rng.next(), sy: this.rng.next(), near });
  }
  itemsAt(x, y, level = this.party.level) { return this.floorItems.filter((f) => f.level === level && f.x === x && f.y === y); }
  takeFloorItem(entry) {
    this.floorItems = this.floorItems.filter((f) => f !== entry);
    return entry.item;
  }
  /** Picks up a floor item into the hand. */
  pickUp(entry) {
    if (this.hand) return false;
    this.hand = this.takeFloorItem(entry);
    this.sound('pickup');
    return true;
  }
  /** Puts the held item on the floor of the party's cell or the cell ahead. */
  putDown(cellAhead = false) {
    if (!this.hand) return false;
    const f = DIRS[this.party.dir];
    const x = cellAhead ? this.party.x + f.x : this.party.x;
    const y = cellAhead ? this.party.y + f.y : this.party.y;
    if (cellAhead && !this.isPassable(x, y)) return false;
    this.dropItem(this.hand, x, y);
    this.hand = null;
    this.sound('drop');
    return true;
  }
  /** A throw that found no target: the item flies down the corridor until something stops it. */
  throwToFloor(maxCells = 4) {
    const f = DIRS[this.party.dir];
    let x = this.party.x, y = this.party.y;
    for (let i = 0; i < maxCells && this.isPassable(x + f.x, y + f.y); i++) { x += f.x; y += f.y; }
    this.dropItem(this.hand, x, y);
    this.hand = null;
    this.sound('drop');
  }
  /** Swaps the held item with a character's equipment slot. */
  swapSlot(member, slot) {
    const current = member.equipment[slot] ?? null;
    if (this.hand && !this.ruleset.canEquip(member, this.hand, slot)) {
      this.log(`That doesn't go there.`, 11);
      return false;
    }
    member.equipment[slot] = this.hand;
    this.hand = current;
    this.sound('equip');
    return true;
  }
  swapPack(member, i) {
    const current = member.pack[i] ?? null;
    if (this.hand && current && this.hand.proto === current.proto && current.qty != null) {
      current.qty += this.hand.qty ?? 1;
      this.hand = null;
    } else {
      member.pack[i] = this.hand;
      this.hand = current;
    }
    this.sound('equip');
    return true;
  }
  /** Consumes the held item on a member (potion, food). */
  consumeHand(member) {
    if (!this.hand) return false;
    if (!this.ruleset.consume(this, member, this.hand)) { this.log("That can't be consumed."); return false; }
    if (this.hand.qty > 1) this.hand.qty -= 1; else this.hand = null;
    return true;
  }

  // ---------------------------------------------------------------- entities
  spawnMonster(proto, x, y, level, opts = {}) {
    const m = this.ruleset.createMonster(this, proto);
    Object.assign(m, { x, y, level, behaviour: opts.behaviour ?? 'guard', onDeath: opts.onDeath, sx: 0, sy: 0 });
    if (opts.name) m.name = opts.name;
    if (opts.flag) m.flagOnDeath = opts.flag;
    this.entities.push(m);
    this.seatEntity(m);
    if (opts.awake) this.ruleset.wake(this, m);
    else if (this.ruleset.markUnaware) this.ruleset.markUnaware(this, m);
    return m;
  }
  occupants(x, y, level) { return this.entities.filter((e) => !e.dead && e.level === level && e.x === x && e.y === y); }
  /** Can an entity fit in a cell? Large creatures need it empty; others need a free square. */
  canEnter(e, x, y) {
    if (!this.isPassable(x, y, e.level)) return false;
    if (e.level === this.party?.level && x === this.party.x && y === this.party.y) return false;
    if (this.objectsAt(x, y, e.level).some((o) => o.type === 'pit' && !o.covered)) return false;
    const others = this.occupants(x, y, e.level).filter((o) => o !== e);
    if (this.ruleset.monsterInfo(e).fills) return others.length === 0;
    if (others.some((o) => this.ruleset.monsterInfo(o).fills)) return false;
    return others.length < 4;
  }
  /** Picks the free square in the entity's cell closest to the party. */
  seatEntity(e) {
    const taken = new Set(this.occupants(e.x, e.y, e.level).filter((o) => o !== e).map((o) => `${o.sx},${o.sy}`));
    let best = null, bestD = Infinity;
    const px = this.party ? 2 * this.party.x + 0.5 : 0, py = this.party ? 2 * this.party.y + 0.5 : 0;
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      if (taken.has(`${sx},${sy}`)) continue;
      const d = Math.hypot(2 * e.x + sx - px, 2 * e.y + sy - py);
      if (d < bestD) { bestD = d; best = [sx, sy]; }
    }
    if (best) [e.sx, e.sy] = best;
  }
  /** Moves one cell along the shortest path toward a cell; shuffles forward within a cell first. */
  stepEntityToward(e, tx, ty) {
    const oldX = e.sx, oldY = e.sy;
    this.seatEntity(e);
    if (e.sx !== oldX || e.sy !== oldY) return true;
    const next = this.nextStep(e, tx, ty);
    if (!next) return false;
    e.x = next.x; e.y = next.y;
    this.seatEntity(e);
    return true;
  }
  /** Breadth-first search from the target outward, so the entity reads off its best neighbour. */
  nextStep(e, tx, ty, limit = 24) {
    const level = e.level;
    const key = (x, y) => y * 4096 + x;
    const dist = new Map([[key(tx, ty), 0]]);
    let frontier = [[tx, ty]];
    for (let d = 1; d <= limit && frontier.length; d++) {
      const next = [];
      for (const [x, y] of frontier) {
        for (const dir of DIRS) {
          const nx = x + dir.x, ny = y + dir.y, k = key(nx, ny);
          if (dist.has(k) || !this.isPassable(nx, ny, level)) continue;
          dist.set(k, d);
          next.push([nx, ny]);
        }
      }
      frontier = next;
      if (dist.has(key(e.x, e.y))) break;
    }
    const here = dist.get(key(e.x, e.y));
    if (here === undefined) return null;
    let best = null, bestD = here;
    for (const dir of DIRS) {
      const nx = e.x + dir.x, ny = e.y + dir.y, d = dist.get(key(nx, ny));
      if (d !== undefined && d < bestD && this.canEnter(e, nx, ny)) { best = { x: nx, y: ny }; bestD = d; }
    }
    return best;
  }
  fleeEntity(e) {
    let best = null, bestD = Math.hypot(e.x - this.party.x, e.y - this.party.y);
    for (const dir of DIRS) {
      const nx = e.x + dir.x, ny = e.y + dir.y;
      if (!this.canEnter(e, nx, ny)) continue;
      const d = Math.hypot(nx - this.party.x, ny - this.party.y);
      if (d > bestD) { best = { x: nx, y: ny }; bestD = d; }
    }
    if (best) { e.x = best.x; e.y = best.y; this.seatEntity(e); }
  }
  /** Shoves an entity one cell directly away from the party, if there's room. */
  pushFromParty(e) {
    const dx = e.x - this.party.x, dy = e.y - this.party.y;
    const d = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    const nx = e.x + d.x, ny = e.y + d.y;
    if (!this.canEnter(e, nx, ny)) return false;
    e.x = nx; e.y = ny;
    this.seatEntity(e);
    return true;
  }
  onEntityDeath(e) {
    if (this.party.focus === e.uid) this.party.focus = null;
    if (e.flagOnDeath) this.flags[e.flagOnDeath] = true;
    if (e.onDeath) this.run(e.onDeath);
    this.seatOthersAfterDeath(e);
  }
  seatOthersAfterDeath() { /* Others shuffle forward on their next move. */ }

  // ---------------------------------------------------------------- time
  tick(dt) {
    if (this.over) return;
    if (this.paused) return; // Everything stops, including what only looks alive: flicker, breathing and effects.
    this.updateExplored();
    this.realTime += dt;
    this.fx = this.fx.filter((f) => this.realTime - f.born < f.life);
    this.time += dt * this.ruleset.timeScale;
    for (const level of Object.values(this.levels)) {
      for (const o of level.objects) {
        if (o.type !== 'door' || o.open === o.target) continue;
        const step = dt * DOOR_SPEED;
        o.open = o.open < o.target ? Math.min(o.target, o.open + step) : Math.max(o.target, o.open - step);
      }
    }
    this.ruleset.tick(this, dt);
  }
  /** Skips game time (rests) while keeping everything consistent. */
  advanceTime(seconds) { this.time += seconds; }

  // ---------------------------------------------------------------- saving
  serialize() {
    return JSON.stringify({
      version: 1, module: this.module.id, ruleset: this.ruleset.id, rng: this.rng.state, time: this.time, realTime: this.realTime, flags: this.flags,
      entities: this.entities, floorItems: this.floorItems, levels: this.levels, hand: this.hand, party: this.party, logLines: this.logLines.slice(-12),
    });
  }
  restore(json) {
    const s = JSON.parse(json);
    if (s.module !== this.module.id || s.ruleset !== this.ruleset.id) throw new Error('save is for a different game');
    Object.assign(this, { time: s.time, realTime: s.realTime, flags: s.flags, entities: s.entities, floorItems: s.floorItems, levels: s.levels, hand: s.hand, party: s.party, logLines: s.logLines, over: null, fx: [], paused: false, exploredKey: null });
    this.rng.state = s.rng;
    this.memberFx = new Map();
  }
}
