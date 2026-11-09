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
  assert.match(await ev(`document.querySelector('.pc img').getAttribute('src')`), /portrait-dwarf-barbarian/, 'the first pick is a dwarf');
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
  // The Features tab, reached by clicking: it has no key.
  await clickEl('[data-act="invmode:features"]');
  await wait(150);
  await shot('12b-features');
  assert.match(await ev(`document.querySelector('.features').textContent`), /Species: Human.*Class: Cleric.*Level 1.*Next: level 2 at 300 XP/s);
  await clickEl('[data-act="invmode:items"]');
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
  await ev(`window.__game.party.members.forEach((m) => { m.hp = m.maxHp = 300; })`); // Survive the wait for the round to pass.
  await wait(2500);
  await shot('13-combat');
  await shot('14-action-boxes');
  // The icons act directly, dim while recovering and light up again afterwards.
  // Panels redraw on the next frame, which can be slow under the software renderer.
  const until = async (expr) => { for (let i = 0; i < 50 && !(await ev(expr)); i++) await wait(100); assert.ok(await ev(expr), expr); };
  const quick = (i, act) => `document.querySelectorAll('.who')[${i}].querySelector('[data-act="quick:${i}:${act}"]')`;
  assert.equal(await ev(`${quick(1, 'attack:off')}.disabled`), false, 'a second Light weapon can attack');
  await until(`window.__game.ruleset.targetsFor(window.__game, window.__game.party.members[1], { maxFeet: 5, melee: true }).length > 0`);
  await clickEl(`.who:nth-child(2) [data-act="quick:1:attack:off"]`);
  await until(`${quick(1, 'attack:off')}.disabled`); // The off hand dims after attacking.
  assert.equal(await ev(`${quick(1, 'attack:main')}.disabled`), false, 'the Action is separate from the Bonus Action');
  await clickEl(`.who:nth-child(2) [data-act="quick:1:dodge"]`);
  await until(`${quick(1, 'attack:main')}.disabled`); // The main hand dims after spending the Action.
  await shot('14-dimmed');
  // Game time can lag real time under the software renderer, so wait on the clock itself.
  for (let i = 0; i < 100 && await state(`g.time < g.party.members[1].actionReadyAt`); i++) await wait(100);
  await wait(100);
  assert.equal(await ev(`${quick(1, 'attack:main')}.disabled`), false, 'the main hand lights up when the Action is back');
  // The Cast icon opens the spell list, and its Back returns to the boxes.
  await clickEl(`[data-act="quicksub:3:cast"]`);
  await wait(100);
  assert.ok(await ev(`!!document.querySelector('[data-act="do:cast:fire-bolt"]')`), 'Cast opens the spell list');
  await clickEl('.act[data-act="menu:up"]');
  await wait(100);
  assert.ok(await ev(`!!document.querySelector('.who')`), 'Back returns to the boxes');
  assert.equal(await ev(`document.querySelector('[data-act="quicksub:0:cast"]')`), null);
  // The panel hugs the boxes, and the title no longer does anything.
  const gap = await ev(`document.querySelector('#actions').getBoundingClientRect().bottom - document.querySelector('.who:last-child').getBoundingClientRect().bottom`);
  assert.ok(gap <= 8, `action panel fits its boxes tightly, gap ${gap}`);
  assert.equal(await ev(`document.querySelector('.whohead').hasAttribute('data-act')`), false, 'titles are not clickable');
  const before = await state(`g.party.members[0].actionReadyAt`);
  await clickEl('[data-act="quick:0:attack:main"]');
  await wait(200);
  assert.ok((await state(`g.party.members[0].actionReadyAt`)) > before, 'attacking spends the Action');
  assert.equal(await ev(`document.querySelector('.who') !== null`), true, 'menu closes after acting');

  // Cast through the submenus.
  await clickEl('[data-act="quicksub:3:cast"]');
  await wait(100);
  await shot('15-spells');
  await clickEl('.act[data-act="do:cast:fire-bolt"]');
  await wait(150);
  await shot('16-firebolt');
  assert.ok((await state(`g.party.members[3].actionReadyAt`)) > (await state(`g.time`)), 'casting spends the Action');
  // Pause stops the clock.
  await key('Space');
  const t0 = await state(`g.time`);
  const r0 = await state(`g.realTime`);
  const pos0 = await state(`[g.party.x, g.party.y, g.party.dir].join()`);
  await wait(400);
  assert.equal(await state(`g.time`), t0);
  assert.equal(await state(`g.realTime`), r0, 'animations run on realTime, which stops too');
  // Moving and acting are off, by icon and by key.
  await until(`[...document.querySelectorAll('#pad button, .quick, [data-act="rest"]')].every((b) => b.disabled)`);
  await key('KeyW'); await key('KeyQ'); await wait(100);
  assert.equal(await state(`[g.party.x, g.party.y, g.party.dir].join()`), pos0, 'keys do not move the party');
  await click(VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2); await wait(100);
  assert.equal(await state(`g.hand`), null, 'clicks in the view do nothing');
  // Gear and skills can be looked at but not rearranged.
  const packItem = await state(`g.party.members[2].pack.findIndex(Boolean)`);
  const packed = await state(`g.party.members[2].pack[${packItem}].proto`);
  await clickEl('[data-card="2"] .portrait');
  await until(`!document.querySelector('#inv').hidden && !!document.querySelector('[data-act="invmode:abilities"]')`);
  await clickEl('[data-act="invmode:items"]');
  await until(`!!document.querySelector('.pack')`);
  await clickEl(`.pack .slot:nth-child(${packItem + 1})`); await wait(100);
  assert.equal(await state(`g.hand`), null, 'items cannot be picked up from the pack');
  assert.equal(await state(`g.party.members[2].pack[${packItem}].proto`), packed);
  await clickEl('[data-act="invmode:abilities"]');
  await until(`!!document.querySelector('.ability')`);
  await shot('16-paused-skills');
  await clickEl('.ability'); await wait(100);
  assert.equal(await state(`(g.party.members[2].quick ?? []).filter(Boolean).length`), 0, 'quick slots cannot be changed');
  await clickEl('[data-act="invmode:items"]');
  await until(`!!document.querySelector('.pack')`);
  await clickEl('.close');
  await until(`document.querySelector('#inv').hidden`);
  await key('Space');
  await until(`!document.querySelector('#pad button').disabled`);

  // The inventory's second mode picks two skills or spells, which then appear on the action box.
  const ready3 = async () => { for (let i = 0; i < 100 && await state(`g.time < g.party.members[3].actionReadyAt`); i++) await wait(100); await wait(100); };
  const invClosed = `document.querySelector('#inv').hidden`;
  await clickEl('[data-card="3"] .portrait');
  await until(`!!document.querySelector('[data-act="invmode:abilities"]')`);
  await clickEl('[data-act="invmode:abilities"]');
  await until(`!!document.querySelector('.abilities')`);
  await clickEl('[data-act="quickset:3:cast:fire-bolt"]');
  await until(invClosed); // Picking closes the inventory.
  await until(`!!document.querySelector('[data-act="abilities:3"]')`);
  await clickEl('[data-act="abilities:3"]');
  await until(`document.querySelectorAll('.ability.on').length === 1`);
  const others = await ev(`[...document.querySelectorAll('.ability:not(.on)')].map((b) => b.dataset.act)`);
  assert.ok(others.length >= 2);
  await clickEl(`[data-act="${others[0]}"]`);
  await until(invClosed);
  await clickEl('[data-card="3"] .portrait');
  await until(`document.querySelectorAll('.ability.on').length === 2`);
  assert.equal(await ev(`document.querySelector('[data-act="${others[1]}"]').disabled`), true, 'a third choice is refused');
  await shot('17-abilities');
  // Removing keeps the list open so another can be chosen.
  await clickEl(`[data-act="${others[0]}"]`);
  await until(`document.querySelectorAll('.ability.on').length === 1`);
  assert.equal(await ev(invClosed), false, 'removing leaves the list open');
  await clickEl(`[data-act="${others[0]}"]`);
  await until(invClosed);
  await clickEl('[data-card="3"] .portrait');
  await until(`!document.querySelector('#inv').hidden && !!document.querySelector('[data-act="invmode:items"]')`);
  await clickEl('[data-act="invmode:items"]');
  await until(`!!document.querySelector('.pack')`);
  await clickEl('.close');
  await until(invClosed);
  await ready3();
  assert.equal(await state(`g.party.members[3].quick[0]`), 'cast:fire-bolt');
  await shot('18-quick-slots');
  const castAt = await state(`g.party.members[3].actionReadyAt`);
  await clickEl('[data-act="quick:3:cast:fire-bolt"]');
  await wait(100);
  assert.ok((await state(`g.party.members[3].actionReadyAt`)) > castAt, 'the quick slot casts the spell');
  assert.equal(await ev(`document.querySelector('[data-act="quick:3:cast:fire-bolt"]').disabled`), true, 'and dims while recovering');
  // Number keys open a character's pages: Shift for skills and spells, plain for items.
  const digit = (n, shiftKey) => ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit${n}', shiftKey: ${shiftKey} }))`);
  await digit(2, true);
  await until(`!!document.querySelector('.abilities') && !document.querySelector('#inv').hidden`);
  assert.equal(await ev(`!!document.querySelector('[data-act="menu:up"]')`), false, 'Shift+number no longer opens the action list');
  await digit(2, false);
  await until(`!!document.querySelector('.pack')`);
  await digit(2, true);
  await until(`!!document.querySelector('.abilities')`);
  await digit(2, true);
  await until(invClosed);
  await digit(2, false);
  await until(`!!document.querySelector('.pack') && !document.querySelector('#inv').hidden`);
  await digit(2, false);
  await until(invClosed);
  // Movement buttons sit in the text box and animate for clicks and keys alike.
  assert.ok(await ev(`!!document.querySelector('#log #pad') && !document.querySelector('#side #pad')`), 'the pad is in the text box');
  await ev(`(() => { window.__pressed = []; document.addEventListener('animationstart', (e) => { if (e.animationName === 'padpress') window.__pressed.push(e.target.dataset.act); }); })()`);
  const pressed = (act) => until(`window.__pressed.includes('${act}')`);
  await key('KeyW'); await pressed('step:0');
  await key('ArrowLeft'); await pressed('step:3');
  await key('PageUp'); await pressed('turn:-1');
  await clickEl('#pad [data-act="turn:1"]'); await pressed('turn:1');
  await key('KeyW'); await wait(60); // Pressing the same button again plays it again.
  const before2 = await ev(`window.__pressed.length`);
  await wait(400);
  await key('KeyW');
  await until(`window.__pressed.length > ${before2}`);
  await shot('19-pad');
  // The map sits in the corner, clear of the panels, and has been drawn on.
  const mapBox = await ev(`(() => { const m = document.querySelector('#automap').getBoundingClientRect(), a = document.querySelector('#actions').getBoundingClientRect(); return { left: m.left, right: m.right, top: m.top, bottom: m.bottom, actionsBottom: a.bottom }; })()`);
  assert.ok(mapBox.top >= mapBox.actionsBottom, 'the map is below the action boxes');
  assert.ok(mapBox.right <= 1280 && mapBox.bottom <= 800 && mapBox.left > 896, 'the map is in the bottom right corner');
  assert.ok(await ev(`(() => { const c = document.querySelector('#automap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; })()`), 'the map has something on it');
  // An empty slot goes straight to choosing.
  await clickEl('.who:nth-child(1) [data-act="abilities:0"]');
  await wait(100);
  assert.ok(await ev(`!!document.querySelector('.abilities')`), 'an empty slot opens the list');
  await clickEl('[data-act="invmode:items"]');
  await clickEl('.close');
  await wait(100);

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

  // Exit saves and goes straight to the main menu, and Continue resumes from where the party left.
  await go('warren', 11, 20, 0); await wait(450);
  await key('KeyK'); await wait(100);
  await key('KeyA'); await wait(450);
  assert.equal(await state(`g.party.x`), 10);
  await clickEl('[data-act="exit"]');
  await wait(100);
  await shot('28-exit');
  assert.equal(await ev(`document.querySelector('#go') !== null`), true, 'Exit reaches the main menu');
  await clickEl('#cont');
  await wait(300);
  assert.equal(await state(`g.party.x`), 10, 'Exit saved the step taken after the last manual save');

  // Winning shows the end screen with the attribution.
  await ev(`window.__game.win('Clear water wells up.')`);
  await wait(400);
  await shot('30-victory');
  assert.match(await ev(`document.querySelector('.legal').textContent`), /SRD 5\.2\.1/);
}
