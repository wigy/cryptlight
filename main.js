// Boots the game: loads the module and the rules it asks for, then runs the title, creation and play screens.
import { Game } from './engine/world.js';
import { Hud } from './engine/ui/hud.js';
import { View3D } from './engine/render/view3d.js';
import { Audio8 } from './engine/audio.js';
import { loadSrd } from './rules/srd5/data.js';
import { Srd5Ruleset } from './rules/srd5/ruleset.js';

const SAVE_KEY = 'cryptlight.save';
const MODULE = 'modules/thornwick/module.json';
const fetchJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

class App {
  async boot() {
    this.stage = document.getElementById('stage');
    this.fit();
    window.addEventListener('resize', () => this.fit());
    const [module, assets, srd] = await Promise.all([fetchJson(MODULE), fetchJson('assets/game/index.json'), loadSrd((n) => fetchJson(`data/srd/${n}.json`))]);
    this.module = module;
    this.assets = assets;
    this.ruleset = new Srd5Ruleset(srd, module.items);
    this.audio = new Audio8();
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
      this.view.render(this.game, dt);
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
    const canContinue = !!localStorage.getItem(SAVE_KEY);
    this.screen(`<div class="body"><h1>${this.module.name}</h1><h2>${this.module.summary} A Cryptlight adventure, 5E compatible.</h2>
      <div class="menu">
        <button id="go">New Game</button>
        <button id="custom">Create Your Party</button>
        <button id="cont" ${canContinue ? '' : 'disabled'}>Continue</button>
      </div></div>
      <div class="legal">${this.ruleset.attribution}</div>`, this.module.titleImage);
    this.stage.querySelector('#go').onclick = () => { this.audio.unlock(); this.startGame(this.ruleset.defaultParty()); };
    this.stage.querySelector('#custom').onclick = () => this.showCreator();
    this.stage.querySelector('#cont').onclick = () => { this.audio.unlock(); this.continueGame(); };
  }

  showCreator() {
    const steps = this.ruleset.creationSteps();
    const names = ['Brunna', 'Pip', 'Maren', 'Elowen'];
    const picks = [
      { classId: 'fighter', speciesId: 'dwarf', backgroundId: 'soldier' }, { classId: 'rogue', speciesId: 'halfling', backgroundId: 'criminal' },
      { classId: 'cleric', speciesId: 'human', backgroundId: 'acolyte' }, { classId: 'wizard', speciesId: 'elf', backgroundId: 'sage' },
    ];
    const card = (i) => {
      const p = picks[i];
      const selects = steps.map((s) => `<label>${s.label}</label><select data-i="${i}" data-key="${s.key}">${s.options.map((o) => `<option value="${o.id}" ${p[s.key] === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`).join('');
      const detail = steps.map((s) => s.options.find((o) => o.id === p[s.key])?.detail).filter(Boolean)[0] ?? '';
      return `<div class="pc"><img src="${this.assetUrl(`portrait-${p.classId}`)}" alt=""><input data-name="${i}" value="${names[i]}" maxlength="12">${selects}<div class="detail">${detail}</div></div>`;
    };
    const draw = () => {
      this.screen(`<div class="body"><h2>Create your party of four</h2><div class="creator">${picks.map((_, i) => card(i)).join('')}</div>
        <div class="menu" style="flex-direction:row;width:auto"><button id="back">Back</button><button id="begin">Begin</button></div></div>
        <div class="legal">${this.ruleset.attribution}</div>`, this.module.titleImage);
      this.stage.querySelectorAll('select').forEach((el) => { el.onchange = () => { picks[el.dataset.i][el.dataset.key] = el.value; draw(); }; });
      this.stage.querySelectorAll('input').forEach((el) => { el.oninput = () => { names[el.dataset.name] = el.value; }; });
      this.stage.querySelector('#back').onclick = () => this.showTitle();
      this.stage.querySelector('#begin').onclick = () => {
        this.audio.unlock();
        this.startGame(picks.map((p, i) => this.ruleset.createMember({ ...p, name: names[i].trim() || `Hero ${i + 1}` })));
      };
    };
    draw();
  }

  makeGame() {
    return new Game(this.module, this.ruleset, { listeners: { sound: (n) => this.audio.play(n) } });
  }
  startGame(members) {
    const g = this.makeGame();
    g.start(members);
    this.enter(g);
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
  }
  continueGame() {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return;
    const g = this.makeGame();
    g.restore(json);
    this.enter(g);
    g.log('Game loaded.', 15);
  }
  save() { localStorage.setItem(SAVE_KEY, this.game.serialize()); this.game.log('Game saved.', 15); }
  load() { if (localStorage.getItem(SAVE_KEY)) this.continueGame(); else this.game.log('No saved game.'); }

  // ---------------------------------------------------------------- keys
  onKey(e) {
    if (!this.game || !this.playing || e.target.tagName === 'INPUT') return;
    this.audio.unlock();
    const map = { KeyQ: 'turn:-1', KeyE: 'turn:1', KeyW: 'step:0', KeyS: 'step:2', KeyA: 'step:3', KeyD: 'step:1', ArrowUp: 'step:0', ArrowDown: 'step:2', ArrowLeft: 'step:3', ArrowRight: 'step:1', PageUp: 'turn:-1', PageDown: 'turn:1', Space: 'pause', KeyK: 'save', KeyL: 'load' };
    let cmd = map[e.code];
    const digit = e.code.match(/^Digit([1-4])$/);
    if (digit) cmd = `${e.shiftKey ? 'menu' : 'inv'}:${Number(digit[1]) - 1}`;
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
