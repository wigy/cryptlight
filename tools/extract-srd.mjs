#!/usr/bin/env node
// Builds data/srd/*.json from the official SRD 5.2.1 PDF (CC-BY-4.0).
// Only the SRD is used: other material on the publisher's site is not openly licensed.
// Requires poppler's `pdftotext`. Usage: node tools/extract-srd.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache');
const OUT = join(ROOT, 'data', 'srd');
const PDF = join(CACHE, 'SRD_CC_v5.2.1.pdf');
const URL = 'https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf';
export const ATTRIBUTION = 'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

const PAGES = { spells: [107, 175], glossary: [176, 191], toolbox: [192, 203], items: [209, 253], monsters: [258, 343], animals: [344, 364] };
const PAGE_W = 594, PAGE_H = 783, GUTTER = 297;

mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });
if (!existsSync(PDF)) {
  console.log('downloading SRD…');
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  writeFileSync(PDF, Buffer.from(await res.arrayBuffer()));
}

function text(first, last, crop) {
  const args = ['-layout', '-f', String(first), '-l', String(last)];
  if (crop) args.push('-x', String(crop[0]), '-y', '0', '-W', String(crop[1]), '-H', String(PAGE_H));
  return execFileSync('pdftotext', [...args, PDF, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
}

const isFooter = (l) => /System Reference Document 5\.2\.1\s*$/.test(l) || /^\s*\d+\s*$/.test(l);
/** Reads pages column by column, returning trimmed lines in reading order. */
function columns(first, last) {
  const out = [];
  for (let p = first; p <= last; p++) {
    for (const crop of [[0, GUTTER], [GUTTER, PAGE_W - GUTTER]]) {
      for (const raw of text(p, p, crop).split(/\r?\n|\f/)) {
        if (!isFooter(raw)) out.push(raw.replace(/\t/g, ' ').trim());
      }
    }
  }
  return out;
}

// The PDF writes minus signs variously as − or – ("1d4 – 1").
const clean = (s) => s.replace(/\u00ad/g, '').replace(/\s+/g, ' ').replace(/−/g, '-').replace(/(\d) – (\d)/g, '$1 - $2').trim();
/** Joins wrapped lines, repairing words hyphenated at line ends. */
function joinLines(lines) {
  let s = '';
  for (const l of lines) {
    if (!l) continue;
    if (/[a-z]-$/.test(s) && /^[a-z]/.test(l)) s = s.slice(0, -1) + l;
    else s += (s ? ' ' : '') + l;
  }
  return clean(s);
}
const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const num = (s) => Number(String(s).replace(/[−–]/g, '-').replace(/,/g, ''));

// ---------------------------------------------------------------- monsters
const SIZE = 'Tiny|Small|Medium|Large|Huge|Gargantuan';
const TYPE_LINE = new RegExp(`^((?:${SIZE})(?:(?: or |, )(?:${SIZE}))*) (Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead|Swarm)\\b(.*)$`);
const SECTIONS = { Traits: 'traits', Actions: 'actions', 'Bonus Actions': 'bonusActions', Reactions: 'reactions', 'Legendary Actions': 'legendaryActions' };
// Entry titles are Title Case ("Web (Recharge 5–6)."), which keeps a wrapped "Piercing damage. If…" from matching.
const SMALL = '(?:of|the|and|or|in|on|to|with|a|an|from|for|by)';
const ENTRY = new RegExp(`^([A-Z][A-Za-z’'\\-]*(?: (?:[A-Z][A-Za-z’'\\-]*|${SMALL}|\\([^)]*\\)))*)\\. (.*)$`);

export function parseAttack(entryText) {
  const out = {};
  const a = entryText.match(/(Melee or Ranged|Melee|Ranged) Attack Roll: \+?(-?\d+)(?: to hit)?(?: \([^)]*\))?(?:, reach (\d+) (?:ft\.?|feet))?(?:,? or)?(?:,? range (\d+)(?:\/(\d+))? (?:ft\.?|feet))?/);
  if (a) {
    out.attack = { kind: a[1].toLowerCase().replace(' or ', '-or-'), bonus: num(a[2]) };
    if (a[3]) out.attack.reach = num(a[3]);
    if (a[4]) { out.attack.range = num(a[4]); out.attack.longRange = num(a[5] ?? a[4]); }
  }
  const s = entryText.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)/);
  if (s) out.save = { ability: s[1].slice(0, 3).toLowerCase(), dc: num(s[2]) };
  const dmg = [];
  const re = /(\d+) \((\d+d\d+(?: ?[+-] ?\d+)?)\) ([A-Z][a-z]+) damage/g;
  for (let m; (m = re.exec(entryText));) {
    dmg.push({ avg: num(m[1]), dice: m[2].replace(/ /g, ''), type: m[3].toLowerCase(), onAdvantage: /^[^.]{0,6}if the attack roll had Advantage/.test(entryText.slice(re.lastIndex)) });
  }
  if (!dmg.length) {
    const f = entryText.match(/Hit: (\d+) ([A-Z][a-z]+) damage/);
    if (f) dmg.push({ avg: num(f[1]), dice: f[1], type: f[2].toLowerCase() });
  }
  if (dmg.length) out.damage = dmg;
  const conds = [...entryText.matchAll(/\b(?:has|have|gains?) the ([A-Z][a-z]+) condition/g)].map((m) => m[1].toLowerCase());
  if (conds.length) out.conditions = [...new Set(conds)];
  const hb = entryText.match(/\(escape DC (\d+)\)/);
  if (hb) out.escapeDC = num(hb[1]);
  return out;
}

function parseStatBlock(name, group, lines, category) {
  const m = { id: slug(name), name, category, group: group ?? undefined };
  const t = lines[0].match(TYPE_LINE);
  m.size = t[1].split(/ or |, /);
  m.type = t[2].toLowerCase();
  const rest = t[3].trim();
  const al = rest.match(/^(?:\(([^)]*)\))?,?\s*(.*)$/);
  if (al) { m.tags = al[1] ? al[1].split(', ') : []; m.alignment = al[2]; }
  m.abilities = {}; m.saves = {};
  let section = null, cur = null, i = 1;
  const sections = { traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [] };
  const flush = () => {
    if (!cur) return;
    const text = joinLines(cur.lines);
    sections[section].push({ name: cur.name, text, ...parseAttack(text) });
    cur = null;
  };
  let intro = [];
  let field = null;
  const FIELDS = { Skills: 'skills', Gear: 'gear', Senses: 'senses', Languages: 'languages', Resistances: 'resistances', Vulnerabilities: 'vulnerabilities', Immunities: 'immunities' };
  const buf = {};
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (!section) {
      let x;
      if ((x = l.match(/^AC (\d+)/))) m.ac = num(x[1]);
      const init = l.match(/Initiative ([+\-−]\d+) \((\d+)\)/);
      if (init) { m.initiative = num(init[1]); field = null; continue; }
      if ((x = l.match(/^HP (\d+)(?: \(([^)]+)\))?/))) { m.hp = num(x[1]); m.hitDice = x[2]?.replace(/ /g, ''); field = null; continue; }
      if ((x = l.match(/^Speed (.*)$/))) { m.speedText = clean(x[1]); field = null; continue; }
      if (/^(MOD SAVE\s*)+$/.test(l)) continue;
      let got = false;
      // Tolerates PDF typos: "Con22 +6 +6" and an unsigned save in "Int 6 −2 2".
      for (const s of l.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha) *(\d+) +([+\-−–]\d+) +([+\-−–]?\d+)/g)) {
        const mod = num(s[3]);
        const save = /^\d/.test(s[4]) && Math.abs(mod) === num(s[4]) ? mod : num(s[4]);
        m.abilities[s[1].toLowerCase()] = num(s[2]); m.saves[s[1].toLowerCase()] = save; got = true;
      }
      if (got) continue;
      if ((x = l.match(/^CR (\S+) \((?:XP )?([\d,]+)(?: XP)?(?:, or [^;]*)?; PB \+(\d+)\)/))) {
        m.cr = x[1]; m.xp = num(x[2]); m.pb = num(x[3]); field = null; continue;
      }
      const fieldMatch = l.match(/^(Skills|Gear|Senses|Languages|Resistances|Vulnerabilities|Immunities) (.*)$/);
      if (fieldMatch) { field = FIELDS[fieldMatch[1]]; buf[field] = fieldMatch[2]; continue; }
      if (SECTIONS[l]) { section = SECTIONS[l]; continue; }
      const entry = l.match(ENTRY);
      if (entry || m.cr) { section = 'traits'; } // Traits heading can be omitted after page breaks
      else if (field) { buf[field] += ' ' + l; continue; }
      else { intro.push(l); continue; }
    }
    if (SECTIONS[l]) { flush(); section = SECTIONS[l]; continue; }
    const e = l.match(ENTRY);
    const prevEnded = !cur || /[.:”]$|\)\.$/.test(cur.lines.at(-1) ?? '.');
    if (e && prevEnded) { flush(); cur = { name: clean(e[1]), lines: [e[2]] }; continue; }
    if (cur) cur.lines.push(l);
    else if (section === 'legendaryActions') cur = { name: 'Legendary Actions', lines: [l] };
  }
  flush();
  for (const [k, v] of Object.entries(buf)) buf[k] = clean(v);
  if (buf.skills) m.skills = Object.fromEntries(buf.skills.split(', ').map((s) => { const x = s.match(/^(.*) ([+\-]\d+)$/); return x ? [slug(x[1]), num(x[2])] : [slug(s), 0]; }));
  if (buf.gear) m.gear = buf.gear.split(', ');
  if (buf.languages) m.languages = buf.languages;
  if (buf.senses) {
    m.senses = {};
    for (const s of buf.senses.matchAll(/(Blindsight|Darkvision|Tremorsense|Truesight) (\d+) ft/g)) m.senses[s[1].toLowerCase()] = num(s[2]);
    const pp = buf.senses.match(/Passive Perception (\d+)/);
    if (pp) m.passivePerception = num(pp[1]);
  }
  const low = (s) => s.toLowerCase().split(/, | and |; /).map((x) => x.trim()).filter(Boolean);
  if (buf.resistances) m.resistances = low(buf.resistances);
  if (buf.vulnerabilities) m.vulnerabilities = low(buf.vulnerabilities);
  if (buf.immunities) {
    const [d, c] = buf.immunities.includes(';') ? buf.immunities.split(';') : (/(Poison|Fire|Cold|Necrotic|Psychic|Acid|Lightning|Thunder|Radiant|Force|Bludgeoning|Piercing|Slashing)\b/.test(buf.immunities) ? [buf.immunities, ''] : ['', buf.immunities]);
    m.damageImmunities = low(d); m.conditionImmunities = low(c);
  }
  m.speed = {};
  for (const s of (m.speedText ?? '').matchAll(/(?:(Burrow|Climb|Fly|Swim) )?(\d+) ft/g)) m.speed[(s[1] ?? 'walk').toLowerCase()] = num(s[2]);
  for (const [k, v] of Object.entries(sections)) if (v.length) m[k] = v;
  // A group heading ("Goblins") may have been swallowed by the previous entry; handled by caller.
  return m;
}

function parseMonsters(lines) {
  // Stat blocks can straddle the Monsters/Animals boundary, so both chapters are one stream.
  const animalsAt = lines.findIndex((l, i) => l === 'Animals' && lines.slice(i + 1, i + 40).some((x) => /Stat Block|Allosaurus/.test(x)));
  if (animalsAt < 0) throw new Error('Animals heading not found');
  const starts = [];
  for (let i = 1; i < lines.length; i++) {
    if (!TYPE_LINE.test(lines[i])) continue;
    let k = i - 1; while (k >= 0 && !lines[k]) k--;
    const window = lines.slice(i + 1, i + 8).join(' ');
    if (!/\bAC \d+/.test(window)) continue;
    starts.push({ i, nameAt: k, name: lines[k] });
  }
  const out = [];
  starts.forEach((s, n) => {
    const end = n + 1 < starts.length ? starts[n + 1].nameAt : lines.length;
    // Trailing heading lines before the next block: short title-case lines without punctuation.
    let e = end;
    let group;
    for (let back = 0; back < 3; back++) {
      let k = e - 1; while (k > s.i && !lines[k]) k--;
      if (k > s.i && lines[k].length < 42 && /^[A-Z][A-Za-z’' \-]+$/.test(lines[k]) && !SECTIONS[lines[k]] && /[.:)]$|^$/.test(lines[k - 1] ?? '')) { group = lines[k]; e = k; } else break;
    }
    if (n + 1 < starts.length) starts[n + 1].group = group;
    out.push(parseStatBlock(s.name, s.group, lines.slice(s.i, e), s.i > animalsAt ? 'animal' : 'monster'));
  });
  return out;
}

// ---------------------------------------------------------------- spells
function parseSpells(raw) {
  // Long class lists wrap ("…Warlock, Wiz-\nard)"): rejoin before matching.
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    let l = raw[i];
    while (/^(?:Level \d \w+|\w+ Cantrip) \([^)]*$/.test(l) && i + 1 < raw.length) { i++; l = /-$/.test(l) ? l.slice(0, -1) + raw[i] : `${l} ${raw[i]}`; }
    lines.push(l);
  }
  const HEAD = /^(?:Level (\d) (\w+)|(\w+) Cantrip) \(([^)]+)\)\s*$/;
  const starts = [];
  lines.forEach((l, i) => { if (HEAD.test(l)) { let k = i - 1; while (k >= 0 && !lines[k]) k--; starts.push({ i, name: lines[k], nameAt: k }); } });
  return starts.map((s, n) => {
    const h = lines[s.i].match(HEAD);
    const body = lines.slice(s.i + 1, n + 1 < starts.length ? starts[n + 1].nameAt : lines.length);
    const sp = { id: slug(s.name), name: s.name, level: h[1] ? num(h[1]) : 0, school: (h[2] ?? h[3]).toLowerCase(), classes: h[4].split(', ') };
    const fields = {}; let cur = null; const desc = []; let inHeader = true;
    for (const l of body) {
      const f = inHeader && l.match(/^(Casting Time|Range|Components?|Duration): (.*)$/);
      if (f) { cur = f[1] === "Component" ? "Components" : f[1]; fields[cur] = f[2]; continue; }
      if (inHeader && cur && l && !fields.Duration) { fields[cur] += ' ' + l; continue; }
      if (inHeader && cur === 'Duration' && l && !/^[A-Z]/.test(l)) { fields[cur] += ' ' + l; continue; }
      if (cur === 'Duration' && l) inHeader = false;
      if (!inHeader) desc.push(l);
    }
    sp.castingTime = clean(fields['Casting Time'] ?? ''); sp.range = clean(fields.Range ?? '');
    sp.components = clean(fields.Components ?? ''); sp.duration = clean(fields.Duration ?? '');
    sp.concentration = /^Concentration/.test(sp.duration); sp.ritual = /Ritual/.test(sp.castingTime);
    sp.description = joinLines(desc);
    const r = sp.range.match(/(\d+) (feet|mile)/);
    sp.rangeFeet = r ? num(r[1]) * (r[2] === 'mile' ? 5280 : 1) : sp.range.startsWith('Touch') ? 5 : 0;
    Object.assign(sp, parseAttack(sp.description));
    const atk = sp.description.match(/(melee|ranged) spell attack/i);
    if (atk) sp.spellAttack = atk[1].toLowerCase();
    const sv = sp.description.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/);
    if (sv) sp.saveAbility = sv[1].slice(0, 3).toLowerCase();
    const dd = sp.description.match(/(\d+d\d+(?: ?\+ ?\d+)?) ([A-Z][a-z]+) damage/);
    if (dd) sp.damageDice = { dice: dd[1].replace(/ /g, ''), type: dd[2].toLowerCase() };
    return sp;
  });
}

// ---------------------------------------------------------------- magic items
function parseMagicItems(raw) {
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    let l = raw[i];
    while (/^(Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Weapon|Wondrous Item)\b/.test(l) && /,$|\([^)]*$/.test(l) && raw[i + 1]) { i++; l += ` ${raw[i]}`; }
    lines.push(l);
  }
  const HEAD = /^(Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Weapon|Wondrous Item)\b.*?,? ?(Common|Uncommon|Very Rare|Rare|Legendary|Artifact|Rarity Varies|Varies|.*?(?:Rarity|Rare|Uncommon|Legendary))/;
  const starts = [];
  lines.forEach((l, i) => {
    if (!HEAD.test(l) || !/,/.test(l)) return;
    let k = i - 1; while (k >= 0 && !lines[k]) k--;
    if (k < 0 || lines[k].length >= 50 || /[.,:;]$/.test(lines[k])) return;
    // Wrapped names: "Amulet of Proof against Detection" / "and Location".
    if (/^[a-z]/.test(lines[k]) && lines[k - 1]) starts.push({ i, name: `${lines[k - 1]} ${lines[k]}`, nameAt: k - 1 });
    else starts.push({ i, name: lines[k], nameAt: k });
  });
  return starts.map((s, n) => {
    const head = lines[s.i];
    const body = lines.slice(s.i + 1, n + 1 < starts.length ? starts[n + 1].nameAt : lines.length);
    const rarity = (head.match(/(Very Rare|Common|Uncommon|Rare|Legendary|Artifact|Rarity Varies)/) ?? [])[1];
    return { id: slug(s.name), name: s.name, kind: head.split(/[ ,(]/)[0].toLowerCase(), header: clean(head), rarity: rarity?.toLowerCase(), attunement: /Attunement/.test(head), description: joinLines(body) };
  });
}

// ---------------------------------------------------------------- equipment tables
function parseWeapons() {
  const lines = text(88, 92).split(/\r?\n/);
  const out = []; let category = null, last = null;
  for (const l of lines) {
    const c = l.match(/^\s*(Simple|Martial) (Melee|Ranged) Weapons\s*$/);
    if (c) { category = { training: c[1].toLowerCase(), style: c[2].toLowerCase() }; last = null; continue; }
    if (!category) continue;
    const m = l.match(/^\s*([A-Z][A-Za-z ]+?)\s+(\d+d\d+|1) (Bludgeoning|Piercing|Slashing)\s+(.*?)\s+(Cleave|Graze|Nick|Push|Sap|Slow|Topple|Vex)\s+(—|[\d/]+ lb\.)\s+([\d,]+ [A-Z]P)\s*$/);
    if (m) {
      const props = m[4] === '—' ? '' : m[4];
      last = { id: slug(m[1]), name: m[1], kind: 'weapon', ...category, damage: { dice: m[2], type: m[3].toLowerCase() }, propsText: props, mastery: m[5].toLowerCase(), weight: m[6] === '—' ? 0 : eval(m[6].replace(' lb.', '')), cost: m[7] };
      out.push(last); continue;
    }
    const cont = l.match(/^\s{20,}([A-Z][A-Za-z\- ]+(?:\(.*\))?)\s*$/);
    if (last && cont && last.propsText.endsWith(',')) { last.propsText += ' ' + cont[1]; continue; }
    if (/^\s*$/.test(l) || /Properties|Name\s+Damage/.test(l)) continue;
    if (/^\s*\d+\s+System/.test(l)) category = null;
  }
  for (const w of out) {
    const t = w.propsText; const p = (w.props = {});
    for (const n of ['Finesse', 'Light', 'Heavy', 'Loading', 'Reach']) if (new RegExp(`\\b${n}\\b`).test(t)) p[n.toLowerCase()] = true;
    if (/Two-Handed/.test(t)) p.twoHanded = true;
    const v = t.match(/Versatile \((\d+d\d+)\)/); if (v) p.versatile = v[1];
    const th = t.match(/Thrown \(Range (\d+)\/(\d+)\)/); if (th) p.thrown = { range: num(th[1]), long: num(th[2]) };
    const am = t.match(/Ammunition \(Range (\d+)\/(\d+); (\w+)\)/); if (am) p.ammunition = { range: num(am[1]), long: num(am[2]), type: am[3].toLowerCase() };
    delete w.propsText;
  }
  return out;
}

function parseArmor() {
  const lines = text(92, 93).split(/\r?\n/);
  const out = []; let cat = null;
  for (const l of lines) {
    const c = l.match(/^\s*(Light|Medium|Heavy) Armor \(/) ?? l.match(/^\s*(Shield) \(/);
    if (c) { cat = c[1].toLowerCase(); continue; }
    if (!cat) continue;
    const m = l.match(/^\s*([A-Z][A-Za-z ]+?)\s+(\+?\d+)(?: \+ Dex modifier(?: \(max (\d)\))?)?\s+(—|Str \d+)\s+(—|Disadvantage)\s+(\d+) lb\.\s+([\d,]+ [A-Z]P)/);
    if (m) out.push({ id: slug(m[1]), name: m[1], kind: cat === 'shield' ? 'shield' : 'armor', category: cat, ac: num(m[2]), dex: /Dex modifier/.test(l), dexMax: m[3] ? num(m[3]) : undefined, strength: m[4] === '—' ? undefined : num(m[4].slice(4)), stealthDisadvantage: m[5] === 'Disadvantage', weight: num(m[6]), cost: m[7] });
  }
  return out;
}

function parseGear() {
  const lines = text(94, 100).split(/\r?\n/);
  const out = [];
  const seen = new Set();
  for (const raw of lines) {
    for (const part of raw.split(/\s{3,}(?=[A-Z])/)) {
      const m = part.trim().match(/^([A-Z][A-Za-z’',() \-]+?)\s+(—|[\d/]+(?:\.\d+)? lb\.)\s+([\d,]+ [A-Z]P)$/);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        out.push({ id: slug(m[1]), name: m[1], kind: 'gear', weight: m[2] === '—' ? 0 : eval(m[2].replace(' lb.', '')), cost: m[3] });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- classes
const CLASSES = { Barbarian: 28, Bard: 31, Cleric: 36, Druid: 41, Fighter: 46, Monk: 49, Paladin: 53, Ranger: 57, Rogue: 61, Sorcerer: 64, Warlock: 70, Wizard: 77 };
function parseClasses() {
  const out = [];
  for (const [name, page] of Object.entries(CLASSES)) {
    const all = columns(page, page + 1);
    const start = all.findIndex((l) => l === `Core ${name} Traits`);
    if (start < 0) throw new Error(`no core traits for ${name}`);
    const rows = {}; let key = null;
    const KEYS = ['Primary Ability', 'Hit Point Die', 'Saving Throw', 'Skill Proficiencies', 'Weapon Proficiencies', 'Tool Proficiencies', 'Armor Training', 'Starting Equipment'];
    for (let i = start + 1; i < all.length; i++) {
      const l = all[i];
      if (new RegExp(`^Becoming a ${name}`).test(l)) break;
      if (!l) continue;
      const k = KEYS.find((x) => l.startsWith(x));
      if (k) { key = k; rows[k] = l.slice(k.length).trim(); continue; }
      if (l === 'Proficiencies' && key === 'Saving Throw') continue;
      if (key) rows[key] = /[a-z]-$/.test(rows[key]) ? rows[key].slice(0, -1) + l : `${rows[key]} ${l}`;
      if (key === 'Starting Equipment' && new RegExp(`^${name} Features`).test(l)) { rows[key] = rows[key].slice(0, rows[key].indexOf(`${name} Features`)); break; }
    }
    for (const k of Object.keys(rows)) rows[k] = joinLines([rows[k]]);
    const saves = [...rows['Saving Throw'].matchAll(/Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma/g)].map((m) => m[0].slice(0, 3).toLowerCase());
    const hd = num(rows['Hit Point Die'].match(/D(\d+)/)[1]);
    const skills = rows['Skill Proficiencies'];
    const pick = skills.match(/Choose (?:any )?(\d+)/);
    out.push({ id: slug(name), name, primaryAbility: rows['Primary Ability'], hitDie: hd, savingThrows: saves, skillChoice: pick ? num(pick[1]) : 0, skillOptions: skills.replace(/^Choose (?:any )?\d+:?\s*/, '').replace(/\bor\b/, '').split(',').map((s) => s.trim()).filter(Boolean), weaponProficiencies: rows['Weapon Proficiencies'], toolProficiencies: rows['Tool Proficiencies'], armorTraining: rows['Armor Training'], startingEquipment: rows['Starting Equipment'] });
  }
  return out;
}

// ---------------------------------------------------------------- raw chapters
const CHAPTERS = { 'playing-the-game': [5, 18], 'character-creation': [19, 27], classes: [28, 82], 'character-origins': [83, 87], equipment: [88, 103], 'spell-rules': [104, 106], 'rules-glossary': [176, 191], 'gameplay-toolbox': [192, 203], 'magic-item-rules': [204, 208], 'monster-rules': [254, 257] };

function parseGlossaryConditions(lines) {
  const names = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];
  const out = [];
  for (const n of names) {
    const i = lines.findIndex((l) => l === `${n} [Condition]`);
    if (i < 0) { console.warn('condition not found', n); continue; }
    let j = i + 1;
    const nextNonEmpty = (k) => { let x = k + 1; while (x < lines.length && !lines[x]) x++; return lines[x] ?? ''; };
    const prevNonEmpty = (k) => { let x = k - 1; while (x >= 0 && !lines[x]) x--; return lines[x] ?? ''; };
    // A glossary heading is a short title line that follows a finished sentence.
    while (j < lines.length && !/ \[[A-Z][a-z]+\]$/.test(lines[j]) && !(/^[A-Z][a-zA-Z’\- ]{2,30}$/.test(lines[j]) && /\.$/.test(prevNonEmpty(j)) && /^[A-Z]/.test(nextNonEmpty(j)))) j++;
    out.push({ id: n.toLowerCase(), name: n, description: joinLines(lines.slice(i + 1, j)) });
  }
  return out;
}

// ---------------------------------------------------------------- index check
function statBlockIndex() {
  const names = new Set();
  for (const l of text(3, 4).split(/\r?\n/)) {
    for (const part of l.split(/\s{2,}/)) {
      const m = part.trim().match(/^([A-Z][A-Za-z’'\- ,()]+?)\s?\.{2,}\s?(\d{3})$/) ?? part.trim().match(/^([A-Z][A-Za-z’'\- ,()]+?)\. ?\.+ ?(\d{3})$/);
      if (m && num(m[2]) >= 258) names.add(m[1].trim());
    }
  }
  return names;
}

// ---------------------------------------------------------------- main
const write = (name, data) => { writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 1) + '\n'); console.log(`${name}: ${Array.isArray(data) ? data.length : Object.keys(data).length}`); };

const monsters = parseMonsters(columns(PAGES.monsters[0], PAGES.animals[1]));
const spells = parseSpells(columns(...PAGES.spells));
const magicItems = parseMagicItems(columns(...PAGES.items));
const glossary = columns(...PAGES.glossary);
write('monsters', monsters);
write('spells', spells);
write('magic-items', magicItems);
write('weapons', parseWeapons());
write('armor', parseArmor());
write('gear', parseGear());
write('classes', parseClasses());
write('conditions', parseGlossaryConditions(glossary));
const chapters = {};
for (const [k, [a, b]] of Object.entries(CHAPTERS)) chapters[k] = columns(a, b).join('\n').replace(/\n{3,}/g, '\n\n');
write('chapters', chapters);
write('attribution', { text: ATTRIBUTION, source: URL, license: 'CC-BY-4.0' });

const index = statBlockIndex();
const have = new Set(monsters.map((m) => m.name));
const missing = [...index].filter((n) => !have.has(n));
console.log(`stat block index: ${index.size} names, ${missing.length} not parsed:`, missing);
const spellNames = new Set(spells.map((x) => x.name));
const listed = new Set();
const SPELL_ROW = /^(.+?)\s{2,}(Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation)\s+(?:—|[CRM, ]+)/;
for (const l of chapters.classes.split('\n')) { const m = l.match(SPELL_ROW); if (m) listed.add(m[1].trim()); }
const unparsed = [...listed].filter((n) => !spellNames.has(n));
console.log(`class spell lists: ${listed.size} names, ${unparsed.length} not parsed:`, unparsed);
const extra = [...have].filter((n) => !index.has(n));
console.log(`parsed but not in index: ${extra.length}`, extra.slice(0, 40));
