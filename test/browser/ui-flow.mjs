// Real-input UI flow, run with: node tools/browser-check.mjs <outDir> test/browser/ui-flow.mjs
import assert from 'node:assert/strict';

const VIEW = { x: 2, y: 118, w: 892, h: 540 };
export default async function ({ eval: ev, click, key, wait, shot }) {
  const state = (expr) => ev(`(() => { const g = window.__game; return ${expr}; })()`);
  const clickEl = async (sel) => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    assert.ok(r, `element ${sel}`);
    await click(r.x, r.y);
    await wait(120);
  };
  await wait(1500);

  // Creator screen.
  await clickEl('#custom');
  await wait(400);
  await shot('10-creator');
  await ev(`(() => { const s = document.querySelector('select[data-i="0"][data-key="classId"]'); s.value = 'barbarian'; s.dispatchEvent(new Event('change')); })()`);
  await wait(200);
  assert.match(await ev(`document.querySelector('.pc img').getAttribute('src')`), /portrait-barbarian/);
  await clickEl('#begin');
  await wait(1200);
  assert.equal(await state(`g.party.members[0].classId`), 'barbarian');
  assert.equal(await state(`g.party.members[0].equipment.mainHand.proto`), 'greataxe');
  await key('KeyK');
  await wait(100);

  // Back to the default party through the menu, proving Continue exists now.
  await ev(`location.reload()`);
  await wait(2000);
  assert.equal(await ev(`document.querySelector('#cont').disabled`), false);
  await clickEl('#go');
  await wait(1500);

  // Pick up the potion on the floor by clicking it in the view.
  assert.equal(await state(`g.hand`), null);
  const spot = await ev(`(() => { const p = window.__view.picks.filter((q) => q.type === 'item').sort((a, b) => a.depth - b.depth)[0]; return { u: (p.x0 + p.x1) / 2, v: (p.y0 + p.y1) / 2 }; })()`);
  await click(VIEW.x + spot.u * VIEW.w, VIEW.y + spot.v * VIEW.h);
  await wait(150);
  assert.equal(await state(`g.hand && g.hand.proto`), 'potion-of-healing', 'clicking the floor item picks it up');
  await shot('11-holding');

  // Open the inventory with a click on the portrait and stow it.
  await clickEl('[data-card="2"] .portrait');
  await wait(150);
  await shot('12-inventory');
  const free = await state(`g.party.members[2].pack.indexOf(null)`);
  const rect = await ev(`(() => { const b = document.querySelectorAll('.pack .slot')[${free}].getBoundingClientRect(); return { x: b.x + 20, y: b.y + 20 }; })()`);
  await click(rect.x, rect.y);
  await wait(150);
  assert.equal(await state(`g.hand`), null);
  assert.equal(await state(`g.party.members[2].pack[${free}].proto`), 'potion-of-healing');
  await clickEl('.close');
  assert.equal(await ev(`document.querySelector('#inv').hidden`), true);

  // Walk up to the door and open it by clicking it.
  await key('KeyW');
  await wait(500);
  assert.equal(await state(`g.party.y`), 19);
  assert.equal(await state(`g.doorAt(11,18).target`), 0);
  await click(VIEW.x + 446, VIEW.y + 250);
  await wait(1400);
  assert.equal(await state(`g.doorAt(11,18).open`), 1, 'clicking the door opens it');
  await key('KeyW'); await wait(450);
  await key('KeyW'); await wait(450);
  assert.equal(await state(`g.party.y`), 17);

  // Fight through the action panel, with real clicks.
  await ev(`(() => { const g = window.__game; for (const e of g.entities) if (e.proto === 'giant-rat') { e.hp = e.maxHp = 40; g.ruleset.wake(g, e, 0); } })()`);
  await wait(2500);
  await shot('13-combat');
  await clickEl('.who[data-act="menu:0"]');
  await wait(100);
  await shot('14-actions');
  const before = await state(`g.party.members[0].actionReadyAt`);
  await clickEl('.act[data-act="do:attack:main"]');
  await wait(200);
  assert.ok((await state(`g.party.members[0].actionReadyAt`)) > before, 'attacking spends the Action');
  assert.equal(await ev(`document.querySelector('.who') !== null`), true, 'menu closes after acting');

  // Cast through the submenus.
  await clickEl('.who[data-act="menu:3"]');
  await clickEl('.act[data-act="sub:cast"]');
  await wait(100);
  await shot('15-spells');
  await clickEl('.act[data-act="do:cast:fire-bolt"]');
  await wait(150);
  await shot('16-firebolt');
  assert.ok((await state(`g.party.members[3].actionReadyAt`)) > (await state(`g.time`)), 'casting spends the Action');
  // Pause stops the clock.
  await key('Space');
  const t0 = await state(`g.time`);
  await wait(400);
  assert.equal(await state(`g.time`), t0);
  await key('Space');

  // Tour the rest of the world for a look at every kind of thing it draws.
  const go = (level, x, y, dir) => ev(`(() => { const g = window.__game; g.entities.forEach((e) => { if (e.level === g.party.level) e.awake = false; }); g.teleport({ level: '${level}', x: ${x}, y: ${y}, dir: ${dir} }); g.entities.forEach((e) => { e.awake = false; e.notBeforeCheck = 1e9; }); })()`);
  // Left and right must agree between the picture, clicks, movement and turning.
  await go('warren', 18, 15, 1); // Facing east: north is on the left, and its wall is much closer.
  await wait(100);
  const sideHit = (u) => ev(`(() => { const g = window.__game; window.__view.render(g, 0); return window.__view.pickScene(g, ${u}, 0.5).y; })()`);
  assert.ok((await sideHit(0.02)) < (await sideHit(0.98)), 'clicking the left of the view hits what is to the left');
  assert.ok(await ev(`(() => { const v = window.__view; return v.project(v.cam.x + 3, v.cam.y - 1, 0.5).x < 0.5 && v.project(v.cam.x + 3, v.cam.y + 1, 0.5).x > 0.5; })()`), 'north draws left of south when facing east');
  await go('warren', 11, 20, 0);
  await wait(450);
  await key('KeyA'); await wait(450);
  assert.equal(await state(`g.party.x`), 10, 'A sidesteps left, which is west when facing north');
  await key('KeyD'); await wait(450);
  assert.equal(await state(`g.party.x`), 11, 'D sidesteps right');
  await key('ArrowLeft'); await wait(450);
  assert.equal(await state(`g.party.x`), 10, 'the left arrow sidesteps left');
  await key('ArrowRight'); await wait(450);
  assert.equal(await state(`g.party.x`), 11, 'the right arrow sidesteps right');
  assert.equal(await state(`g.party.dir`), 0, 'arrows no longer turn');
  for (const [code, dir] of [['PageUp', 3], ['PageDown', 0], ['PageDown', 1], ['PageUp', 0], ['KeyQ', 3], ['KeyE', 0]]) {
    await key(code); await wait(60);
    assert.equal(await state(`g.party.dir`), dir, code);
  }
  await go('warren', 21, 4, 1); await wait(500); await shot('20-lever');
  // The lever must really be drawn in front of the wall, not just exist: its plate is mostly dark iron and
  // rust where the plain wall is lit stone, so compare the middle of the view with and without it.
  const centre = () => ev(`(() => { const c = document.querySelector('canvas'); const gl = window.__view.gl; window.__view.render(window.__game, 0); const p = new Uint8Array(4); gl.readPixels(c.width >> 1, c.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [...p].slice(0, 3); })()`);
  const withLever = await centre();
  await ev(`(() => { const o = window.__game.objectsAt(22, 4).find((w) => w.type === 'wall'); o.kind = 'none'; })()`);
  const withoutLever = await centre();
  await ev(`(() => { const o = window.__game.objectsAt(22, 4).find((w) => w.type === 'wall'); o.kind = 'lever'; })()`);
  assert.notDeepEqual(withLever, withoutLever, 'wall fixtures are visible');
  const gate = await state(`g.objectById('boss-gate').target`);
  await click(VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2);
  await wait(150);
  assert.notEqual(await state(`g.objectById('boss-gate').target`), gate, 'clicking the lever works it');
  await go('warren', 12, 4, 3); await wait(500); await shot('21-portcullis');
  await go('warren', 7, 5, 1); await wait(500); await shot('22-chest');
  await go('crypt', 2, 2, 1); await wait(500); await shot('23-crypt');
  await go('crypt', 4, 1, 0); await wait(500); await shot('24-font');
  await go('crypt', 14, 3, 1); await ev(`window.__game.doorAt(15,3).target = 1`); await wait(1500); await shot('25-skeletons');
  await go('crypt', 9, 11, 3); await wait(500); await shot('26-vesper');
  await go('warren', 3, 11, 3); await ev(`window.__game.doorAt(3,11).target = 1`); await wait(1400); await key('KeyW'); await wait(500); await shot('27-stairs');

  // Winning shows the end screen with the attribution.
  await ev(`window.__game.win('Clear water wells up.')`);
  await wait(400);
  await shot('30-victory');
  assert.match(await ev(`document.querySelector('.legal').textContent`), /SRD 5\.2\.1/);
}
