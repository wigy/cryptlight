// Real-input UI flow, run with: node tools/browser-check.mjs <outDir> test/browser/ui-flow.mjs
import assert from 'node:assert/strict';

const VIEW = { x: 2, y: 118, w: 892, h: 540 };
export default async function ({ eval: ev, click, drag, key, wait, shot }) {
  const state = (expr) => ev(`(() => { const g = window.__game; return ${expr}; })()`);
  const clickEl = async (sel) => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    assert.ok(r, `element ${sel}`);
    await click(r.x, r.y);
    await wait(120);
  };
  // Panels redraw on the next frame, which can be slow under the software renderer.
  const until = async (expr, tries = 50) => { for (let i = 0; i < tries && !(await ev(expr)); i++) await wait(100); assert.ok(await ev(expr), expr); };
  // Loading takes as long as it takes on a busy machine, and Continue only lights up once the save has been read.
  const reloadToMenu = async () => { await ev(`location.reload()`); await wait(500); await until(`document.querySelector('#cont')?.disabled === false`, 300); };
  await wait(1500);

  // Creator screen.
  await clickEl('#go');
  await wait(400);
  assert.equal(await ev(`document.querySelector('#confirm-new')`), null, 'with no save, New Game does not ask');
  await shot('10-creator');
  await ev(`(() => { const s = document.querySelector('select[data-i="0"][data-key="classId"]'); s.value = 'barbarian'; s.dispatchEvent(new Event('change')); })()`);
  await wait(200);
  assert.match(await ev(`document.querySelector('.pc img').getAttribute('src')`), /portrait-dwarf-barbarian/, 'the first pick is a dwarf');
  await ev(`(() => { const s = document.querySelector('select[data-i="0"][data-key="sex"]'); s.value = 'male'; s.dispatchEvent(new Event('change')); })()`);
  await wait(50);
  assert.match(await ev(`document.querySelector('.pc img').getAttribute('src')`), /portrait-dwarf-barbarian\.jpg/, 'the male dwarf barbarian is the original portrait');
  await ev(`(() => { const s = document.querySelector('select[data-i="0"][data-key="sex"]'); s.value = 'female'; s.dispatchEvent(new Event('change')); })()`);
  await wait(50);
  assert.match(await ev(`document.querySelector('.pc img').getAttribute('src')`), /portrait-dwarf-barbarian-female\.jpg/, 'choosing female swaps the portrait');
  await shot('creator-sex');
  await clickEl('#begin');
  await wait(400);
  // A new party is saved and on vacation, which is also where Continue finds it.
  await shot('10c-vacation');
  assert.match(await ev(`document.querySelector('.adventure').textContent`), /The Well at Thornwick.*Recommended levels 1\u20132/s);
  await reloadToMenu();
  await clickEl('#cont');
  await wait(300);
  assert.match(await ev(`document.querySelector('.member').textContent`), /Brunna.*Level 1 Barbarian/s);
  await clickEl('[data-adventure="thornwick"]');
  await wait(1200);
  assert.equal(await state(`[g.party.x, g.party.y, g.party.level].join()`), '11,20,warren', 'an adventure begins at its starting point');
  assert.equal(await state(`g.floorItems.some((f) => f.item.proto === 'thornwick-fang')`), true, 'the first run has the unique reward');
  assert.equal(await state(`g.party.members[0].classId`), 'barbarian');
  // Dragging a portrait onto another character swaps their places, and a click still opens the gear.
  const cardAt = (i) => ev(`(() => { const b = document.querySelector('[data-card="${i}"] .portrait').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const swapCards = async (i, j) => { const p = await cardAt(i), q = await cardAt(j); await drag(p.x, p.y, q.x, q.y); await wait(500); };
  const order = `g.party.members.map((m) => m.name).join()`;
  const start = await state(order);
  await clickEl('[data-card="0"] .portrait');
  await until(`!document.querySelector('#inv').hidden`);
  await swapCards(0, 2);
  assert.notEqual(await state(order), start, 'the drag swapped them');
  assert.equal(await ev(`document.querySelector('#inv h3, #inv .sheet')?.textContent.includes(${JSON.stringify(start.split(',')[0])}) ?? false`), true, 'the open sheet stays with its character');
  await shot('marching-order');
  await swapCards(0, 2);
  assert.equal(await state(order), start);
  // The whole box follows the pointer, and can be picked up by its name.
  const centreOf = (sel) => ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const nameAt = await centreOf('[data-card="0"] .cname'), target = await cardAt(1);
  await drag(nameAt.x, nameAt.y, target.x, target.y + 8, async () => {
    await wait(150);
    assert.match(await ev(`document.querySelector('.dragghost')?.textContent ?? ''`), new RegExp(start.split(',')[0]), 'the box is in the air');
    assert.ok(await ev(`document.querySelectorAll('.dragghost .slot').length`) >= 2, 'with its items');
    assert.equal(await ev(`document.querySelector('[data-card="1"]').classList.contains('dragto')`), true, 'and the box under it is marked');
    const g = await centreOf('.dragghost');
    assert.ok(Math.abs(g.y - target.y) < 60 && Math.abs(g.x - target.x) < 150, 'under the pointer');
    assert.equal(await ev(`document.querySelector('#hint').hidden`), true, 'no hint in the way');
    await shot('dragging-card');
  });
  await wait(500);
  const [n1, n2, n3, n4] = start.split(',');
  assert.equal(await state(order), [n2, n1, n3, n4].join(), 'dropped on the other character');
  assert.equal(await ev(`document.querySelector('.dragghost')`), null, 'and the copy is gone');
  await swapCards(0, 1);
  assert.equal(await state(order), start);
  // The item slots don't pick up the box: Brunna's off hand is empty, so this does nothing at all.
  const slotAt = await centreOf('[data-card="0"] [data-act="slot:0:offHand"]');
  await drag(slotAt.x, slotAt.y, target.x, target.y);
  await wait(500);
  assert.equal(await state(order), start, 'an item slot is not a handle');
  assert.equal(await ev(`document.querySelector('.dragghost')`), null);
  await clickEl('[data-card="0"] .portrait');
  await until(`document.querySelector('#inv').hidden`);
  assert.equal(await state(`g.party.members[0].equipment.mainHand.proto`), 'greataxe');
  await key('KeyK');
  await wait(100);

  // Back to the default party through the menu, proving Continue exists now.
  await reloadToMenu();
  assert.equal(await ev(`document.querySelector('#cont').disabled`), false);
  // View Party and the licenses are on the main menu too.
  await clickEl('#title-party');
  await wait(200);
  assert.equal(await ev(`document.querySelectorAll('.partycard').length`), 4, 'the menu shows the saved party');
  await clickEl('#party-back');
  await wait(200);
  await until(`document.querySelector('#cont')?.disabled === false`);
  await clickEl('#title-license');
  await until(`!!document.querySelector('#license-back')`);
  assert.match(await ev(`document.querySelector('.license-text').textContent`), /MIT License.*SRD 5\.2\.1.*The Well at Thornwick.*Gemini.*Permission is hereby granted/s);
  await shot('license-menu');
  await clickEl('#license-back');
  await wait(200);
  await until(`document.querySelector('#cont')?.disabled === false`);
  // With a save to lose, New Game asks first, and Cancel or Escape leaves everything as it was.
  const asking = `document.querySelector('#confirm-new').open`;
  await clickEl('#go');
  await wait(200);
  await shot('10b-confirm-new');
  assert.equal(await ev(asking), true, 'New Game opens the dialog');
  assert.equal(await ev(`document.querySelector('#begin')`), null, 'New Game asks before reaching the creator');
  await clickEl('#newgame-no');
  assert.equal(await ev(asking), false, 'Cancel closes the dialog');
  assert.equal(await ev(`document.querySelector('#go') !== null`), true, 'Cancel stays on the main menu');
  await clickEl('#go');
  await wait(200);
  await key('Escape');
  await wait(100);
  assert.equal(await ev(asking), false, 'Escape closes the dialog');
  await clickEl('#go');
  await wait(200);
  await clickEl('#newgame-yes');
  await wait(400);
  await clickEl('#begin');
  await wait(400);
  await clickEl('[data-adventure="thornwick"]');
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

  // Exit asks first when there is something unsaved. The game holds still while it asks.
  await go('warren', 11, 20, 0); await wait(450);
  await key('KeyK'); await wait(100);
  await key('KeyA'); await wait(450);
  assert.equal(await state(`g.party.x`), 10);
  await clickEl('[data-act="exit"]');
  await wait(100);
  assert.equal(await ev(`document.querySelector('#confirm-exit').open`), true, 'an unsaved step makes Exit ask');
  assert.equal(await state(`g.paused`), true);
  await shot('28-exit');
  await key('KeyD'); await wait(200);
  assert.equal(await state(`g.party.x`), 10, 'keys do not reach the game behind the dialog');
  await clickEl('[data-act="exit:cancel"]');
  assert.equal(await ev(`document.querySelector('#confirm-exit').open`), false);
  assert.equal(await state(`g.paused`), false, 'Cancel goes back to the game as it was');
  await clickEl('[data-act="exit"]');
  await clickEl('[data-act="exit:save"]');
  await wait(300);
  assert.equal(await ev(`document.querySelector('#go') !== null`), true, 'Save and Exit reaches the main menu');
  // A save from inside an adventure can be looked at from the menu too, with no way to hire into it.
  await until(`document.querySelector('#title-party')?.disabled === false`);
  await clickEl('#title-party');
  await wait(200);
  assert.equal(await ev(`document.querySelectorAll('.partycard').length`), 4, 'the party in the adventure');
  assert.equal(await ev(`document.querySelector('[data-hire]')`), null);
  await clickEl('#party-back');
  await wait(200);
  await until(`document.querySelector('#cont')?.disabled === false`);
  await clickEl('#cont');
  await wait(300);
  assert.equal(await state(`g.party.x`), 10, 'Save and Exit saved the step taken after the last manual save');
  // Just loaded, so there is nothing to lose: Exit goes straight to the menu.
  await wait(1000);
  await clickEl('[data-act="exit"]');
  await wait(300);
  assert.equal(await ev(`document.querySelector('#go') !== null`), true, 'with nothing unsaved, Exit does not ask');
  await until(`document.querySelector('#cont')?.disabled === false`);
  await clickEl('#cont');
  await wait(300);
  // Exit Without Saving drops what was done since the save.
  await key('KeyD'); await wait(450);
  assert.equal(await state(`g.party.x`), 11);
  await clickEl('[data-act="exit"]');
  await clickEl('[data-act="exit:discard"]');
  await wait(300);
  await until(`document.querySelector('#cont')?.disabled === false`);
  await clickEl('#cont');
  await wait(300);
  assert.equal(await state(`g.party.x`), 10, 'Exit Without Saving kept the save as it was');

  // Taking an exit puts the party on vacation, with what it earned but not what belongs to the adventure.
  await ev(`(() => { const m = window.__game.party.members[0]; m.xp = 123; m.pack[m.pack.indexOf(null)] = { uid: 'k', proto: 'iron-key' }; })()`);
  await go('warren', 9, 21, 2); await wait(450);
  await key('KeyW');
  await wait(400);
  await shot('29-left');
  assert.match(await ev(`document.querySelector('#vacation h2').textContent`), /climb the rope/);
  await reloadToMenu();
  await clickEl('#cont');
  await wait(300);
  await clickEl('[data-adventure="thornwick"]');
  await wait(1000);
  assert.equal(await state(`g.party.members[0].xp`), 123, 'the party is saved as it left');
  assert.equal(await state(`g.party.members[0].pack.some((it) => it?.proto === 'iron-key')`), false, 'the key stays in the adventure');
  assert.equal(await state(`[g.party.x, g.party.y].join()`), '11,20');

  // Winning shows the end screen with the attribution.
  await ev(`window.__game.win('Clear water wells up.')`);
  await wait(400);
  await shot('30-victory');
  assert.match(await ev(`document.querySelector('.legal').textContent`), /SRD 5\.2\.1/);
  await clickEl('#endmenu');
  await wait(300);
  assert.ok(await ev(`!!document.querySelector('#vacation')`), 'the end of the adventure is an exit too');
  assert.ok(await ev(`!!document.querySelector('[data-adventure="thornwick"]')`), 'and it can be played again');
  // The marching order can be changed between adventures, and is saved.
  const names = `[...document.querySelectorAll('.member b')].map((b) => b.textContent).join()`;
  const marching = await ev(names);
  await clickEl('[data-member="0"]');
  await wait(100);
  assert.equal(await ev(`document.querySelector('[data-member="0"]').classList.contains('picked')`), true);
  await shot('vacation-picked');
  await clickEl('[data-member="2"]');
  await wait(300);
  const [p1, p2, p3, p4] = marching.split(',');
  assert.equal(await ev(names), [p3, p2, p1, p4].join());
  assert.equal(await ev(`fetch('api/save').then((r) => r.json()).then((s) => s.members.map((m) => m.name).join())`), [p3, p2, p1, p4].join(), 'saved');
  await clickEl('[data-member="0"]');
  await wait(100);
  await clickEl('[data-member="2"]');
  await wait(300);
  assert.equal(await ev(names), marching);

  await clickEl('[data-license="thornwick"]');
  await until(`!!document.querySelector('#license-back')`);
  assert.match(await ev(`document.querySelector('.license-text').textContent`), /Adventure.*SRD 5\.2\.1.*Permission is hereby granted/s);
  await clickEl('#license-back');
  await wait(200);
  await shot('vacation-license-link');
  await clickEl('#view-party');
  await wait(200);
  assert.equal(await ev(`document.querySelectorAll('.partycard').length`), 4, 'View Party shows all four');
  assert.equal(await ev(`document.querySelector('[data-hire]')`), null, 'nobody to replace yet');
  await clickEl('#party-back');
  await wait(200);

  // Someone dies, and their replacement starts at the level of the lowest of the others.
  await clickEl('[data-adventure="thornwick"]');
  await wait(800);
  await ev(`window.__game.party.members.forEach((m, i) => { m.level = 2; if (i === 1) { m.dead = true; m.hp = 0; m.pack[m.pack.indexOf(null)] = { uid: 'fang', proto: 'thornwick-fang' }; } })`);
  await go('warren', 9, 21, 2); await wait(450);
  await key('KeyW');
  await wait(400);
  await clickEl('#view-party');
  await wait(200);
  await shot('30b-party');
  assert.equal(await ev(`document.querySelectorAll('[data-hire]').length`), 1);
  // Pip died in the front rank, so Elowen stepped up and Pip's place is now at the back.
  await clickEl('[data-hire="3"]');
  await wait(200);
  assert.match(await ev(`document.querySelector('#hire').textContent`), /at level 2.*Pip/s);
  await ev(`(() => { const s = document.querySelector('select[data-key="classId"]'); s.value = 'wizard'; s.dispatchEvent(new Event('change')); })()`);
  await wait(200);
  await shot('30c-hire');
  await clickEl('#hire-go');
  await wait(300);
  assert.equal(await ev(`document.querySelector('[data-hire]')`), null, 'the slot is filled');
  // It lasts, and the new character goes along.
  await reloadToMenu();
  await clickEl('#cont');
  await wait(300);
  assert.match(await ev(`document.querySelectorAll('.member')[3].textContent`), /Recruit.*Level 2 Wizard/s);
  await clickEl('[data-adventure="thornwick"]');
  await wait(800);
  assert.deepEqual(await state(`[g.party.members[3].name, g.party.members[3].level, g.party.members[3].xp, !!g.party.members[3].dead]`), ['Recruit', 2, 300, false]);
  assert.equal(await state(`g.party.members[3].pack.some((it) => it?.uid === 'fang')`), true, 'the fallen character\'s gear follows the party');
  assert.equal(await state(`g.floorItems.some((f) => f.item.proto === 'thornwick-fang')`), false, 'and a unique reward is not there again');
  await go('warren', 9, 21, 2); await wait(450);
  await key('KeyW');
  await wait(400);

  // The second adventure is on offer, with its own license.
  await clickEl('[data-license="barrow"]');
  await until(`!!document.querySelector('#license-back')`);
  assert.match(await ev(`document.querySelector('.license-text').textContent`), /L\. Shaffrey.*Attribution-ShareAlike 3\.0/s);
  await shot('32-barrow-license');
  await clickEl('#license-back');
  await wait(200);
  await shot('33-two-adventures');
  await clickEl('[data-adventure="barrow"]');
  await wait(800);
  assert.equal(await state(`g.party.level`), 'hillside');
  await shot('34-barrow-hillside');
  await ev(`window.__game.useObject(window.__game.objectById('rubble'))`);
  assert.equal(await state(`g.objectById('rubble')`), null, 'the rubble can be dug out');
  // Salt is scuffed by clicking the floor it lies on.
  await go('upper', 6, 2, 0); await wait(450);
  await shot('35-barrow-salt');
  for (const v of [0.95, 0.9, 0.85, 0.8, 0.75, 0.7]) {
    if (await state(`g.objectsAt(6, 1).find((o) => o.type === 'ward').broken`)) break;
    await click(VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h * v);
    await wait(120);
  }
  assert.equal(await state(`!!g.objectsAt(6, 1).find((o) => o.type === 'ward').broken`), true, 'a click on the floor breaks the salt');
  await go('upper', 3, 3, 2); await wait(450);
  await shot('36-barrow-anders');
  await go('upper', 6, 7, 2); await wait(450);
  await shot('37-barrow-tomb');
  await go('lower', 14, 3, 0); await wait(450);
  await shot('38-barrow-chamber');
  await go('lower', 14, 2, 3); await wait(450);
  await shot('39-barrow-throne');
  await go('lower', 12, 1, 0); await wait(450);
  await shot('39b-barrow-ethelred');
  await go('lower', 16, 1, 0); await wait(450);
  await shot('39c-barrow-olaf');
  await go('lower', 14, 9, 0); await wait(450);
  await shot('40-barrow-traitors');
  await go('lower', 14, 8, 3); await wait(450);
  await shot('41-barrow-ghoul');
  // Walking out of the mound without news of Anders is a plain exit.
  await go('hillside', 2, 2, 3); await wait(450);
  await key('KeyW');
  await wait(400);
  assert.ok(await ev(`!!document.querySelector('#vacation')`), 'back on vacation');

  // Once the party has outgrown it, it can't.
  await clickEl('[data-adventure="thornwick"]');
  await wait(800);
  await ev(`window.__game.party.members.forEach((m) => { m.level = 3; })`);
  await go('warren', 9, 21, 2); await wait(450);
  await key('KeyW');
  await wait(400);
  await shot('31-outgrown');
  assert.equal(await ev(`document.querySelector('[data-adventure="thornwick"]')`), null, 'no way to set out');
  assert.match(await ev(`document.querySelector('.adventure button').textContent`), /outgrown/);
  assert.equal(await ev(`document.querySelector('.adventure button').disabled`), true);
}
