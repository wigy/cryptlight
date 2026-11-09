// The interface: party cards, action panel, inventory and screens, as HTML over the WebGL view.
// Everything is rules-agnostic; content comes from the ruleset's memberStatus / memberActions / memberSheet.
import { COLORS } from '../colors.js';
import { DIRS } from '../world.js';
import { createAutomap, drawAutomap } from './automap.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Replaces an element's content only when it actually changed, so hover and clicks survive updates. */
function setHtml(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }

const NEAR_REACH = 2.1; // How far, in cells along the view, things can be picked up or worked.

/** Commands that change the world or the party, refused while paused. Looking at gear and skills stays allowed. */
const PAUSE_LOCKED = new Set(['turn', 'step', 'rest', 'dorest', 'menu', 'sub', 'do', 'quick', 'quicksub', 'quickset', 'slot', 'pack', 'consume']);

const glyph = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
/** Drawn fallback for quick actions with no item and no painted icon. */
const GLYPHS = {
  plus: glyph('<path d="M12 7v10M7 12h10" stroke-width="1.3"/>'),
};

export class Hud {
  constructor(stage, app) {
    this.stage = stage;
    this.app = app;
    this.game = null;
    this.menu = null;     // {member, sub} while a character's action list is open; {rest:true} for rests.
    this.inventory = null;
    this.invMode = 'items';
    this.hint = null;
    this.shownHits = new Map();
    this.handEl = document.getElementById('hand');
    stage.addEventListener('pointerdown', (e) => this.onPointer(e));
    // Tracked by movement rather than enter/leave, because panels re-render under a still pointer.
    stage.addEventListener('mousemove', (e) => this.onHover(e));
    stage.addEventListener('mouseleave', () => { this.hint = null; });
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', (e) => { this.handEl.style.left = `${e.clientX}px`; this.handEl.style.top = `${e.clientY}px`; });
  }

  img(name) { return this.app.assetUrl(name) ?? ''; }
  /** A painted `icon-<name>` if the assets have one, otherwise the drawn glyph. */
  glyphHtml(name) {
    const url = this.app.assetUrl(`icon-${name}`);
    return url ? `<img src="${url}" alt="">` : GLYPHS[name] ?? '';
  }
  itemImg(item) { return this.img(`icon-${this.game.ruleset.itemInfo(item).icon}`); }

  // ---------------------------------------------------------------- play layout
  mountGame(game) {
    this.game = game;
    this.menu = null;
    this.inventory = null;
    this.hint = null;
    this.shownHits = new Map();
    this.stage.innerHTML = `
      <div id="party" class="panelbg"></div>
      <div id="viewwrap"><div id="floaters"></div><div id="banner"></div></div>
      <div id="log" class="panelbg"><div id="loglines"></div>
        <div id="pad">
          <button data-act="turn:-1" data-hint="Turn left (Q)">&#8634;</button>
          <button data-act="step:0" data-hint="Forward (W)">&#8593;</button>
          <button data-act="turn:1" data-hint="Turn right (E)">&#8635;</button>
          <button data-act="step:3" data-hint="Sidestep left (A)">&#8592;</button>
          <button data-act="step:2" data-hint="Back (S)">&#8595;</button>
          <button data-act="step:1" data-hint="Sidestep right (D)">&#8594;</button>
        </div></div>
      <div id="side" class="panelbg">
        <div id="status"></div>
        <div id="tools">
          <button data-act="pause" data-hint="Pause the game. You can look at gear and skills, but not move or act. (Space)">Pause</button>
          <button data-act="rest" data-hint="Take a Short or Long Rest.">Rest</button>
          <button data-act="save" data-hint="Save the game in this browser. (K)">Save</button>
          <button data-act="load" data-hint="Load your saved game. (L)">Load</button>
          <button data-act="exit" data-hint="Save the game and return to the main menu.">Exit</button>
        </div>
        <div id="actions"></div>
      </div>`;
    this.pauseButton = this.stage.querySelector('[data-act="pause"]');
    this.lockable = [...this.stage.querySelectorAll('#pad button, [data-act="rest"]')];
    const wrap = this.stage.querySelector('#viewwrap');
    wrap.prepend(this.app.canvas);
    this.els = Object.fromEntries(['party', 'viewwrap', 'floaters', 'banner', 'loglines', 'status', 'actions'].map((id) => [id, this.stage.querySelector(`#${id}`)]));
    this.els.automap = createAutomap();
    this.els.automap.dataset.hint = 'Your map. It shows everything you have seen by your light.';
    this.stage.querySelector('#side').append(this.els.automap);
    this.els.inv = document.createElement('div');
    this.els.inv.id = 'inv';
    this.els.inv.hidden = true;
    wrap.append(this.els.inv);
    this.els.paused = document.createElement('div');
    this.els.paused.id = 'paused';
    this.els.paused.textContent = 'PAUSED';
    wrap.append(this.els.paused);
    this.els.hint = document.createElement('div');
    this.els.hint.id = 'hint';
    this.stage.append(this.els.hint);
    this.els.end = document.createElement('div');
    this.stage.append(this.els.end);
  }

  // ---------------------------------------------------------------- per-frame update
  update() {
    const g = this.game;
    if (!g) return;
    this.renderParty();
    this.renderStatus();
    this.renderActions();
    this.renderLog();
    drawAutomap(this.els.automap, g);
    this.renderInventory();
    // The overlay would cover the inventory, which is exactly what can still be used while paused.
    this.els.paused.hidden = !g.paused || this.inventory != null;
    this.stage.classList.toggle('paused', g.paused);
    const pauseLabel = g.paused ? 'Resume' : 'Pause';
    if (this.pauseButton.textContent !== pauseLabel) this.pauseButton.textContent = pauseLabel;
    for (const el of this.lockable) el.disabled = g.paused;
    this.els.hint.hidden = !this.hint;
    if (this.hint) setHtml(this.els.hint, this.hint);
    this.handEl.hidden = !g.hand;
    if (g.hand) { const src = this.itemImg(g.hand); if (this.handEl.getAttribute('src') !== src) this.handEl.setAttribute('src', src); }
    setHtml(this.els.banner, g.hand ? esc(g.ruleset.itemInfo(g.hand).name) : '');
    for (const f of this.app.view.takeFloaters()) this.addFloater(f);
    if (g.over && !this.ended) this.showEnd();
  }

  renderParty() {
    const g = this.game;
    const html = g.party.members.map((m, i) => {
      const s = g.ruleset.memberStatus(g, m);
      const bars = s.bars.map((b) => `<div class="bar" data-hint="${esc(b.label)}: ${b.value}/${b.max}"><i style="width:${Math.round(100 * Math.min(1, b.value / Math.max(1, b.max)))}%;background:${COLORS[b.color]}"></i><span>${b.value}/${b.max}</span></div>`).join('');
      const hand = (slot, label) => {
        const it = m.equipment[slot];
        const info = it && g.ruleset.itemInfo(it);
        return `<button class="slot" data-act="slot:${i}:${slot}" data-hint="${esc(info ? `<b>${info.name}</b>. ${info.description}` : `${label}: empty. Click with an item to equip it.`)}">${it ? `<img src="${this.itemImg(it)}" alt=""><span class="q">${it.qty > 1 ? it.qty : ''}</span>` : ''}</button>`;
      };
      return `<div class="card${s.dead ? ' dead' : ''}" data-card="${i}">
        <div class="portrait" data-act="inv:${i}" data-hint="Open ${esc(s.name)}'s gear and stats. (${i + 1}; Shift+${i + 1} for skills and spells)">
          <img src="${this.img(m.portrait ?? s.portrait)}" alt=""><div class="cool" style="height:${Math.round(s.cooldown * 10) * 10}%"></div>${s.tag ? `<div class="tag">${esc(s.tag)}</div>` : ''}
        </div>
        <div><div class="cname">${esc(s.name)}</div>${bars}<div class="hands">${hand('mainHand', 'Main hand')}${hand('offHand', 'Off hand')}</div></div>
      </div>`;
    }).join('');
    setHtml(this.els.party, html);
    for (const [m, fx] of g.memberFx) {
      if (this.shownHits.get(m) === fx.at) continue;
      this.shownHits.set(m, fx.at);
      const card = this.els.party.querySelector(`[data-card="${g.party.members.indexOf(m)}"]`);
      if (!card) continue;
      const b = document.createElement('div');
      b.className = 'burst';
      b.textContent = fx.amount;
      card.append(b);
      b.addEventListener('animationend', () => b.remove()); // Not a timer, so it holds while paused.
      this.els.party._html = null; // The burst is transient; let the next update rebuild freely.
    }
  }

  renderStatus() {
    const g = this.game;
    const secs = Math.floor(g.time);
    const clock = `${Math.floor(secs / 3600)}h ${String(Math.floor(secs / 60) % 60).padStart(2, '0')}m`;
    setHtml(this.els.status, `<span>${esc(g.level.name)}</span><small>${clock}</small>`);
  }

  renderActions() {
    const g = this.game;
    if (this.menu?.rest) {
      const opts = g.ruleset.restOptions(g);
      setHtml(this.els.actions, `<h3>Rest</h3><div class="actlist"><button class="act" data-act="menu:close">&lt; Back</button>${opts.map((o) => `<button class="act" data-act="dorest:${o.id}" data-hint="${esc(o.hint)}">${esc(o.label)}</button>`).join('')}</div>`);
      return;
    }
    if (this.menu) {
      const m = g.party.members[this.menu.member];
      const list = g.ruleset.memberActions(g, m, this.menu.sub);
      const rows = list.map((a) => {
        const act = a.back ? 'menu:up' : a.submenu ? `sub:${a.submenu}` : `do:${a.id}`;
        return `<button class="act" data-act="${esc(act)}" ${a.enabled ? '' : 'disabled'} data-hint="${esc(a.hint ? `<b>${a.label}</b>. ${a.hint}` : '')}">${esc(a.label)}</button>`;
      }).join('');
      setHtml(this.els.actions, `<h3>${esc(m.name)}</h3><div class="actlist">${rows}</div>`);
      return;
    }
    const rows = g.party.members.map((m, i) => {
      const s = g.ruleset.memberStatus(g, m);
      const state = s.dead ? 'Dead' : s.down ? 'Down' : s.ready ? 'Ready' : 'Recovering';
      const icons = (g.ruleset.memberQuickActions?.(g, m) ?? []).map((a) => {
        const act = a.empty ? `abilities:${i}` : a.submenu ? `quicksub:${i}:${a.submenu}` : `quick:${i}:${a.id}`;
        const named = a.kind ? ' named' : '';
        const picture = a.item ? `<img src="${this.itemImg(a.item)}" alt="">` : this.glyphHtml(a.glyph);
        return `<button class="quick${named}${a.empty ? ' empty' : ''}" data-act="${esc(act)}" ${a.enabled && !g.paused ? '' : 'disabled'} data-hint="${esc(`<b>${a.label}</b>. ${a.hint ?? ''}`)}">${picture}${named ? `<span>${esc(a.label)}</span>` : ''}</button>`;
      }).join('');
      return `<div class="who">
        <div class="whohead"><b>${esc(s.name)}</b><small>${state}</small></div>
        <div class="quicks">${icons}</div></div>`;
    }).join('');
    setHtml(this.els.actions, rows);
  }

  renderLog() {
    const lines = this.game.logLines.slice(-6);
    setHtml(this.els.loglines, lines.map((l) => `<div style="color:${COLORS[l.color] ?? COLORS[5]}">${esc(l.text)}</div>`).join(''));
  }

  renderInventory() {
    const g = this.game;
    const inv = this.els.inv;
    inv.hidden = this.inventory == null;
    if (this.inventory == null) return;
    const i = this.inventory;
    const m = g.party.members[i];
    const sheet = g.ruleset.memberSheet(g, m).map((l) => (typeof l === 'string' ? esc(l) : `<span style="color:${COLORS[l.color]}">${esc(l.text)}</span>`)).join('\n');
    const tab = (mode, label) => `<button class="${this.invMode === mode ? 'on' : ''}" data-act="invmode:${mode}">${label}</button>`;
    const top = `<div class="invtabs">${tab('items', 'Items')}${tab('abilities', 'Skills &amp; Spells')}${g.ruleset.memberFeatures ? tab('features', 'Features') : ''}</div>`;
    const close = '<button class="close" data-act="inv:close">Close</button>';
    if (this.invMode === 'abilities') {
      setHtml(inv, `${top}${this.abilitiesHtml(i, m)}<div class="sheet">${sheet}</div>${close}`);
      return;
    }
    if (this.invMode === 'features') {
      setHtml(inv, `${top}${this.featuresHtml(m)}<div class="sheet">${sheet}</div>${close}`);
      return;
    }
    const slot = (act, it, label) => {
      const info = it && g.ruleset.itemInfo(it);
      return `<button class="slot" data-act="${act}" data-hint="${esc(info ? `<b>${info.name}</b>. ${info.description}` : `${label}: empty.`)}">${it ? `<img src="${this.itemImg(it)}" alt=""><span class="q">${it.qty > 1 ? it.qty : ''}</span>` : ''}</button>`;
    };
    const doll = g.ruleset.slots.map((s) => `<div class="dollslot">${slot(`slot:${i}:${s.id}`, m.equipment[s.id], s.label)}<span>${esc(s.label)}</span></div>`).join('');
    const pack = m.pack.map((it, n) => slot(`pack:${i}:${n}`, it, 'Pack')).join('');
    const weight = g.ruleset.carriedWeight(m);
    setHtml(inv, `${top}<div><h2>Equipped</h2><div class="doll">${doll}</div></div>
      <div><h2>Pack (${Math.round(weight)} lb.)</h2><div class="pack">${pack}</div>
      <button class="mouth" data-act="consume:${i}" ${g.paused ? 'disabled' : ''} data-hint="Hold a potion or food over this and click to consume it.">Drink / eat what you're holding</button></div>
      <div class="sheet">${sheet}</div>${close}`);
  }

  abilitiesHtml(i, m) {
    const g = this.game;
    const list = g.ruleset.memberAbilities?.(g, m) ?? [];
    const picked = list.map((a) => a.quickId ?? a.id).filter((id) => m.quick?.includes(id));
    const row = (a) => {
      const id = a.quickId ?? a.id;
      const on = picked.includes(id);
      return `<button class="ability${on ? ' on' : ''}" data-act="${esc(`quickset:${i}:${id}`)}" ${on || picked.length < 2 ? '' : 'disabled'} data-hint="${esc(`<b>${a.label}</b>. ${a.hint ?? ''}`)}">${this.glyphHtml(a.glyph)}<span>${esc(a.label)}</span><i>${on ? '&#10003;' : ''}</i></button>`;
    };
    const section = (title, kind) => {
      const rows = list.filter((a) => a.kind === kind).map(row).join('');
      return rows ? `<h3>${title}</h3><div class="abilist">${rows}</div>` : '';
    };
    const body = list.length ? `${section('Skills', 'skill')}${section('Spells', 'spell')}` : `<p class="noability">${esc(m.name)} has no skills or spells to choose yet.</p>`;
    return `<div class="abilities"><h2>Quick access (${picked.length}/2)</h2>${body}</div>`;
  }

  featuresHtml(m) {
    const item = (f) => `<li class="${f.missing ? 'missing' : ''}" data-hint="${esc(`<b>${f.name}</b>. ${f.text}${f.missing ? ' <i>Not in the game yet.</i>' : ''}`)}">${esc(f.name)}${f.missing ? '<small>not in game yet</small>' : ''}</li>`;
    const group = (g) => `<div class="featgroup${g.next ? ' next' : ''}">${g.title ? `<h3>${esc(g.title)}</h3>` : ''}${g.gains?.length ? `<p>${esc(g.gains.join(', '))}</p>` : ''}<ul>${g.items.map(item).join('')}</ul>${g.note ? `<p class="note">${esc(g.note)}</p>` : ''}</div>`;
    const sections = this.game.ruleset.memberFeatures(this.game, m);
    return `<div class="features">${sections.map((s) => `<section><h2>${esc(s.title)}</h2>${s.groups.map(group).join('')}</section>`).join('')}</div>`;
  }

  addFloater(f) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = f.text;
    el.style.left = `${f.at.x * 100}%`;
    el.style.top = `${f.at.y * 100}%`;
    this.els.floaters.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  // ---------------------------------------------------------------- input
  onHover(e) {
    this.hint = e.target.closest?.('[data-hint]')?.dataset.hint || null;
  }

  onPointer(e) {
    if (e.target === this.app.canvas) { this.clickView(e); return; }
    const el = e.target.closest?.('[data-act]');
    if (!el || el.disabled) return;
    this.app.audio.unlock();
    this.command(el.dataset.act);
  }

  /** Plays the press animation on a movement button, for clicks and keys alike. */
  pressPad(act) {
    const el = this.stage.querySelector(`#pad [data-act="${act}"]`);
    if (!el) return;
    el.classList.remove('pressed');
    void el.offsetWidth; // Restarts the animation when the same button is pressed again.
    el.classList.add('pressed');
  }

  /** Runs a HUD command. Also the entry point for keyboard shortcuts. */
  command(act) {
    const g = this.game;
    const [verb, a, b] = act.split(':');
    if (g.paused && PAUSE_LOCKED.has(verb)) return;
    if (verb === 'turn' || verb === 'step') this.pressPad(act);
    switch (verb) {
      case 'pause':
        g.paused = !g.paused;
        if (g.paused) this.menu = null; // Its actions couldn't be used anyway.
        this.hint = null;
        break;
      case 'turn': g.turn(Number(a)); break;
      case 'step': g.step(Number(a)); break;
      case 'rest': this.menu = this.menu?.rest ? null : { rest: true }; break;
      case 'dorest': if (g.ruleset.rest(g, a)) this.menu = null; break;
      case 'save': this.app.save(); break;
      case 'load': this.app.load(); break;
      case 'exit': this.app.save().then((saved) => { if (saved) this.app.showTitle(); }); break; // Stays in the game rather than lose it.
      case 'inv': this.inventory = a === 'close' || this.inventory === Number(a) ? null : Number(a); this.hint = null; break;
      case 'menu':
        if (a === 'close') this.menu = null;
        else if (a === 'up' && this.menu.root === this.menu.sub) this.menu = null; // Opened straight from an icon.
        else if (a === 'up') this.menu.sub = this.menu.sub?.startsWith('ally:') && this.menu.sub.startsWith('ally:cast-') ? 'cast' : null;
        this.hint = null;
        break;
      case 'sub': this.menu.sub = act.slice(4); this.hint = null; break;
      case 'quick': g.ruleset.doAction(g, g.party.members[Number(a)], act.split(':').slice(2).join(':')); break;
      case 'quicksub': this.menu = { member: Number(a), sub: act.split(':').slice(2).join(':'), root: act.split(':').slice(2).join(':') }; this.hint = null; break;
      case 'items':
      case 'abilities':
        // The same key again closes the page it opened.
        this.inventory = this.inventory === Number(a) && this.invMode === verb ? null : Number(a);
        this.invMode = verb;
        this.hint = null;
        break;
      case 'invmode': this.invMode = a; this.hint = null; break;
      case 'quickset': {
        const m = g.party.members[Number(a)];
        const id = act.split(':').slice(2).join(':');
        g.ruleset.toggleQuick(g, m, id);
        if (m.quick?.includes(id)) this.inventory = null; // Picking is done; removing leaves the list open to choose again.
        this.hint = null;
        break;
      }
      case 'do': {
        const m = g.party.members[this.menu.member];
        g.ruleset.doAction(g, m, act.slice(3));
        this.menu = null;
        this.hint = null;
        break;
      }
      case 'slot': g.swapSlot(g.party.members[Number(a)], b); break;
      case 'pack': g.swapPack(g.party.members[Number(a)], Number(b)); break;
      case 'consume': g.consumeHand(g.party.members[Number(a)]); break;
      default: break;
    }
  }

  clickView(e) {
    const g = this.game;
    if (g.over || g.paused) return;
    this.app.audio.unlock();
    const r = this.app.canvas.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    const hit = this.app.view.pick(g, u, v);
    if (g.hand) { this.clickWithHand(hit); return; }
    switch (hit.type) {
      case 'monster':
        g.party.focus = hit.ref.uid;
        g.log(`Target: ${hit.ref.name}.`, 15);
        break;
      case 'item':
        if (hit.dist < NEAR_REACH) g.pickUp(hit.ref); else g.log('That is too far away.');
        break;
      case 'feature': case 'door':
        if (hit.dist < NEAR_REACH) g.useObject(hit.ref); else g.log('That is too far away.');
        break;
      case 'wall':
        if (hit.ref?.type === 'wall' && hit.dist < NEAR_REACH) g.useObject(hit.ref);
        else if (hit.ref?.type === 'stairs' && hit.dist < NEAR_REACH) g.useStairs(hit.ref);
        break;
      default: break;
    }
  }

  /** Clicking the view while holding something: fixtures take it, the near floor takes it, otherwise it's thrown. */
  clickWithHand(hit) {
    const g = this.game;
    const near = hit.dist < NEAR_REACH;
    if (near && hit.type === 'wall' && hit.ref?.kind === 'alcove') { g.useObject(hit.ref); return; }
    if (near && hit.type === 'door') { g.useObject(hit.ref); return; }
    if (near && hit.type === 'feature') { g.useObject(hit.ref); return; }
    if (hit.type === 'floor' && near) {
      const f = DIRS[g.party.dir];
      const ahead = hit.x === g.party.x + f.x && hit.y === g.party.y + f.y;
      if ((hit.x === g.party.x && hit.y === g.party.y) || ahead) { g.putDown(ahead); return; }
    }
    g.ruleset.throwHeld(g);
  }

  showEnd() {
    this.ended = true;
    const g = this.game;
    const won = g.over === 'won';
    const lines = g.ruleset.summary?.(g) ?? [];
    this.els.end.className = 'screen';
    this.els.end.style.backgroundImage = `url(${this.img(g.module.titleImage)})`;
    this.els.end.innerHTML = `<div class="shade"></div><div class="body">
      <h1>${won ? 'Victory' : 'The Party Has Fallen'}</h1>
      <p class="endtext">${esc(won ? g.winText : 'The dark keeps its secrets. Thornwick waits for braver souls.')}</p>
      <p class="endtext">${lines.map(esc).join('<br>')}</p>
      <div class="menu"><button id="endmenu">Main menu</button></div></div>
      <div class="legal">${esc(g.ruleset.attribution)}</div>`;
    this.els.end.querySelector('#endmenu').addEventListener('click', () => { this.ended = false; this.app.showTitle(); });
  }
}
