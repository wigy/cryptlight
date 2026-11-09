// Boots the game: loads the module and the rules it asks for, then runs the title, creation and play screens.
import { Game, outgrown, vacationSave } from './engine/world.js';
import { Hud, esc, sheetHtml } from './engine/ui/hud.js';
import { View3D } from './engine/render/view3d.js';
import { Audio8 } from './engine/audio.js';
import { loadSrd } from './rules/srd5/data.js';
import { Srd5Ruleset } from './rules/srd5/ruleset.js';

const SAVE_URL = 'api/save';
localStorage.removeItem('cryptlight.save'); // Saves from when they were kept in the browser are dropped.
const MODULES = 'modules/index.json';
const moduleUrl = (id) => `modules/${id}/module.json`;
const fetchJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

class App {
  async boot() {
    this.stage = document.getElementById('stage');
    this.fit();
    window.addEventListener('resize', () => this.fit());
    const [ids, assets, srd] = await Promise.all([fetchJson(MODULES), fetchJson('assets/game/index.json'), loadSrd((n) => fetchJson(`data/srd/${n}.json`))]);
    this.modules = await Promise.all(ids.map((id) => fetchJson(moduleUrl(id))));
    this.titleImage = this.modules[0].titleImage;
    this.assets = assets;
    // Every module's items are known at once, because what a party carries away from one comes along to the next.
    this.ruleset = new Srd5Ruleset(srd, Object.assign({}, ...this.modules.map((m) => m.items)));
    this.audio = new Audio8();
    this.audio.load('assets/audio');
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'view';
    this.view = new View3D(this.canvas, (n) => this.assetUrl(n));
    this.sizeCanvas();
    // Everything drawn in 3D is loaded up front so nothing pops in during play.
    this.stage.innerHTML = '<div class="screen"><div class="body"><h2 style="margin:auto">Loading...</h2></div></div>';
    await this.view.preload(Object.keys(assets).filter((n) => !/^(portrait-|title$|panel$)/.test(n)));
    this.hud = new Hud(this.stage, this);
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.showTitle();
  }

  assetUrl(name) { const f = this.assets[name]; return f ? `assets/game/${f}` : null; }

  fit() {
    const s = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
    this.stage.style.transform = `scale(${s}) translate(-50%, -50%)`;
    this.stage.style.setProperty('--scale', s); // Modal dialogs draw outside the stage's transform.
    this.scale = s;
    if (this.canvas) this.sizeCanvas();
  }
  /** Renders at real device pixels (up to 2x the design size) so the view stays sharp when scaled up. */
  sizeCanvas() {
    const k = Math.min(2, Math.max(1, this.scale * (window.devicePixelRatio || 1)));
    this.canvas.width = Math.round(892 * k);
    this.canvas.height = Math.round(540 * k);
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.game && this.playing) {
      this.game.tick(dt);
      this.view.render(this.game, this.game.paused ? 0 : dt);
      this.hud.update();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- screens
  screen(html, bg) {
    this.playing = false;
    this.game = null;
    this.hud.game = null;
    document.getElementById('hand').hidden = true;
    this.stage.innerHTML = `<div class="screen" style="background-image:url(${this.assetUrl(bg) ?? ''})"><div class="shade"></div>${html}</div>`;
  }

  showTitle() {
    this.screen(`<div class="body"><h1>Cryptlight</h1><h2>Real-time dungeon adventures, 5E compatible.</h2>
      <div class="menu">
        <button id="go">New Game</button>
        <button id="cont" disabled>Continue</button>
      </div></div>
      <div class="legal">${this.ruleset.attribution}</div>
      <dialog id="confirm-new" class="panelbg">
        <h3>Start a new game?</h3>
        <p>You already have a saved game. It will be replaced when you create a new party.</p>
        <div class="choices"><button id="newgame-no" autofocus>Cancel</button><button id="newgame-yes">Start New Game</button></div>
      </dialog>`, this.titleImage);
    const saved = this.readSave();
    // There is one save slot, so a new party's first save replaces the existing game.
    const confirm = this.stage.querySelector('#confirm-new');
    this.stage.querySelector('#go').onclick = async () => { if (await saved) confirm.showModal(); else this.showCreator(); };
    this.stage.querySelector('#newgame-yes').onclick = () => this.showCreator();
    this.stage.querySelector('#newgame-no').onclick = () => confirm.close();
    this.stage.querySelector('#cont').onclick = () => { this.audio.unlock(); this.continueGame(); };
    saved.then((json) => {
      const cont = this.stage.querySelector('#cont');
      if (cont && json) cont.disabled = false;
    });
  }

  showCreator() {
    const steps = this.ruleset.creationSteps();
    const names = ['Brunna', 'Pip', 'Maren', 'Elowen'];
    const picks = [
      { classId: 'fighter', speciesId: 'dwarf', backgroundId: 'soldier' }, { classId: 'rogue', speciesId: 'halfling', backgroundId: 'criminal' },
      { classId: 'cleric', speciesId: 'human', backgroundId: 'acolyte' }, { classId: 'wizard', speciesId: 'elf', backgroundId: 'sage' },
    ];
    const draw = () => {
      this.screen(`<div class="body"><h2>Create your party of four</h2><div class="creator">${picks.map((p, i) => this.creatorCard(steps, p, names[i], i)).join('')}</div>
        <div class="menu" style="flex-direction:row;width:auto"><button id="back">Back</button><button id="begin">Begin</button></div></div>
        <div class="legal">${this.ruleset.attribution}</div>`, this.titleImage);
      this.bindCreatorCards(picks, names, draw);
      this.stage.querySelector('#back').onclick = () => this.showTitle();
      this.stage.querySelector('#begin').onclick = async () => {
        this.audio.unlock();
        const json = vacationSave(this.ruleset, picks.map((p, i) => this.ruleset.createMember({ ...p, name: names[i].trim() || `Hero ${i + 1}` })));
        const saved = await this.putSave(json);
        this.showVacation(JSON.parse(json), saved ? 'Your new party is ready to set out.' : 'Your new party is ready, but it could not be saved.');
      };
    };
    draw();
  }

  /** One character's choices, on the screens that create characters. */
  creatorCard(steps, p, name, i) {
    const selects = steps.map((s) => `<label>${s.label}</label><select data-i="${i}" data-key="${s.key}">${s.options.map((o) => `<option value="${o.id}" ${p[s.key] === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`).join('');
    const detail = steps.map((s) => s.options.find((o) => o.id === p[s.key])?.detail).filter(Boolean)[0] ?? '';
    return `<div class="pc"><img src="${this.assetUrl(this.ruleset.portrait(p))}" alt=""><input data-name="${i}" value="${esc(name)}" maxlength="12">${selects}<div class="detail">${detail}</div></div>`;
  }
  bindCreatorCards(picks, names, draw) {
    this.stage.querySelectorAll('select').forEach((el) => { el.onchange = () => { picks[el.dataset.i][el.dataset.key] = el.value; draw(); }; });
    this.stage.querySelectorAll('input').forEach((el) => { el.oninput = () => { names[el.dataset.name] = el.value; }; });
  }

  /** The party's four characters in full, with a way to replace any who have died. */
  showParty(save) {
    const cards = save.members.map((m, i) => `<div class="pc partycard${m.dead ? ' dead' : ''}"><img src="${this.assetUrl(this.ruleset.portrait(m))}" alt="">
      <div class="sheet">${sheetHtml(this.ruleset.memberSheet(null, m))}</div>
      ${m.dead ? `<div class="fallen">Fallen</div><button data-hire="${i}">Hire New Character</button>` : ''}</div>`).join('');
    this.screen(`<div class="body" id="party-view"><h2>Your party</h2><div class="creator">${cards}</div>
      <div class="menu" style="flex-direction:row;width:auto"><button id="party-back">Back</button></div></div>
      <div class="legal">${this.ruleset.attribution}</div>`, this.titleImage);
    this.stage.querySelector('#party-back').onclick = () => this.showVacation(save);
    this.stage.querySelectorAll('[data-hire]').forEach((el) => { el.onclick = () => this.showHire(save, Number(el.dataset.hire)); });
  }

  /** Chooses a replacement for a dead character, starting at the level of the lowest one still alive. */
  showHire(save, slot) {
    const steps = this.ruleset.creationSteps();
    const fallen = save.members[slot];
    const level = this.ruleset.hireLevel(save.members);
    const pick = {};
    for (const s of steps) pick[s.key] = s.options.some((o) => o.id === fallen[s.key]) ? fallen[s.key] : s.options[0].id; // The same again, unless no longer offered.
    const picks = [pick], names = ['Recruit'];
    let problem = '';
    const draw = () => {
      this.screen(`<div class="body" id="hire"><h2>Hire a new character at level ${level}</h2>
        <h2>${esc(problem || `They take the place of ${fallen.name}, and the party keeps ${fallen.name}'s gear.`)}</h2>
        <div class="creator single">${this.creatorCard(steps, pick, names[0], 0)}</div>
        <div class="menu" style="flex-direction:row;width:auto"><button id="hire-back">Back</button><button id="hire-go">Hire</button></div></div>
        <div class="legal">${this.ruleset.attribution}</div>`, this.titleImage);
      this.bindCreatorCards(picks, names, draw);
      this.stage.querySelector('#hire-back').onclick = () => this.showParty(save);
      this.stage.querySelector('#hire-go').onclick = async () => {
        const hired = { ...save, members: this.ruleset.hire(save.members, slot, { ...pick, name: names[0].trim() || 'Recruit' }) };
        if (await this.putSave(JSON.stringify(hired))) this.showParty(hired);
        else { problem = 'The character could not be saved, so nobody was hired. Try again.'; draw(); }
      };
    };
    draw();
  }

  /** Between adventures: shows the party and the adventures it can set out on. */
  showVacation(save, message = 'Your party rests between adventures.') {
    const levels = ({ min, max }) => (min === max ? `Recommended level ${min}` : `Recommended levels ${min}\u2013${max}`);
    const roster = save.members.map((m) => `<div class="member${m.dead ? ' dead' : ''}"><img src="${this.assetUrl(this.ruleset.portrait(m))}" alt=""><b>${esc(m.name)}</b><span>${esc(this.ruleset.memberTitle(m))}</span></div>`).join('');
    const adventures = this.modules.map((m) => `<div class="adventure"><h3>${esc(m.name)}</h3><div class="levels">${levels(m.recommendedLevels)}</div><p>${esc(m.summary)}</p>${outgrown(m, this.ruleset, save.members) ? '<button disabled>Your party has outgrown this</button>' : `<button data-adventure="${esc(m.id)}">Set Out</button>`}</div>`).join('');
    this.screen(`<div class="body" id="vacation"><h1>On Vacation</h1><h2>${esc(message)}</h2>
      <div class="roster">${roster}</div>
      <h2>Choose an adventure</h2>
      <div class="adventures">${adventures}</div>
      <div class="menu" style="flex-direction:row;width:auto"><button id="vacation-menu">Main menu</button><button id="view-party">View Party</button></div></div>
      <div class="legal">${this.ruleset.attribution}</div>`, this.titleImage);
    this.stage.querySelector('#vacation-menu').onclick = () => this.showTitle();
    this.stage.querySelector('#view-party').onclick = () => this.showParty(save);
    this.stage.querySelectorAll('[data-adventure]').forEach((el) => {
      el.onclick = () => { this.audio.unlock(); this.beginAdventure(this.modules.find((m) => m.id === el.dataset.adventure), save); };
    });
  }

  makeGame(module) {
    return new Game(module, this.ruleset, { listeners: { sound: (n) => this.audio.play(n) } });
  }
  /** Moves a party on vacation to the module's starting point. */
  beginAdventure(module, { members, hand, time, realTime, collected }) {
    const g = this.makeGame(module);
    g.start(members, { hand, time, realTime, collected });
    this.enter(g);
    return this.save();
  }
  /** Resolves to whether the party made it back, which takes saving it. */
  async leaveAdventure() {
    const g = this.game;
    const json = g.vacationSave();
    if (!(await this.putSave(json))) { g.log('Could not save the game.', 11); return false; }
    this.showVacation(JSON.parse(json), `${g.leaveText ?? `You return from ${g.module.name}.`} The party takes a long rest.`);
    return true;
  }
  enter(g) {
    this.game = g;
    this.view.meshKey = null;
    this.view.cam = null;
    this.hud.ended = false;
    this.hud.mountGame(g);
    this.playing = true;
    this.sizeCanvas();
    // For debugging from the console and for tools/browser-check.mjs.
    window.__game = g;
    window.__view = this.view;
    window.__audio = this.audio;
  }
  /** The saved game as JSON, or null if there is none or the server can't be reached. */
  async readSave() {
    try {
      const r = await fetch(SAVE_URL);
      return r.status === 200 ? await r.text() : null;
    } catch {
      return null;
    }
  }
  /** Resolves to whether the save reached the server. */
  async putSave(json) {
    try {
      return (await fetch(SAVE_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json })).ok;
    } catch {
      return false;
    }
  }
  async continueGame() {
    const json = await this.readSave();
    if (!json) return false;
    const save = JSON.parse(json);
    if (save.vacation) { this.showVacation(save); return true; }
    const module = this.modules.find((m) => m.id === save.module);
    if (!module) return false;
    const g = this.makeGame(module);
    g.restore(json);
    this.enter(g);
    g.log('Game loaded.', 15);
    return true;
  }
  /** Resolves to whether the save reached the server. */
  async save() {
    const g = this.game;
    const saved = await this.putSave(g.serialize());
    g.log(saved ? 'Game saved.' : 'Could not save the game.', saved ? 15 : 11);
    return saved;
  }
  async load() {
    const g = this.game;
    const json = await this.readSave();
    // A save from before this adventure only exists if saving failed as it began. Don't throw away the adventure for it.
    if (!json || JSON.parse(json).vacation || !(await this.continueGame())) g.log('No saved game.');
  }

  // ---------------------------------------------------------------- keys
  onKey(e) {
    if (!this.game || !this.playing || e.target.tagName === 'INPUT') return;
    this.audio.unlock();
    const map = { KeyQ: 'turn:-1', KeyE: 'turn:1', KeyW: 'step:0', KeyS: 'step:2', KeyA: 'step:3', KeyD: 'step:1', ArrowUp: 'step:0', ArrowDown: 'step:2', ArrowLeft: 'step:3', ArrowRight: 'step:1', PageUp: 'turn:-1', PageDown: 'turn:1', Space: 'pause', KeyK: 'save', KeyL: 'load' };
    let cmd = map[e.code];
    const digit = e.code.match(/^Digit([1-4])$/);
    if (digit) cmd = `${e.shiftKey ? 'abilities' : 'items'}:${Number(digit[1]) - 1}`;
    if (e.code === 'Escape') { this.hud.menu = null; this.hud.inventory = null; return; }
    if (!cmd) return;
    e.preventDefault();
    if (e.repeat && !cmd.startsWith('step')) return;
    this.hud.command(cmd);
  }
}

new App().boot().catch((err) => {
  document.getElementById('stage').innerHTML = `<div style="padding:40px;color:#f88;font:16px sans-serif">Could not start: ${err.message}</div>`;
  console.error(err);
});
