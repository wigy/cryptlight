// The extracted data, checked against numbers read directly from the SRD text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SPELL_FX, DEFAULT_SPELLS, MAGIC_INITIATE } from '../rules/srd5/spells.js';
import { CLASS_TABLE, DEFAULT_MASTERIES, STANDARD_ARRAY, STARTING_GEAR, BACKGROUNDS, SPECIES } from '../rules/srd5/data.js';
import { newGame, srdChapters, loadModule } from './helpers.mjs';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/srd/${n}.json`, import.meta.url)));

test('all stat blocks are complete', () => {
  const monsters = load('monsters');
  assert.ok(monsters.length >= 330);
  for (const m of monsters) {
    assert.equal(Object.keys(m.abilities).length, 6, `${m.name} abilities`);
    for (const k of ['ac', 'hp', 'cr', 'xp']) assert.ok(m[k] != null, `${m.name}.${k}`);
    for (const e of m.actions ?? []) {
      if (/Attack Roll/.test(e.text)) {
        assert.ok(e.attack, `${m.name}: ${e.name} attack`);
        assert.ok(e.attack.reach || e.attack.range, `${m.name}: ${e.name} has reach or range`);
      }
    }
  }
});

test('stat block spot checks match the SRD', () => {
  const by = Object.fromEntries(load('monsters').map((m) => [m.id, m]));
  const gw = by['goblin-warrior'];
  assert.deepEqual([gw.ac, gw.hp, gw.xp, gw.cr], [15, 10, 50, '1/4']);
  assert.deepEqual(gw.actions[0].damage[0], { avg: 5, dice: '1d6+2', type: 'slashing', onAdvantage: false });
  assert.equal(gw.actions[0].damage[1].onAdvantage, true);
  assert.equal(by['giant-rat'].actions[0].attack.reach, 5); // Written "reach 5 feet" in the PDF.
  assert.equal(by.jackal.actions[0].damage[0].dice, '1d4-1'); // Written with an en dash in the PDF.
  assert.equal(by['giant-centipede'].abilities.str, 5); // Oddly spaced row in the PDF.
  assert.equal(by['adult-white-dragon'].abilities.con, 22); // "Con22" in the PDF.
  assert.ok(by.zombie.actions.some((a) => a.name === 'Slam')); // Its block crosses a chapter boundary.
  assert.ok(by.zombie.traits.some((t) => t.name === 'Undead Fortitude'));
  assert.equal(by.wolf.actions[0].name, 'Bite');
  assert.match(by.wolf.actions[0].text, /Piercing damage/); // Must not split into a fake "Piercing damage" entry.
});

test('spells parse, with wrapped class lists handled', () => {
  const spells = load('spells');
  assert.ok(spells.length >= 339);
  const by = Object.fromEntries(spells.map((s) => [s.id, s]));
  assert.equal(by['cure-wounds'].level, 1);
  assert.ok(by.blight, 'Blight has its own entry');
  assert.ok(!by.bless.description.includes('Blight'), 'no spell swallows the next');
  assert.equal(by['fire-bolt'].rangeFeet, 120);
  assert.deepEqual(by['magic-missile'].damageDice, { dice: '1d4+1', type: 'force' });
  assert.equal(by['divine-smite'].components, 'V'); // "Component:" singular in the PDF.
  for (const s of spells) for (const k of ['range', 'duration', 'castingTime', 'description']) assert.ok(s[k], `${s.name}.${k}`);
});

test('equipment tables', () => {
  const w = Object.fromEntries(load('weapons').map((x) => [x.id, x]));
  assert.equal(Object.keys(w).length, 38);
  assert.deepEqual(w.longsword.damage, { dice: '1d8', type: 'slashing' });
  assert.equal(w.longsword.props.versatile, '1d10');
  assert.equal(w.longsword.mastery, 'sap');
  assert.equal(w.longbow.props.ammunition.long, 600);
  assert.equal(w.dagger.props.thrown.range, 20);
  const a = Object.fromEntries(load('armor').map((x) => [x.id, x]));
  assert.equal(Object.keys(a).length, 13);
  assert.equal(a['plate-armor'].ac, 18);
  assert.equal(a['plate-armor'].strength, 15);
  assert.equal(a['chain-shirt'].dexMax, 2);
});

test('conditions are cleanly separated from neighbouring glossary entries', () => {
  const c = Object.fromEntries(load('conditions').map((x) => [x.id, x]));
  assert.equal(Object.keys(c).length, 15);
  assert.match(c.prone.description, /Disadvantage on attack rolls/);
  assert.ok(!c.prone.description.includes('Opportunity Attack is a Reaction'));
});

test('hand-entered tables agree with the SRD text', () => {
  const text = srdChapters();
  const array = text['character-creation'];
  assert.match(array, /Fighter\s+15\s+14\s+13\s+8\s+10\s+12/);
  assert.match(array, /Wizard\s+8\s+12\s+13\s+15\s+14\s+10/);
  assert.deepEqual(STANDARD_ARRAY.fighter, [15, 14, 13, 8, 10, 12]);
  for (const arr of Object.values(STANDARD_ARRAY)) assert.deepEqual([...arr].sort((x, y) => y - x), [15, 14, 13, 12, 10, 8]);
  assert.match(text['gameplay-toolbox'], /1\s+50\s+75\s+100/);
  assert.match(text.equipment, /Potion of Healing/);
  const classes = load('classes');
  const magic = load('magic-items').find((m) => m.id === 'potions-of-healing');
  assert.match(magic.description, /Potion of Healing\s+2d4 \+ 2/);
  assert.equal(classes.length, 12);
  assert.equal(classes.find((c) => c.id === 'fighter').hitDie, 10);
  assert.equal(classes.find((c) => c.id === 'wizard').hitDie, 6);
  assert.ok(Object.keys(CLASS_TABLE).length === 12);
  const origins = text['character-origins'];
  for (const [id, sp] of Object.entries(SPECIES)) assert.ok(new RegExp(sp.name).test(origins), id);
  for (const b of Object.values(BACKGROUNDS)) assert.ok(origins.includes(b.name));
});

test('every spell behaviour can resolve its numbers from the data', () => {
  const by = Object.fromEntries(load('spells').map((s) => [s.id, s]));
  for (const [id, fx] of Object.entries(SPELL_FX)) {
    assert.ok(by[id], `${id} is an SRD spell`);
    if (['attack', 'save', 'auto'].includes(fx.mode)) {
      assert.ok(fx.dice ?? by[id].damageDice?.dice, `${id} has dice`);
      assert.ok(fx.type ?? by[id].damageDice?.type, `${id} has a damage type`);
    }
    if (fx.mode === 'save') assert.ok(by[id].saveAbility, `${id} has a save`);
  }
});

test('default class picks only use real, legal, implemented things', async () => {
  const { srd } = await newGame();
  for (const [cls, picks] of Object.entries(DEFAULT_SPELLS)) {
    const name = srd.classes[cls].name;
    for (const id of [...picks.cantrips, ...picks.prepared]) {
      assert.ok(SPELL_FX[id], `${cls}: ${id} has a behaviour`);
      assert.ok(srd.spells[id].classes.includes(name), `${id} is on the ${name} list`);
    }
    assert.ok(picks.prepared.length >= CLASS_TABLE[cls].prepared[1], `${cls} has enough prepared picks for level 2`);
    assert.ok(picks.cantrips.length >= CLASS_TABLE[cls].cantrips[1], `${cls} has enough cantrips`);
  }
  for (const i of Object.values(MAGIC_INITIATE)) assert.ok(SPELL_FX[i.spell]);
  for (const gear of Object.values(STARTING_GEAR)) {
    for (const spec of [gear.armor, gear.mainHand, gear.offHand, ...gear.pack].filter(Boolean)) assert.ok(srd.items[spec.split(':')[0]], spec);
  }
  for (const [cls, list] of Object.entries(DEFAULT_MASTERIES)) {
    assert.equal(list.length, CLASS_TABLE[cls].masteries, cls);
    for (const id of list) assert.equal(srd.items[id].kind, 'weapon');
  }
});

test('module references exist and encounters fit the SRD budget', async () => {
  const { srd, ruleset } = await newGame();
  const module = loadModule();
  for (const level of Object.values(module.levels)) {
    for (const defs of Object.values(level.legend)) {
      for (const d of [defs].flat()) {
        if (d.type === 'monster') assert.ok(srd.monsters[d.proto], d.proto);
        if (d.type === 'item') assert.ok(srd.items[d.proto], d.proto);
        for (const it of d.items ?? []) assert.ok(srd.items[it.proto], it.proto);
      }
    }
  }
  const xp = (id, n = 1) => srd.monsters[id].xp * n;
  const HIGH_L1 = 100 * 4, HIGH_L2 = 200 * 4; // XP Budget per Character x party of four.
  assert.ok(xp('giant-rat', 3) <= HIGH_L1);
  assert.ok(xp('goblin-warrior', 3) <= HIGH_L1);
  assert.ok(xp('goblin-boss') + xp('goblin-warrior', 2) <= HIGH_L1);
  assert.ok(xp('cultist-fanatic') + xp('cultist', 2) <= HIGH_L2);
  assert.ok(ruleset.attribution.includes('SRD 5.2.1'));
});
