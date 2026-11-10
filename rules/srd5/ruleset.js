// The ruleset adapter: everything the generic engine asks of "the rules" is answered here.
import { ABILITY_NAMES, BACKGROUNDS, CLASS_TABLE, NOT_IN_GAME, SPECIES, XP_TABLE } from './data.js';
import {
  addCondition, addEffect, applyDamage, armorClass, attackModifiers, canAct, checkConcentration, d20, getEffect, grantTempHp, hasCondition, hasEffect,
  heal, isDown, isIncapacitated, lacksArmorTraining, mod, passivePerception, pb, removeCondition, removeEffect, roll, rollDice, savingThrow, skillBonus, speedOf,
} from './core.js';
import { MAX_LEVEL, PACK_SIZE, SLOTS, createCharacter, hitPointGain, longRest, makeItem, maybeLevelUp, newUid, shortRest, spellsAtLevel, xpForNextLevel } from './characters.js';
import { ROUND, attackBlessings, attackRollText, characterAttack, coverOf, damageRollText, monsterAttack, multiattackPlan, rangeOf, reachOf, unarmedStrike } from './combat.js';
import { SPELL_FX } from './spells.js';

// Message and effect colours: indices into the engine's named palette (engine/colors.js).
const WHITE = 5, YELLOW = 9, RED = 11, GREEN = 13, CYAN = 15;
const FORWARD_DOT = 0.5;

/** Which sprite to draw for a monster: specific art first, otherwise by creature type. */
const SPRITE_BY_ID = {
  'giant-rat': 'rat', rat: 'rat', 'giant-centipede': 'centipede', 'giant-spider': 'spider', 'giant-wolf-spider': 'spider', skeleton: 'skeleton', 'minotaur-skeleton': 'skeleton', 'warhorse-skeleton': 'skeleton',
  zombie: 'zombie', 'ogre-zombie': 'zombie', ghoul: 'ghoul', ghast: 'ghoul', shadow: 'shade', specter: 'shade',
  'goblin-minion': 'goblin', 'goblin-warrior': 'goblin', 'goblin-boss': 'goblin-boss', 'kobold-warrior': 'goblin', 'hobgoblin-warrior': 'goblin',
  cultist: 'cultist', 'cultist-fanatic': 'cultist-boss', bandit: 'cultist', 'bandit-captain': 'cultist-boss', mage: 'cultist-boss', priest: 'cultist-boss',
};
const SPRITE_BY_TYPE = { undead: 'zombie', beast: 'rat', humanoid: 'cultist', fey: 'goblin', giant: 'zombie', dragon: 'spider', fiend: 'cultist-boss', monstrosity: 'spider', aberration: 'spider', construct: 'skeleton', elemental: 'shade', ooze: 'shade', plant: 'shade', celestial: 'cultist-boss', swarm: 'rat' };

const ICONS = [
  [/greatsword|longsword|shortsword|scimitar|rapier|sword/, 'sword'], [/dagger|sickle/, 'dagger'], [/axe|halberd|glaive/, 'axe'], [/mace|club|hammer|flail|morningstar|maul|pick/, 'mace'],
  [/longbow|shortbow|crossbow/, 'bow'], [/quarterstaff|staff|wand|rod/, 'staff'], [/spear|javelin|pike|trident|lance/, 'spear'], [/shield/, 'shield'],
  [/plate|mail|splint|breastplate/, 'heavy-armor'], [/armor|shirt/, 'light-armor'], [/potion|vial|flask|antitoxin|oil/, 'potion'], [/scroll|parchment/, 'scroll'], [/key/, 'key'], [/torch|candle/, 'torch'],
  [/ration|food|berry/, 'food'], [/tools|kit/, 'tools'], [/gold|coin|silver/, 'coin'], [/amulet|symbol|holy/, 'amulet'], [/ring/, 'ring'], [/book|tome/, 'book'], [/arrows|bolts|bullets|needles|dart/, 'arrows'],
];

// Classes with their own portrait for a species. The rest use the class portrait: the fighter's is a dwarf, the wizard's an elf, the rogue's a halfling, and the others are human.
const SPECIES_PORTRAITS = {
  human: ['fighter', 'rogue', 'wizard'],
  dwarf: ['barbarian', 'bard', 'cleric', 'druid', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'],
  elf: ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue'],
  halfling: ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'wizard'],
  gnome: ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'wizard'],
};
// Not offered for now, to keep down the art needed. Their rules stay for when they come back.
const HIDDEN_CLASSES = ['sorcerer', 'warlock'], HIDDEN_SPECIES = ['orc', 'goliath', 'dragonborn', 'tiefling'];
// Classes whose portrait above shows a woman, per species on offer. Each portrait of a class on offer also has a version of the other sex.
const FEMALE_PORTRAITS = {
  human: ['cleric', 'fighter', 'rogue'],
  dwarf: ['bard', 'druid', 'fighter', 'paladin', 'rogue'],
  elf: ['barbarian', 'cleric', 'monk', 'ranger', 'wizard'],
  halfling: ['barbarian', 'cleric', 'monk', 'paladin', 'wizard'],
  gnome: ['bard', 'druid', 'fighter', 'ranger', 'wizard'],
};

const LONG_REST_SECONDS = 8 * 3600;

export class Srd5Ruleset {
  id = 'srd5';
  name = '5E compatible (SRD 5.2.1)';
  /** Game seconds per real second: a 6-second round plays out in 4 real seconds. */
  timeScale = 1.5;
  /** Each map cell is 10 feet across, holding 2x2 five-foot squares. */
  cellFeet = 10;

  constructor(srd, moduleItems = {}) {
    this.srd = srd;
    for (const [id, def] of Object.entries(moduleItems)) {
      const base = def.base ? srd.items[def.base] : {};
      srd.items[id] = { ...base, ...def, id: def.base && base?.kind === 'weapon' ? base.id : id, protoId: id };
    }
  }

  get attribution() { return this.srd.attribution.text; }

  /** Paper-doll layout for the inventory screen. */
  slots = [
    { id: 'head', label: 'Head' }, { id: 'neck', label: 'Neck' }, { id: 'armor', label: 'Armor' }, { id: 'cloak', label: 'Cloak' },
    { id: 'mainHand', label: 'Main hand' }, { id: 'offHand', label: 'Off hand' }, { id: 'ring', label: 'Ring' }, { id: 'feet', label: 'Feet' },
  ];

  // ---------------------------------------------------------------- party
  defaultParty() {
    const party = [
      { name: 'Brunna', classId: 'fighter', speciesId: 'dwarf', sex: 'female', backgroundId: 'soldier' },
      { name: 'Pip', classId: 'rogue', speciesId: 'halfling', sex: 'male', backgroundId: 'criminal' },
      { name: 'Maren', classId: 'cleric', speciesId: 'human', sex: 'female', backgroundId: 'acolyte' },
      { name: 'Elowen', classId: 'wizard', speciesId: 'elf', sex: 'female', backgroundId: 'sage' },
    ].map((o) => createCharacter(this.srd, o));
    return party;
  }

  /** Character-creation choices for the engine's generic creation screen. */
  creationSteps() {
    const rows = (o) => Object.entries(o).map(([id, v]) => ({ id, label: v.name, detail: v.detail ?? v.notes ?? '' }));
    return [
      { key: 'classId', label: 'Class', options: Object.values(this.srd.classes).filter((c) => !HIDDEN_CLASSES.includes(c.id)).map((c) => ({ id: c.id, label: c.name, detail: `d${c.hitDie} HP. ${c.primaryAbility}. Armor: ${c.armorTraining}` })) },
      { key: 'speciesId', label: 'Species', options: rows(SPECIES).filter((o) => !HIDDEN_SPECIES.includes(o.id)) },
      { key: 'sex', label: 'Sex', options: [{ id: 'female', label: 'Female', detail: '' }, { id: 'male', label: 'Male', detail: '' }] },
      { key: 'backgroundId', label: 'Background', options: rows(Object.fromEntries(Object.entries(BACKGROUNDS).map(([k, b]) => [k, { name: b.name, notes: `${b.feat.replace(/-/g, ' ')}; ${b.skills.join(', ')}` }]))) },
    ];
  }
  createMember(choices) { return createCharacter(this.srd, choices); }
  /** Which portrait a character shows. Takes creation choices or a member. */
  portrait({ classId, speciesId, sex }) {
    const base = SPECIES_PORTRAITS[speciesId]?.includes(classId) ? `portrait-${speciesId}-${classId}` : `portrait-${classId}`;
    // Characters saved before sex could be chosen have none, and keep the face they always had.
    if (!sex || !FEMALE_PORTRAITS[speciesId] || HIDDEN_CLASSES.includes(classId)) return base;
    const shown = FEMALE_PORTRAITS[speciesId].includes(classId) ? 'female' : 'male';
    return sex === shown ? base : `portrait-${speciesId}-${classId}-${sex}`;
  }

  /** A title for the screens between adventures. */
  memberTitle(m) { return `Level ${m.level} ${this.srd.classes[m.classId].name}`; }

  /** A replacement starts at the level of the lowest character still alive. */
  hireLevel(members) {
    const living = members.filter((m) => !m.dead);
    return living.length ? Math.min(...living.map((m) => m.level)) : 1;
  }

  /**
   * The party with a new character in place of a dead one. The dead character's gear goes to the replacement, then
   * to whoever has room. It can't be lost, so if nobody has room the replacement's pack grows to hold it.
   */
  hire(members, slot, choices) {
    const party = structuredClone(members);
    const { equipment, pack } = party[slot];
    const hired = this.createMember({ ...choices, level: this.hireLevel(members) });
    party[slot] = hired;
    const carriers = [hired, ...party.filter((m) => m !== hired && !m.dead)];
    for (const item of [...Object.values(equipment), ...pack].filter(Boolean)) {
      const stack = item.qty != null && carriers.flatMap((m) => m.pack).find((it) => it?.proto === item.proto && it.qty != null);
      if (stack) { stack.qty += item.qty; continue; }
      const carrier = carriers.find((m) => m.pack.includes(null));
      if (carrier) carrier.pack[carrier.pack.indexOf(null)] = item;
      else hired.pack.push(item);
    }
    return party;
  }

  /** The average level of those still alive, who are the ones setting out. */
  partyLevel(members) {
    const living = members.filter((m) => !m.dead);
    return living.reduce((sum, m) => sum + m.level, 0) / Math.max(1, living.length);
  }

  /** Going on vacation is a Long Rest. Gets copies of the members, so game stays as it is. */
  onLeaveAdventure(game, members) {
    for (const m of members) {
      this.endConcentration({ party: { members }, entities: [], log() {} }, m);
      this.longRestMember(m);
    }
    return LONG_REST_SECONDS;
  }

  /** Called at the start of each adventure: someone with a free hand lights a torch, unless one is still burning. */
  onAdventureStart(game) {
    if (game.party.members.some((m) => ['mainHand', 'offHand'].some((s) => m.equipment[s]?.proto === 'torch'))) return;
    const carrier = game.party.members.find((m) => !m.equipment.offHand && !this.itemDef(m.equipment.mainHand)?.props?.twoHanded);
    if (!carrier) return;
    const i = carrier.pack.findIndex((it) => it?.proto === 'torch');
    if (i < 0) return;
    const stack = carrier.pack[i];
    carrier.equipment.offHand = { uid: newUid('i'), proto: 'torch' };
    if (stack.qty > 1) stack.qty -= 1; else carrier.pack[i] = null;
    game.log(`${carrier.name} lights a torch.`, YELLOW);
  }

  // ---------------------------------------------------------------- items
  itemDef(item) { return item ? this.srd.items[item.proto] : null; }

  itemInfo(item) {
    const def = this.itemDef(item);
    if (!def) return { name: item.proto, icon: 'unknown', weight: 0, slots: [] };
    const haystack = `${item.proto} ${def.id} ${def.name}`.toLowerCase(); // def.id is the base weapon for unique weapons
    const icon = def.icon ?? ICONS.find(([re]) => re.test(haystack))?.[1] ?? 'pouch';
    return {
      name: item.qty > 1 ? `${def.name} x${item.qty}` : def.name,
      baseName: def.name,
      icon, weight: (def.weight ?? 0) * (item.qty ?? 1), slots: this.slotsFor(def, haystack), description: this.describeItem(def, item),
    };
  }

  slotsFor(def, name) {
    if (def.kind === 'armor') return ['armor'];
    if (def.kind === 'shield') return ['offHand'];
    if (def.slot) return [def.slot];
    if (/\bring\b/.test(name)) return ['ring', 'mainHand', 'offHand'];
    if (/amulet|necklace|periapt|medallion/.test(name)) return ['neck', 'mainHand', 'offHand'];
    if (/cloak|cape/.test(name)) return ['cloak', 'mainHand', 'offHand'];
    if (/boots|sandals|slippers/.test(name)) return ['feet', 'mainHand', 'offHand'];
    if (/helm|hat|circlet|headband/.test(name)) return ['head', 'mainHand', 'offHand'];
    return ['mainHand', 'offHand'];
  }

  describeItem(def, item) {
    const parts = [];
    if (def.kind === 'weapon') {
      const p = def.props ?? {};
      parts.push(`${def.training} ${def.style} weapon. ${def.damage.dice}${def.bonus ? `+${def.bonus}` : ''} ${def.damage.type}.`);
      const props = [p.finesse && 'Finesse', p.light && 'Light', p.heavy && 'Heavy', p.twoHanded && 'Two-Handed', p.reach && 'Reach', p.versatile && `Versatile ${p.versatile}`, p.thrown && `Thrown ${p.thrown.range}/${p.thrown.long}`, p.ammunition && `Range ${p.ammunition.range}/${p.ammunition.long}`].filter(Boolean);
      if (props.length) parts.push(`${props.join(', ')}.`);
      parts.push(`Mastery: ${def.mastery}.`);
    } else if (def.kind === 'armor') {
      parts.push(`${def.category} armor. AC ${def.ac}${def.dex ? ` + Dex${def.dexMax ? ` (max ${def.dexMax})` : ''}` : ''}.${def.strength ? ` Needs Str ${def.strength}.` : ''}${def.stealthDisadvantage ? ' Noisy.' : ''}`);
    } else if (def.kind === 'shield') parts.push(`+${def.ac} AC.`);
    if (def.description) parts.push(def.description);
    if (def.weight) parts.push(`${def.weight} lb.`);
    if (item?.burn != null) parts.push(`Burns ${Math.ceil(item.burn / 60)} more minutes.`);
    return parts.join(' ');
  }

  canEquip(member, item, slot) {
    const def = this.itemDef(item);
    const info = this.itemInfo(item);
    if (!info.slots.includes(slot)) return false;
    if (def?.kind === 'shield' && this.itemDef(member.equipment.mainHand)?.props?.twoHanded) return false;
    return true;
  }

  // ---------------------------------------------------------------- status / sheet
  memberStatus(game, m) {
    const hasSlots = m.slots.max > 0 || m.freeSpell;
    const bars = [{ value: Math.max(0, m.hp), max: m.maxHp, color: m.hp * 2 <= m.maxHp ? RED : GREEN, label: 'HP' }];
    if (m.tempHp > 0) bars.push({ value: m.tempHp, max: m.maxHp, color: CYAN, label: 'Temp HP' });
    else if (hasSlots) bars.push({ value: m.slots.max - m.slots.used, max: Math.max(1, m.slots.max), color: CYAN, label: 'Slots' });
    const actionIn = Math.max(0, m.actionReadyAt - game.time);
    return {
      name: m.name, portrait: this.portrait(m), bars, dead: !!m.dead, down: m.hp <= 0 && !m.dead,
      ready: canAct(m) && actionIn <= 0, cooldown: Math.min(1, actionIn / ROUND),
      tag: m.dead ? 'DEAD' : m.hp <= 0 ? (m.death.stable ? 'STABLE' : `DYING ${m.death.fail}/3`) : m.conditions.filter((c) => c.id !== 'exhaustion')[0]?.id?.toUpperCase() ?? '',
    };
  }

  memberSheet(game, m) {
    const srd = this.srd;
    const cls = srd.classes[m.classId];
    const row = (a) => `${a.toUpperCase()} ${String(m.abilities[a]).padStart(2)} ${mod(m, a) >= 0 ? '+' : ''}${mod(m, a)}${m.saveProficiencies.includes(a) ? '*' : ''}`;
    const lines = [
      { text: `${m.name}`, color: YELLOW },
      `${SPECIES[m.speciesId].name} ${cls.name} ${m.level}`,
      `${BACKGROUNDS[m.backgroundId].name}`,
      `AC ${armorClass(m, srd)}  HP ${m.hp}/${m.maxHp}${m.tempHp ? ` +${m.tempHp}` : ''}`,
      `Speed ${speedOf(m, srd)}  Prof +${pb(m)}`,
      `XP ${m.xp}${m.level < MAX_LEVEL ? `/${xpForNextLevel(m)}` : ' (max)'}`,
      `${row('str')}  ${row('int')}`,
      `${row('dex')}  ${row('wis')}`,
      `${row('con')}  ${row('cha')}`,
      `Perception ${passivePerception(m)}  Hit Dice ${m.hitDice}/${m.level}`,
    ];
    if (m.slots.max) lines.push(`Spell slots ${m.slots.max - m.slots.used}/${m.slots.max}  DC ${this.spellDc(m)}`);
    const res = Object.entries(m.resources).filter(([, v]) => v > 0).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${v}`);
    if (res.length) lines.push(res.join(', '));
    if (lacksArmorTraining(m, srd)) lines.push({ text: 'Untrained armor! No spells.', color: RED });
    const states = [...m.conditions.map((c) => c.id), ...m.effects.map((e) => e.id)];
    if (states.length) lines.push({ text: states.join(', '), color: CYAN });
    return lines;
  }

  /**
   * The inventory's Features screen: what the character's species and class give it, level by level, and what comes next.
   * Past the level cap the next level's features are listed for interest, with a note instead of a per-feature mark.
   */
  memberFeatures(game, m) {
    const srd = this.srd;
    const list = (entries, missing) => entries.map((f) => ({ name: f.name, text: f.summary, missing: missing.includes(f.name) }));
    const features = srd.classFeatures[m.classId];
    const missing = NOT_IN_GAME.classes[m.classId] ?? [];
    const atLevel = (level) => features.filter((f) => f.level === level);
    const groups = [];
    for (let level = 1; level <= m.level; level++) groups.push({ title: `Level ${level}`, items: list(atLevel(level), missing) });
    const next = m.level + 1;
    if (features.some((f) => f.level === next)) {
      const reachable = m.level < MAX_LEVEL;
      groups.push({
        title: reachable ? `Next: level ${next} at ${xpForNextLevel(m)} XP` : `Next: level ${next}`,
        next: true,
        gains: reachable ? this.nextLevelGains(m) : [],
        note: reachable ? null : `Characters stop at level ${MAX_LEVEL} in this game for now, so this can't be reached yet.`,
        items: list(atLevel(next), reachable ? missing : []),
      });
    }
    return [
      { title: `Species: ${SPECIES[m.speciesId].name}`, groups: [{ items: list(srd.speciesTraits[m.speciesId], NOT_IN_GAME.species[m.speciesId] ?? []) }] },
      { title: `Class: ${srd.classes[m.classId].name}`, groups },
    ];
  }

  /** The numbers that change at the next level, as short phrases. */
  nextLevelGains(m) {
    const gains = [`+${hitPointGain(m)} HP`];
    const table = CLASS_TABLE[m.classId];
    if (!table.slots) return gains;
    const slots = table.slots[m.level];
    if (slots !== m.slots.max) gains.push(`spell slots ${m.slots.max} to ${slots}`);
    const spells = spellsAtLevel(m, m.level + 1).filter((id) => !m.prepared.includes(id)).map((id) => this.srd.spells[id].name);
    if (spells.length) gains.push(`new spell${spells.length > 1 ? 's' : ''}: ${spells.join(', ')}`);
    return gains;
  }

  carriedWeight(m) {
    const items = [...Object.values(m.equipment), ...m.pack].filter(Boolean);
    return items.reduce((w, it) => w + this.itemInfo(it).weight, 0);
  }

  // ---------------------------------------------------------------- saves and spell numbers
  save(game, c, ability, dc, opts = {}) { return savingThrow(game.rng, c, ability, dc, opts); }
  spellAbility(c) { return c.initiateAbility && !c.slots.max ? c.initiateAbility : ({ bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha', ranger: 'wis', sorcerer: 'cha', warlock: 'cha', wizard: 'int' }[c.classId] ?? 'int'); }
  spellDc(c) { return 8 + pb(c) + mod(c, this.spellAbility(c)); }
  spellAttackBonus(c) { return pb(c) + mod(c, this.spellAbility(c)); }

  // ---------------------------------------------------------------- light and sight
  /** Party light from a held torch, the Light cantrip or Darkvision. Radius in cells (10 ft each). */
  light(game) {
    const held = game.party.members.some((m) => !m.dead && ['mainHand', 'offHand'].some((s) => m.equipment[s]?.proto === 'torch'));
    const lit = held || game.party.members.some((m) => hasEffect(m, 'light'));
    if (lit) return { radius: 4.2, mono: false, bright: true };
    const dark = Math.max(0, ...game.party.members.filter((m) => !m.dead).map((m) => m.darkvision ?? 0));
    if (dark > 0) return { radius: dark / this.cellFeet * 0.7, mono: true, bright: false };
    return { radius: 0.9, mono: true, bright: false };
  }
  /** True when a party member can't see in the current light (Blinded-style Disadvantage). */
  cannotSee(game, c) {
    if (c.kind !== 'pc') return false;
    return !this.light(game).bright && !(c.darkvision > 0);
  }

  // ---------------------------------------------------------------- targeting
  isHostile(m) { return !m.dead && m.hp > 0 && !m.friendly; }

  /** Candidates a member could target, best first: the focused target, then whoever is ahead and nearest. */
  targetsFor(game, member, { maxFeet, melee = false }) {
    const out = [];
    const bound = getEffect(member, 'wrath');
    for (const m of game.entities) {
      if (m.level !== game.party.level || !this.isHostile(m)) continue;
      if (bound && m.uid !== bound.target) continue;
      const feet = game.feet(member, m);
      if (feet > maxFeet) continue;
      if (!game.canSee(member, m)) continue;
      const ahead = game.forwardness(m);
      if (!melee && ahead < FORWARD_DOT) continue;
      out.push({ m, feet, score: (m.uid === game.party.focus ? -1000 : 0) + feet - ahead * 2 + (ahead < FORWARD_DOT ? 50 : 0) });
    }
    return out.sort((a, b) => a.score - b.score).map((t) => t.m);
  }

  // ---------------------------------------------------------------- actions
  /** Builds the action menu for a member. `menu` selects a submenu. */
  memberActions(game, m, menu = null) {
    const ready = canAct(m) && m.actionReadyAt <= game.time;
    const bonusReady = canAct(m) && m.bonusReadyAt <= game.time;
    const need = (a) => (a.bonus ? bonusReady : ready);
    const list = [];
    if (menu === 'cast') return this.castMenu(game, m, need);
    if (menu?.startsWith('ally:')) return this.allyMenu(game, m, menu.slice(5), need);

    const main = m.equipment.mainHand;
    const mainDef = this.itemDef(main);
    list.push({ id: 'attack:main', label: mainDef ? this.shortName(mainDef) : 'Unarmed', enabled: ready, hint: 'Attack with this hand. Uses your Action.' });
    const off = m.equipment.offHand;
    const offDef = this.itemDef(off);
    if (offDef?.kind === 'weapon' && offDef.props.light && mainDef?.props?.light) {
      const nick = m.weaponMasteries.includes(offDef.id) && offDef.mastery === 'nick';
      list.push({ id: 'attack:off', label: `${this.shortName(offDef)} (off)`, enabled: nick ? canAct(m) && (m.nickReadyAt ?? 0) <= game.time : bonusReady, hint: nick ? 'Light weapon extra attack, once per round. Nick: no Bonus Action needed.' : 'Light weapon extra attack. Uses your Bonus Action.', bonus: !nick });
    }
    if (m.classId === 'monk' && !m.equipment.armor) list.push({ id: 'martial-arts', label: 'Bonus Strike', enabled: bonusReady, hint: 'Martial Arts: an Unarmed Strike as a Bonus Action.', bonus: true });
    const castable = this.knownSpells(m).length > 0;
    if (castable) list.push({ id: 'menu:cast', label: 'Cast >', enabled: canAct(m) && !lacksArmorTraining(m, this.srd), hint: 'Open the list of spells you have prepared.', submenu: 'cast' });
    for (const a of this.classActions(game, m, ready, bonusReady)) list.push(a);
    const hasDown = game.party.members.some((o) => o !== m && o.hp <= 0 && !o.dead && !o.death.stable);
    if (hasDown) list.push({ id: 'menu:ally:stabilize', label: 'Stabilize >', enabled: ready, hint: 'DC 10 Wisdom (Medicine) check on a dying ally.', submenu: 'ally:stabilize' });
    list.push({ id: 'dodge', label: 'Dodge', enabled: ready, hint: 'Attacks against you have Disadvantage until your next turn.' });
    list.push({ id: 'search', label: 'Search', enabled: ready, hint: 'Wisdom (Perception) check for hidden things nearby.' });
    return list;
  }

  /** Class features and spells a member can pick for quick access. `quickId` (or `id`) identifies the choice. */
  memberAbilities(game, m) {
    const ready = canAct(m) && m.actionReadyAt <= game.time;
    const bonusReady = canAct(m) && m.bonusReadyAt <= game.time;
    const need = ({ bonus }) => (bonus ? bonusReady : ready);
    const clean = (a) => ({ ...a, label: a.label.replace(/ >$/, '') });
    const skills = this.classActions(game, m, ready, bonusReady).map((a) => ({ ...clean(a), kind: 'skill', glyph: 'skill' }));
    // Always listed so it can sit in a slot ahead of need; lit only while an ally is dying.
    const dying = game.party.members.some((o) => o !== m && o.hp <= 0 && !o.dead && !o.death.stable);
    skills.push({ id: 'menu:ally:stabilize', label: 'Stabilize', enabled: ready && dying, hint: 'DC 10 Wisdom (Medicine) check on a dying ally.', submenu: 'ally:stabilize', kind: 'skill', glyph: 'skill' });
    const armored = lacksArmorTraining(m, this.srd);
    const spells = this.castMenu(game, m, need).filter((a) => !a.back).map((a) => ({ ...clean(a), enabled: a.enabled && !armored, kind: 'spell', glyph: 'cast' }));
    return [...skills, ...spells];
  }

  /** Adds an ability to the member's two quick slots, or removes it. Returns false when both slots are taken. */
  toggleQuick(game, m, id) {
    const known = new Set(this.memberAbilities(game, m).map((a) => a.quickId ?? a.id));
    const quick = [0, 1].map((n) => (known.has(m.quick?.[n]) ? m.quick[n] : null)); // Forgets anything no longer available.
    const at = quick.indexOf(id);
    const free = at >= 0 ? at : quick.indexOf(null);
    if (free < 0 || !known.has(id)) return false;
    quick[free] = at >= 0 ? null : id;
    m.quick = quick;
    return true;
  }

  /** The row of icons on a member's action box, always in the same seven positions. Everything else stays in memberActions. */
  memberQuickActions(game, m) {
    const list = this.memberActions(game, m);
    const find = (id) => list.find((a) => a.id === id);
    const off = m.equipment.offHand;
    const offInfo = off && this.itemInfo(off);
    const cast = find('menu:cast');
    const need = ({ bonus }) => canAct(m) && (bonus ? m.bonusReadyAt : m.actionReadyAt) <= game.time;
    // A caster can still have a Bonus Action spell ready after spending the Action, so ask the spell list itself.
    const canCast = !!cast?.enabled && this.castMenu(game, m, need).some((a) => !a.back && a.enabled);
    const abilities = this.memberAbilities(game, m);
    const quick = (n) => abilities.find((a) => (a.quickId ?? a.id) === m.quick?.[n])
      ?? { id: `empty:${n}`, label: 'Quick slot', enabled: true, empty: true, glyph: 'plus', hint: 'Empty. Click to choose a skill or spell for quick access.' };
    return [
      { ...find('attack:main'), item: m.equipment.mainHand, glyph: 'fist' },
      { ...(find('attack:off') ?? find('martial-arts') ?? { id: 'attack:off', label: offInfo?.name ?? 'Off hand', enabled: false, hint: off ? 'Needs a Light weapon in both hands to attack with.' : 'Empty.' }), item: off, glyph: 'fist' },
      quick(0),
      quick(1),
      { ...find('dodge'), glyph: 'dodge' },
      { ...find('search'), glyph: 'search' },
      { ...(cast ?? { id: 'menu:cast', hint: 'Knows no spells.' }), label: 'Cast', enabled: canCast, glyph: 'cast' },
    ];
  }

  classActions(game, m, ready, bonus) {
    const r = m.resources;
    const out = [];
    const add = (id, label, enabled, hint, extra = {}) => out.push({ id, label, enabled, hint, ...extra });
    if (this.itemDef(m.equipment.mainHand)?.power === 'wrath') {
      add('wrath', 'Wrath', canAct(m) && !m.equipment.mainHand.powerUsed && !hasEffect(m, 'wrath') && !!this.wrathTarget(game, m), 'Once per Long Rest. Advantage on your next attack against your target, but you can attack nothing else until it or you drop to 0 HP.');
    }
    if (m.classId === 'barbarian') {
      if (hasEffect(m, 'rage')) add('end-rage', 'End Rage', true, 'Stop raging.', { quickId: 'rage' }); // Keeps Rage's quick slot.
      else add('rage', `Rage (${r.rage})`, bonus && r.rage > 0, 'Bonus Action. +2 Str melee damage, resist B/P/S, Advantage on Str saves.', { bonus: true });
      if (m.level >= 2) add('reckless', 'Reckless', ready, 'Advantage on your attacks; attacks against you have Advantage until next turn.');
    }
    if (m.classId === 'fighter') {
      add('second-wind', `2nd Wind (${r.secondWind})`, bonus && r.secondWind > 0, 'Bonus Action. Regain 1d10 + Fighter level HP.', { bonus: true });
      if (m.level >= 2) add('action-surge', `Surge (${r.actionSurge})`, canAct(m) && r.actionSurge > 0, 'Action Surge: take another action right now.');
    }
    if (m.classId === 'paladin') add('menu:ally:lay-on-hands', `Lay Hands (${r.layOnHands})`, bonus && r.layOnHands > 0, 'Bonus Action. Restore HP from your pool.', { submenu: 'ally:lay-on-hands' });
    if (m.classId === 'bard') add('menu:ally:inspire', `Inspire (${r.inspiration})`, bonus && r.inspiration > 0, 'Bonus Action. Give an ally a d6 for their next attack.', { submenu: 'ally:inspire' });
    if (m.classId === 'sorcerer') add('innate-sorcery', `Innate (${r.innateSorcery})`, bonus && r.innateSorcery > 0, 'Bonus Action. 1 minute: +1 spell DC, Advantage on your spell attacks.', { bonus: true });
    if (m.classId === 'cleric' && m.level >= 2) {
      add('turn-undead', `Turn Undead (${r.channelDivinity})`, ready && r.channelDivinity > 0, 'Undead within 30 ft make a Wisdom save or are Frightened.');
      add('menu:ally:divine-spark', 'Divine Spark >', ready && r.channelDivinity > 0, 'Restore 1d8 + Wis HP to an ally.', { submenu: 'ally:divine-spark' });
    }
    if (m.classId === 'monk' && m.level >= 2) add('flurry', `Flurry (${r.focus})`, bonus && r.focus > 0, 'Spend Focus: two Unarmed Strikes as a Bonus Action.', { bonus: true });
    if (r.breath > 0 || m.speciesId === 'dragonborn') add('breath', `Breath (${r.breath ?? 0})`, ready && r.breath > 0, 'Breath Weapon: Dex save in a 15-ft cone, 1d10 fire.');
    return out;
  }

  shortName(def) { return def.name.length > 14 ? def.name.split(' ').slice(-1)[0] : def.name; }

  knownSpells(m) {
    return [...m.cantrips, ...m.prepared].filter((id) => SPELL_FX[id] && this.srd.spells[id] && SPELL_FX[id].mode !== 'reaction');
  }

  castMenu(game, m, need) {
    const list = [{ id: 'menu:back', label: '< Back', enabled: true, hint: '', back: true }];
    for (const id of this.knownSpells(m)) {
      const spell = this.srd.spells[id];
      const fx = SPELL_FX[id];
      const bonus = !!fx.bonus;
      const hasSlot = spell.level === 0 || m.slots.used < m.slots.max || (m.freeSpell?.id === id && !m.freeSpell.used);
      const enabled = need({ bonus }) && hasSlot;
      const hint = `${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`}). ${spell.range}. ${spell.description}`;
      if (fx.ally) list.push({ id: `menu:ally:cast-${id}`, label: `${spell.name} >`, enabled, hint, submenu: `ally:cast-${id}` });
      else list.push({ id: `cast:${id}`, label: spell.name, enabled, hint, bonus });
    }
    return list;
  }

  allyMenu(game, m, purpose, need) {
    const list = [{ id: 'menu:back', label: '< Back', enabled: true, hint: '', back: true }];
    const bonusOnly = purpose === 'lay-on-hands' || purpose === 'inspire' || (purpose.startsWith('cast-') && SPELL_FX[purpose.slice(5)]?.bonus);
    game.party.members.forEach((o, i) => {
      if (o.dead) return;
      if (purpose === 'stabilize' && !(o.hp <= 0 && !o.death.stable)) return;
      if (purpose === 'inspire' && o === m) return;
      list.push({ id: `${purpose}:${i}`, label: `${o.name} ${Math.max(0, o.hp)}/${o.maxHp}`, enabled: need({ bonus: bonusOnly }), hint: '' });
    });
    return list;
  }

  spendAction(game, m) { m.actionReadyAt = game.time + ROUND; }
  spendBonus(game, m) { m.bonusReadyAt = game.time + ROUND; }

  /** Performs an action id from memberActions. Returns true if it happened. */
  doAction(game, m, id) {
    if (!canAct(m)) { game.log(`${m.name} can't act.`, RED); return false; }
    const [verb, arg, arg2] = id.split(':');
    switch (verb) {
      case 'attack': return this.weaponAction(game, m, arg === 'off' ? 'offHand' : 'mainHand');
      case 'dodge':
        this.spendAction(game, m);
        addEffect(m, { id: 'dodging', until: game.time + ROUND });
        game.log(`${m.name} takes a defensive stance.`);
        return true;
      case 'search': return this.search(game, m);
      case 'wrath': return this.useWrath(game, m);
      case 'rage':
        m.resources.rage -= 1; this.spendBonus(game, m);
        addEffect(m, { id: 'rage', until: game.time + 600 });
        game.log(`${m.name} flies into a Rage!`, RED); game.sound('rage');
        return true;
      case 'end-rage': removeEffect(m, 'rage'); return true;
      case 'reckless':
        addEffect(m, { id: 'reckless', until: game.time + ROUND });
        return this.weaponAction(game, m, 'mainHand');
      case 'second-wind': {
        m.resources.secondWind -= 1; this.spendBonus(game, m);
        const n = heal(m, roll(game.rng, '1d10') + m.level);
        game.log(`${m.name} catches a Second Wind: +${n} HP.`, GREEN); game.sound('heal');
        return true;
      }
      case 'action-surge': m.resources.actionSurge -= 1; m.actionReadyAt = game.time; game.log(`${m.name} surges forward!`, YELLOW); return true;
      case 'lay-on-hands': {
        const o = game.party.members[Number(arg)];
        const amount = Math.min(m.resources.layOnHands, o.maxHp - o.hp);
        if (amount <= 0) { game.log(`${o.name} needs no healing.`); return false; }
        m.resources.layOnHands -= amount; this.spendBonus(game, m); heal(o, amount);
        game.log(`${m.name} lays hands on ${o.name}: +${amount} HP.`, GREEN); game.sound('heal');
        return true;
      }
      case 'inspire': {
        const o = game.party.members[Number(arg)];
        m.resources.inspiration -= 1; this.spendBonus(game, m);
        addEffect(o, { id: 'bless', until: game.time + ROUND * 2 });
        game.log(`${m.name} inspires ${o.name}.`, CYAN); game.sound('spell');
        return true;
      }
      case 'innate-sorcery': m.resources.innateSorcery -= 1; this.spendBonus(game, m); addEffect(m, { id: 'innate-sorcery', until: game.time + 60 }); game.log(`${m.name}'s innate magic flares.`, CYAN); return true;
      case 'turn-undead': return this.turnUndead(game, m);
      case 'divine-spark': {
        const o = game.party.members[Number(arg)];
        m.resources.channelDivinity -= 1; this.spendAction(game, m);
        const n = heal(o, roll(game.rng, '1d8') + mod(m, 'wis'));
        game.log(`Divine light restores ${n} HP to ${o.name}.`, GREEN); game.sound('heal');
        return true;
      }
      case 'martial-arts': this.spendBonus(game, m); return this.strike(game, m, unarmedStrike(), null);
      case 'flurry': m.resources.focus -= 1; this.spendBonus(game, m); this.strike(game, m, unarmedStrike(), null); return this.strike(game, m, unarmedStrike(), null);
      case 'breath': return this.breathWeapon(game, m);
      case 'stabilize': return this.stabilize(game, m, game.party.members[Number(arg)]);
      case 'cast': return this.castSpell(game, m, arg, null);
      default:
        if (verb.startsWith('cast-')) return this.castSpell(game, m, verb.slice(5), game.party.members[Number(arg)]);
        return false;
    }
  }

  stabilize(game, m, o) {
    this.spendAction(game, m);
    if (game.feet(m, o) > 10) { game.log(`${o.name} is out of reach.`); return false; }
    const kit = m.pack.find((it) => it?.proto === 'healers-kit');
    const check = d20(game.rng, m, { bonus: skillBonus(m, 'medicine'), disadvantage: hasEffect(m, 'dread') });
    if (kit || check.total >= 10) {
      o.death.stable = true; o.death.fail = 0; o.death.success = 0;
      game.log(`${m.name} stabilizes ${o.name}.`, GREEN);
      return true;
    }
    game.log(`${m.name} fails to stabilize ${o.name}.`, RED);
    return true;
  }

  turnUndead(game, m) {
    m.resources.channelDivinity -= 1; this.spendAction(game, m);
    const dc = this.spellDc(m);
    let n = 0;
    for (const t of game.entities) {
      if (t.level !== game.party.level || t.dead || t.type !== 'undead' || game.feet(m, t) > 30) continue;
      if (!this.save(game, t, 'wis', dc).success) { addCondition(t, 'frightened', { until: game.time + 60 }); n++; }
    }
    game.log(`${m.name} presents a holy symbol. ${n} undead recoil!`, YELLOW); game.sound('spell');
    return true;
  }

  breathWeapon(game, m) {
    const targets = game.entities.filter((t) => t.level === game.party.level && this.isHostile(t) && game.feet(m, t) <= 15 && game.forwardness(t) > 0 && game.canSee(m, t));
    if (!targets.length) { game.log('Nothing in the cone.'); return false; }
    m.resources.breath -= 1; this.spendAction(game, m);
    const dc = 8 + mod(m, 'con') + pb(m);
    game.fxBolt(11, targets[0]);
    for (const t of targets) this.harm(game, m, t, roll(game.rng, '1d10') >> (this.save(game, t, 'dex', dc, { cover: coverOf(game, m, t) }).success ? 1 : 0), 'fire');
    return true;
  }

  /** Attack with the item in a hand. Handles range, ammunition, thrown weapons and Cleave. */
  weaponAction(game, m, slot) {
    const item = m.equipment[slot];
    const def = this.itemDef(item);
    const weapon = def?.kind === 'weapon' ? def : unarmedStrike();
    const off = m.equipment.offHand;
    if (weapon.props.twoHanded && slot === 'mainHand' && off) {
      game.log(`${m.name} needs both hands for the ${weapon.name}.`, RED);
      return false;
    }
    if (weapon.style === 'ranged') {
      const ammoType = weapon.props.ammunition?.type;
      const ammo = ammoType && m.pack.find((it) => it && this.itemDef(it)?.ammoType === ammoType);
      if (ammoType && !ammo) { game.log(`${m.name} has no ${ammoType}s.`, RED); return false; }
    }
    const ok = this.strike(game, m, weapon, item, slot);
    if (ok) {
      if (slot === 'offHand') {
        const nick = m.weaponMasteries.includes(weapon.id) && weapon.mastery === 'nick';
        if (nick) m.nickReadyAt = game.time + ROUND; // Nick waives the Bonus Action, but still only once per turn.
        else this.spendBonus(game, m);
      } else this.spendAction(game, m);
    }
    return ok;
  }

  strike(game, m, weapon, item, slot = null) {
    const reach = reachOf(weapon);
    const ranged = weapon.style === 'ranged';
    let targets = ranged ? [] : this.targetsFor(game, m, { maxFeet: reach, melee: true });
    let thrown = false;
    if (!targets.length && (ranged || weapon.props.thrown)) {
      targets = this.targetsFor(game, m, { maxFeet: rangeOf(weapon) });
      thrown = !ranged;
    }
    if (!targets.length) {
      if (ranged) { game.log(`${m.name} sees no target.`); return false; }
      // Out of reach costs nothing: a mistaken click shouldn't waste the Action.
      const backRank = game.party.members.indexOf(m) >= 2;
      game.log(`${m.name} ${backRank ? "can't reach from the back rank" : 'has nothing in reach'}.`);
      return false;
    }
    const t = targets[0];
    const feet = game.feet(m, t);
    const atRange = ranged || thrown;
    const normal = weapon.props.ammunition?.range ?? weapon.props.thrown?.range ?? 0;
    const enemyAdjacent = atRange && game.entities.some((o) => o.level === game.party.level && this.isHostile(o) && canAct(o) && game.feet(m, o) <= 5);
    const handsFree = slot === 'mainHand' && !m.equipment.offHand;
    const res = characterAttack({ game, attacker: m, target: t, weapon, item, ranged: atRange, feet, longRange: atRange && feet > normal, enemyAdjacent, handsFree, isExtra: slot === 'offHand' });
    if (atRange) game.fxBolt(thrown ? 7 : 4, t);
    this.afterRangedUse(game, m, weapon, item, slot, t, thrown);
    this.reportAttack(game, m, t, weapon, res);
    if (res.cleave) this.cleave(game, m, t, weapon, item, reach);
    return true;
  }

  afterRangedUse(game, m, weapon, item, slot, t, thrown) {
    if (weapon.style === 'ranged' && weapon.props.ammunition) {
      const type = weapon.props.ammunition.type;
      const i = m.pack.findIndex((it) => it && this.itemDef(it)?.ammoType === type);
      if (i >= 0) {
        const stack = m.pack[i];
        stack.qty = (stack.qty ?? 1) - 1;
        // After a fight you can recover half the ammunition (SRD Ammunition property).
        if (game.rng.int(1, 2) === 1) game.dropItem(makeItem(`${stack.proto}:1`), t.x, t.y, t.level, true);
        if (stack.qty <= 0) m.pack[i] = null;
      }
    }
    if (thrown && item) {
      if (item.qty > 1) { item.qty -= 1; game.dropItem(makeItem(`${item.proto}:1`), t.x, t.y, t.level, true); }
      else { m.equipment[slot] = null; game.dropItem(item, t.x, t.y, t.level, true); }
    }
  }

  cleave(game, m, first, weapon, item, reach) {
    const second = game.entities.find((o) => o !== first && o.level === first.level && this.isHostile(o) && game.feet(o, first) <= 5 && game.feet(m, o) <= reach);
    if (!second) return;
    const res = characterAttack({ game, attacker: m, target: second, weapon, item, ranged: false, feet: game.feet(m, second), noMod: true, isExtra: true });
    game.log('Cleave!', YELLOW);
    this.reportAttack(game, m, second, weapon, res);
  }

  reportAttack(game, a, t, weapon, r) {
    if (!r.hit && !r.graze) {
      game.log(`${a.name} misses ${t.name}. ${r.dice}`);
      game.sound('miss');
      return;
    }
    const tags = [r.crit && 'CRIT', r.sneak && 'sneak', r.smite && 'smite', r.graze && 'graze', r.mastery].filter(Boolean);
    game.log(`${a.name} hits ${t.name} for ${r.damage}${tags.length ? ` (${tags.join(', ')})` : ''}. ${r.dice}`, r.crit ? YELLOW : WHITE);
    this.afterHarm(game, a, t, r);
  }

  afterHarm(game, a, t, r) {
    game.fxHit(t, r.damage ?? r.dealt ?? 0);
    game.sound(t.dead ? 'kill' : 'hit');
    removeEffect(t, 'unaware');
    this.wake(game, t);
    if (r.saved) game.log(`${t.name} endures: ${r.saved}!`, RED);
    if (t.dead) this.onMonsterDeath(game, t);
  }

  /** Non-attack damage to a monster (spells, breath). */
  harm(game, a, t, amount, type, opts = {}) {
    const res = applyDamage(game.rng, t, amount, type, { time: game.time, ...opts });
    game.log(`${t.name} takes ${res.dealt} ${type}.`);
    this.afterHarm(game, a, t, { damage: res.dealt, saved: res.saved });
    if (checkConcentration(game.rng, t, res.dealt)) t.concentration = null;
    return res;
  }

  search(game, m) {
    this.spendAction(game, m);
    const r = d20(game.rng, m, { bonus: skillBonus(m, 'perception'), disadvantage: hasEffect(m, 'dread') });
    const found = game.revealHidden(r.total, 3);
    game.log(found ? `${m.name} finds ${found}!` : `${m.name} finds nothing (${r.total}).`, found ? YELLOW : WHITE);
    return true;
  }

  // ---------------------------------------------------------------- spells
  castSpell(game, m, id, ally) {
    const spell = this.srd.spells[id];
    const fx = SPELL_FX[id];
    if (!spell || !fx) return false;
    if (lacksArmorTraining(m, this.srd)) { game.log(`${m.name} can't cast in that armor.`, RED); return false; }
    const leveled = spell.level > 0;
    const usingFree = leveled && m.freeSpell?.id === id && !m.freeSpell.used && (m.slots.used >= m.slots.max);
    if (leveled && !usingFree && m.slots.used >= m.slots.max) { game.log(`${m.name} has no spell slots.`, RED); return false; }

    const did = this.resolveSpell(game, m, spell, fx, ally);
    if (!did) return false;
    if (leveled) { if (usingFree) m.freeSpell.used = true; else m.slots.used += 1; }
    if (fx.bonus) this.spendBonus(game, m); else this.spendAction(game, m);
    if (fx.concentration) this.startConcentration(game, m, id);
    game.sound('spell');
    return true;
  }

  startConcentration(game, m, id) {
    if (m.concentration && m.concentration !== id) this.endConcentration(game, m);
    m.concentration = id;
  }

  /** Ends what a caster is concentrating on, removing its effects everywhere. */
  endConcentration(game, m) {
    const id = m.concentration;
    if (!id) return;
    m.concentration = null;
    const fx = SPELL_FX[id];
    for (const c of [...game.party.members, ...game.entities]) {
      if (fx?.effect && getEffect(c, fx.effect)?.caster === m.uid) removeEffect(c, fx.effect);
      if (fx?.condition) {
        const cond = c.conditions?.find((x) => x.id === fx.condition && x.source === m.uid);
        if (cond) { removeCondition(c, fx.condition); c.sleeping = false; }
      }
    }
    removeEffect(m, 'marking');
    game.log(`${m.name} loses concentration.`, CYAN);
  }

  resolveSpell(game, m, spell, fx, ally) {
    const dc = this.spellDc(m) + (hasEffect(m, 'innate-sorcery') ? 1 : 0);
    const abilityMod = mod(m, this.spellAbility(m));
    const dice = fx.dice ?? spell.damageDice?.dice;
    const type = fx.type ?? spell.damageDice?.type;
    const rangeFeet = fx.rangeOverride ?? (fx.melee ? 5 : spell.rangeFeet);
    const target = () => this.targetsFor(game, m, { maxFeet: rangeFeet, melee: fx.melee })[0];

    switch (fx.mode) {
      case 'attack': {
        const t = target();
        if (!t) { game.log(`${spell.name}: no target in range.`); return false; }
        const atRange = !fx.melee;
        const feet = game.feet(m, t);
        const enemyAdjacent = atRange && game.entities.some((o) => o.level === game.party.level && this.isHostile(o) && canAct(o) && game.feet(m, o) <= 5);
        const am = this.attackState(game, m, t, { ranged: atRange, feet, enemyAdjacent });
        if (hasEffect(m, 'innate-sorcery')) am.advantage = true;
        const toHit = [];
        const r = d20(game.rng, m, { bonus: this.spellAttackBonus(m) + attackBlessings(game.rng, m, toHit), advantage: am.advantage, disadvantage: am.disadvantage });
        const cover = coverOf(game, m, t);
        const ac = armorClass(t, this.srd) + cover;
        const crit = r.natural === 20 || (am.autoCrit && r.natural !== 1);
        if (atRange) game.fxBolt(fx.color, t);
        removeEffect(m, 'mocked'); removeEffect(m, 'sapped');
        const toHitText = attackRollText(r, toHit, ac, cover);
        if (r.natural === 1 || (!crit && r.total < ac)) { game.log(`${m.name}'s ${spell.name} misses ${t.name}. ${toHitText}`); return true; }
        const damage = rollDice(game.rng, dice, { crit });
        game.log(`${m.name}'s ${spell.name} strikes ${t.name}${crit ? ' (CRIT)' : ''}. ${toHitText}; ${damageRollText([damage], damage.total)}`, crit ? YELLOW : WHITE);
        this.harm(game, m, t, damage.total, type, { crit });
        if (fx.onHit) this.applyRider(game, m, t, fx.onHit);
        return true;
      }
      case 'save': {
        const list = this.areaTargets(game, m, fx, rangeFeet);
        if (!list.length) { game.log(`${spell.name}: no target in range.`); return false; }
        const ability = spell.saveAbility ?? 'dex';
        const origin = this.areaOrigin(game, m, fx, list);
        game.fxBolt(fx.color, list[0]);
        for (const t of list) {
          const s = this.save(game, t, ability, dc, { cover: coverOf(game, origin, t) });
          const full = roll(game.rng, dice);
          if (s.success && !fx.half) { game.log(`${t.name} resists ${spell.name}.`); this.wake(game, t); continue; }
          this.harm(game, m, t, s.success ? Math.floor(full / 2) : full, type);
          if (!s.success && !t.dead) {
            if (fx.onFail) this.applyRider(game, m, t, fx.onFail);
            if (fx.push) game.pushFromParty(t);
          }
        }
        return true;
      }
      case 'auto': {
        const t = target();
        if (!t) { game.log(`${spell.name}: no target in range.`); return false; }
        game.fxBolt(fx.color, t);
        let total = 0;
        for (let i = 0; i < fx.count; i++) total += roll(game.rng, dice);
        game.log(`${m.name}'s ${fx.count} missiles strike ${t.name}.`, CYAN);
        this.harm(game, m, t, total, type);
        return true;
      }
      case 'heal': {
        const o = ally;
        if (!o || o.dead) return false;
        const n = heal(o, roll(game.rng, fx.dice) + abilityMod);
        game.log(`${m.name}'s ${spell.name} restores ${n} HP to ${o.name}.`, GREEN);
        game.sound('heal');
        return true;
      }
      case 'party': {
        const list = game.party.members.filter((o) => !o.dead && o.hp > 0).sort((a, b) => (a === m ? -1 : b === m ? 1 : 0)).slice(0, fx.maxTargets);
        for (const o of list) addEffect(o, { id: fx.effect, until: game.time + ROUND * fx.rounds, caster: m.uid });
        game.log(`${m.name} casts ${spell.name} on ${list.map((o) => o.name).join(', ')}.`, CYAN);
        return true;
      }
      case 'ally': case 'self': {
        const o = fx.mode === 'self' ? m : ally ?? m;
        addEffect(o, { id: fx.effect, until: game.time + ROUND * fx.rounds, caster: m.uid });
        if (fx.tempFromMod) grantTempHp(o, Math.max(1, abilityMod));
        game.log(`${m.name} casts ${spell.name}${o === m ? '' : ` on ${o.name}`}.`, CYAN);
        return true;
      }
      case 'selfTemp': { const n = roll(game.rng, fx.dice); grantTempHp(m, n); game.log(`${m.name} gains ${n} temporary HP.`, CYAN); return true; }
      case 'light': addEffect(m, { id: 'light', until: game.time + 3600 }); game.log(`${m.name} conjures a steady light.`, YELLOW); return true;
      case 'stabilize': {
        const o = game.party.members.find((x) => x.hp <= 0 && !x.dead && !x.death.stable);
        if (!o) { game.log('Nobody is dying.'); return false; }
        o.death.stable = true; game.log(`${m.name} steadies ${o.name}.`, GREEN);
        return true;
      }
      case 'mark': {
        const t = target();
        if (!t) { game.log(`${spell.name}: no target in range.`); return false; }
        addEffect(m, { id: 'marking', target: t.uid, dice: fx.dice, until: game.time + 3600 });
        game.log(`${m.name} marks ${t.name}.`, CYAN);
        return true;
      }
      case 'smite': addEffect(m, { id: 'smite', dice: fx.dice, until: game.time + ROUND * 2 }); game.log(`${m.name}'s weapon glows.`, YELLOW); return true;
      case 'saveDebuff': {
        const list = this.targetsFor(game, m, { maxFeet: rangeFeet }).slice(0, fx.maxTargets);
        if (!list.length) { game.log(`${spell.name}: no target in range.`); return false; }
        let affected = 0;
        for (const t of list) {
          this.wake(game, t);
          if (fx.sleeping && t.conditionImmunities?.includes('exhaustion')) continue; // They don't sleep.
          if (this.save(game, t, fx.ability, dc, { cover: coverOf(game, m, t) }).success) continue;
          affected++;
          if (fx.effect) addEffect(t, { id: fx.effect, until: game.time + ROUND * fx.rounds, caster: m.uid });
          if (fx.condition && addCondition(t, fx.condition, { until: game.time + ROUND * fx.rounds, source: m.uid })) {
            if (fx.sleeping) { t.sleepStage = 1; t.sleepDc = dc; t.sleepSource = m.uid; }
          }
        }
        game.log(`${spell.name}: ${affected} of ${list.length} affected.`, CYAN);
        return true;
      }
      default: return false;
    }
  }

  attackState(game, a, t, ctx) {
    return attackModifiersFor(a, t, ctx, game, this);
  }

  applyRider(game, m, t, rider) {
    const until = game.time + ROUND * (rider.rounds ?? 1);
    if (rider.effect) addEffect(t, { id: rider.effect, until, caster: m.uid });
    if (rider.condition) addCondition(t, rider.condition, { until, source: m.uid });
  }

  areaTargets(game, m, fx, rangeFeet) {
    if (fx.cone) return this.targetsFor(game, m, { maxFeet: rangeFeet, melee: true }).filter((t) => game.forwardness(t) > 0);
    const list = this.targetsFor(game, m, { maxFeet: rangeFeet });
    if (!list.length) return [];
    if (!fx.radiusFeet) return [list[0]];
    // A burst spreads from where it hits, so it reaches round corners the caster can't see past.
    const at = list[0], point = this.areaOrigin(game, m, fx, list);
    const caught = game.entities.filter((t) => t !== at && !t.dead && t.level === at.level && this.isHostile(t)
      && game.feet(t, at) <= fx.radiusFeet && game.clearSegment(point, game.centerOf(t), at.level));
    return [at, ...caught];
  }

  /** Where an area effect starts: a burst at its first target's feet, anything else at the caster. */
  areaOrigin(game, m, fx, list) {
    return fx.radiusFeet && !fx.cone ? game.centerOf(list[0]) : m;
  }

  /** The Shield spell as an automatic Reaction for prepared casters when it would turn a hit into a miss. */
  tryShieldReaction(game, c, attackTotal) {
    if (c.kind !== 'pc' || !c.prepared.includes('shield') || !canAct(c)) return false;
    if (c.reactionReadyAt > game.time || c.slots.used >= c.slots.max) return false;
    if (attackTotal >= armorClass(c, this.srd) + 5) return false;
    c.slots.used += 1;
    c.reactionReadyAt = game.time + ROUND;
    addEffect(c, { id: 'shield-spell', until: game.time + ROUND });
    game.log(`${c.name} raises a Shield of force!`, CYAN);
    return true;
  }

  // ---------------------------------------------------------------- items in use
  consume(game, m, item) {
    const def = this.itemDef(item);
    const use = def?.use;
    if (!use) return false;
    if (m.dead) return false;
    if (use.heal) {
      const n = heal(m, roll(game.rng, use.heal));
      game.log(`${m.name} drinks: +${n} HP.`, GREEN);
      game.sound('heal');
    } else if (use.eat) {
      game.log(`${m.name} eats a ration. It tastes of old leather.`);
    }
    return true;
  }

  /**
   * Throws the held item along the party's line of fire. The first member with an Action free makes
   * the attack: thrown weapons as normal, anything else as an improvised 1d4 without proficiency.
   */
  throwHeld(game) {
    const item = game.hand;
    if (!item) return false;
    const thrower = game.party.members.find((m) => canAct(m) && m.actionReadyAt <= game.time);
    if (!thrower) { game.log('Nobody is ready to throw.'); return false; }
    const def = this.itemDef(item);
    const isThrownWeapon = def?.kind === 'weapon' && def.props.thrown;
    const weapon = isThrownWeapon ? def : { id: 'improvised', name: def?.name ?? 'object', kind: 'weapon', training: 'martial', style: 'melee', damage: { dice: '1d4', type: 'bludgeoning' }, props: { thrown: { range: 20, long: 60 } } };
    const t = this.targetsFor(game, thrower, { maxFeet: weapon.props.thrown.long })[0];
    this.spendAction(game, thrower);
    game.sound('throw');
    if (!t) {
      game.throwToFloor();
      return true;
    }
    const feet = game.feet(thrower, t);
    const res = characterAttack({ game, attacker: thrower, target: t, weapon, ranged: true, feet, longRange: feet > weapon.props.thrown.range });
    game.fxBolt(7, t);
    this.reportAttack(game, thrower, t, weapon, res);
    game.hand = null;
    if (item.qty > 1) {
      item.qty -= 1;
      game.dropItem(makeItem(`${item.proto}:1`), t.x, t.y, t.level, true);
      game.hand = item;
    } else game.dropItem(item, t.x, t.y, t.level, true);
    return true;
  }

  // ---------------------------------------------------------------- locks
  /** Attempts to open a locked thing. Returns true if it opened. */
  tryUnlock(game, lock, heldItem) {
    const members = game.party.members.filter(canAct);
    const fits = (it) => it && lock.key && it.proto === lock.key;
    const holder = members.find((m) => m.pack.some(fits) || Object.values(m.equipment).some(fits));
    if (fits(heldItem) || holder) {
      game.log(`The ${this.itemInfo({ proto: lock.key }).baseName} turns in the lock.`, YELLOW);
      return true;
    }
    if (lock.dc == null) { game.log(lock.text ?? 'It is locked, and no skill will open it.'); return false; }
    const ready = members.filter((m) => m.actionReadyAt <= game.time);
    if (!ready.length) { game.log('Everyone is busy.'); return false; }
    const picker = ready.filter((m) => m.pack.some((it) => it?.proto === 'thieves-tools')).sort((a, b) => mod(b, 'dex') - mod(a, 'dex'))[0];
    if (picker) {
      this.spendAction(game, picker);
      const r = d20(game.rng, picker, { bonus: mod(picker, 'dex') + pb(picker), disadvantage: hasEffect(picker, 'dread') });
      if (r.total >= lock.dc) { game.log(`${picker.name} picks the lock (${r.total}).`, GREEN); game.sound('door'); return true; }
      game.log(`${picker.name} can't pick the lock (${r.total} vs DC ${lock.dc}).`);
      return false;
    }
    const brute = ready.sort((a, b) => mod(b, 'str') - mod(a, 'str'))[0];
    this.spendAction(game, brute);
    const dc = lock.dc + 2;
    const r = d20(game.rng, brute, { bonus: skillBonus(brute, 'athletics'), disadvantage: hasEffect(brute, 'dread') });
    if (r.total >= dc) { game.log(`${brute.name} forces it open (${r.total}).`, GREEN); game.alert?.(); return true; }
    game.log(`${brute.name} can't force it (${r.total} vs DC ${dc}).`);
    return false;
  }

  // ---------------------------------------------------------------- hidden things
  /** Does anyone's Passive Perception notice a hidden object? (SRD Hiding and Traps.) */
  noticeHidden(game, dc) { return game.party.members.some((m) => canAct(m) && passivePerception(m) >= dc); }

  // ---------------------------------------------------------------- traps and rule hooks
  /** Module scripts call rules by name, e.g. {do:'rule', name:'trap', dice:'2d10', save:'dex', dc:15, type:'fire'}. */
  rule(game, name, args) {
    switch (name) {
      case 'trap': return this.trap(game, args);
      case 'fall': return this.fall(game, args);
      case 'awardXp': return this.awardXp(game, args.amount);
      case 'passTime': return this.passTime(game, args);
      case 'reward': return this.reward(game, args);
      case 'dread': return this.dread(game, args);
      default: throw new Error(`unknown rule: ${name}`);
    }
  }

  trap(game, a) {
    const victims = (a.all ? game.party.members : [game.rng.pick(game.party.members.filter((m) => !m.dead))]).filter((m) => m && !m.dead);
    for (const m of victims) {
      const s = a.save ? this.save(game, m, a.save, a.dc) : { success: false };
      if (s.success && !a.half) { game.log(`${m.name} avoids the trap.`); continue; }
      if (a.dice) {
        const amount = roll(game.rng, a.dice);
        this.hurtMember(game, m, s.success ? Math.floor(amount / 2) : amount, a.type ?? 'piercing');
      }
      if (!s.success && a.condition) addCondition(m, a.condition, { until: game.time + ROUND * (a.rounds ?? 10) });
    }
    game.sound('hit');
  }

  fall(game, { dice = '1d6' }) {
    for (const m of game.party.members) if (!m.dead) this.hurtMember(game, m, roll(game.rng, dice), 'bludgeoning');
  }

  /** Hours go by, as when digging. */
  passTime(game, { dice = '1', text }) {
    const hours = roll(game.rng, dice);
    game.time += hours * 3600;
    game.log(`${text ?? 'Time passes.'} (${hours} ${hours === 1 ? 'hour' : 'hours'})`, 9);
  }

  /** Goes straight into a pack, since a reward often comes as the adventure ends and the floor stays behind. */
  reward(game, { proto, qty }) {
    const living = game.party.members.filter((m) => !m.dead);
    const stack = qty != null && living.flatMap((m) => m.pack).find((it) => it?.proto === proto && it.qty != null);
    if (stack) { stack.qty += qty; return; }
    const carrier = living.find((m) => m.pack.includes(null)) ?? living[0];
    if (!carrier) return;
    const item = makeItem(qty != null ? `${proto}:${qty}` : proto);
    const free = carrier.pack.indexOf(null);
    if (free >= 0) carrier.pack[free] = item;
    else carrier.pack.push(item);
  }

  /** Those with treachery in their past: Disadvantage on attack rolls and ability checks for a while. */
  dread(game, { rounds = 20 }) {
    for (const m of game.party.members) {
      if (m.dead || m.backgroundId !== 'criminal') continue;
      if (!hasEffect(m, 'dread')) game.log(`${m.name} sees visions of old treacheries, and falters.`, RED);
      removeEffect(m, 'dread');
      addEffect(m, { id: 'dread', until: game.time + ROUND * rounds });
    }
  }

  /** Whether anyone has a given item, worn or in a pack. */
  partyCarries(game, proto) {
    return game.party.members.some((m) => Object.values(m.equipment).some((it) => it?.proto === proto) || m.pack.some((it) => it?.proto === proto));
  }

  /** Wrath: once per Long Rest, Advantage on the next attack against a target, and no attacking anyone else until one of them falls. */
  useWrath(game, m) {
    const sword = m.equipment.mainHand;
    const t = this.wrathTarget(game, m);
    if (!t || sword?.powerUsed) return false;
    sword.powerUsed = true;
    addEffect(m, { id: 'wrath', target: t.uid, until: null });
    addEffect(m, { id: 'vex', target: t.uid, until: null });
    game.log(`Wrath binds ${m.name} to ${t.name}!`, YELLOW);
    return true;
  }
  wrathTarget(game, m) {
    return game.entities.filter((e) => e.level === game.party.level && this.isHostile(e) && game.canSee(m, e) && game.forwardness(e) >= FORWARD_DOT)
      .sort((a, b) => (b.uid === game.party.focus) - (a.uid === game.party.focus) || game.feet(m, a) - game.feet(m, b))[0] ?? null;
  }
  /** The binding ends when either of them falls, or the party leaves the level, so nobody is stuck unable to attack. */
  endWrath(game) {
    for (const m of game.party.members) {
      const bound = getEffect(m, 'wrath');
      if (!bound) continue;
      const t = game.entities.find((e) => e.uid === bound.target);
      if (t && !t.dead && t.hp > 0 && t.level === game.party.level && !isDown(m)) continue;
      removeEffect(m, 'wrath');
      removeEffect(m, 'vex');
      if (!m.dead) game.log(`Wrath releases ${m.name}.`, YELLOW);
    }
  }

  /** Damage to a party member, with all the logging and side effects. */
  hurtMember(game, m, amount, type, opts = {}) {
    const res = applyDamage(game.rng, m, amount, type, { time: game.time, ...opts });
    game.memberHit(m, res.dealt);
    if (res.saved) game.log(`${m.name} refuses to fall!`, YELLOW);
    this.afterMemberDamage(game, m, res);
    return res;
  }

  afterMemberDamage(game, m, res) {
    if (res.dealt > 0 && m.concentration && (res.droppedToZero || checkConcentration(game.rng, m, res.dealt))) this.endConcentration(game, m);
    if (m.hp <= 0 && m.concentration) this.endConcentration(game, m);
    if (res.droppedToZero) { game.log(`${m.name} falls!`, RED); game.sound('down'); }
    if (res.killed) { game.log(`${m.name} is dead!`, RED); game.sound('down'); }
    this.checkDefeat(game);
  }

  // ---------------------------------------------------------------- monsters
  createMonster(game, proto) {
    const def = this.srd.monsters[proto];
    if (!def) throw new Error(`unknown monster: ${proto}`);
    return {
      ...structuredClone(def), proto, kind: 'monster', uid: newUid('m'), maxHp: def.hp, tempHp: 0, conditions: [], effects: [],
      nextAct: 0, nextMove: 0, awake: false, usedOA: -Infinity, charges: {},
    };
  }

  monsterInfo(m) {
    const size = m.size?.[0] ?? 'Medium';
    return {
      name: m.name, sprite: m.sprite ?? SPRITE_BY_ID[m.proto] ?? SPRITE_BY_TYPE[m.type] ?? 'cultist',
      scale: { Tiny: 0.5, Small: 0.75, Medium: 1, Large: 1.25, Huge: 1.5, Gargantuan: 1.7 }[size] ?? 1,
      fills: size === 'Large' || size === 'Huge' || size === 'Gargantuan',
    };
  }

  /** A monster that hasn't noticed the party can be attacked with Advantage. */
  markUnaware(game, m) { addEffect(m, { id: 'unaware', until: null }); }

  wake(game, m, alertRadius = 3) {
    if (m.dead) return;
    if (!m.awake) {
      m.awake = true;
      m.nextAct = game.time + game.rng.int(1, 20) / 20 * ROUND - (m.initiative ?? 0) * 0.1 + 0.5;
      m.nextMove = game.time + 0.5;
      if (m.onWake) { const script = m.onWake; m.onWake = null; game.run(script); }
    }
    removeEffect(m, 'unaware');
    for (const o of game.entities) {
      if (o.awake || o.dead || o.level !== m.level || o.behaviour === 'dormant') continue;
      if (Math.max(Math.abs(o.x - m.x), Math.abs(o.y - m.y)) <= alertRadius && game.canSee(o, m)) this.wake(game, o, 0);
    }
  }

  /** Does a dormant monster notice the party this tick? */
  noticeCheck(game, m) {
    const dist = Math.max(Math.abs(m.x - game.party.x), Math.abs(m.y - game.party.y));
    const senses = m.behaviour === 'sleep' ? 1 : 6;
    if (dist > senses || !game.party.members.some((x) => !x.dead && game.canSee(m, x))) return false;
    if (dist <= 1) return true;
    // Passive Perception vs the party's noisiest member's passive Stealth.
    const stealth = Math.min(...game.party.members.filter((x) => !x.dead).map((x) => {
      const armor = this.itemDef(x.equipment.armor);
      return 10 + skillBonus(x, 'stealth') - (armor?.stealthDisadvantage ? 5 : 0);
    }));
    return (m.passivePerception ?? 10) + (6 - dist) >= stealth;
  }

  /** Whether any conscious, hostile monster is engaged; the engine slows party movement then. */
  inCombat(game) {
    return game.entities.some((m) => m.level === game.party.level && !m.dead && m.awake && !m.friendly && Math.max(Math.abs(m.x - game.party.x), Math.abs(m.y - game.party.y)) <= 8);
  }
  partyStepSeconds(game) {
    if (!this.inCombat(game)) return 0.3; // Exploration pace: nobody is counting feet per round.
    const speed = Math.min(...game.party.members.filter((m) => !isDown(m)).map((m) => speedOf(m, this.srd)), 30);
    return (this.cellFeet / Math.max(5, speed)) * ROUND / this.timeScale;
  }
  /** Prevents moving when a conscious member is held. Returns a reason string. */
  moveBlocked(game) {
    const held = game.party.members.find((m) => !isDown(m) && (hasCondition(m, 'restrained') || hasCondition(m, 'grappled')));
    return held ? `${held.name} is held fast!` : null;
  }

  /** Opportunity Attacks when the party steps out of a monster's reach. In a swap, stepping back draws one even though someone else stays in reach. */
  onPartyWillMove(game, oldPositions, { swap = false } = {}) {
    for (const m of game.entities) {
      if (m.level !== game.party.level || m.dead || !m.awake || !canAct(m)) continue;
      if (m.usedOA > game.time - ROUND) continue;
      const entry = multiattackPlan(m, false)[0];
      if (!entry) continue;
      const reach = entry.attack.reach ?? 5;
      const inReach = game.party.members.filter((x) => !isDown(x) && oldPositions.get(x) && game.feetFromPos(oldPositions.get(x), m) <= reach);
      if (!inReach.length) continue;
      const retreating = inReach.filter((x) => game.feet(x, m) > reach);
      if (!retreating.length || (!swap && retreating.length < inReach.length)) continue;
      m.usedOA = game.time;
      const t = game.rng.pick(retreating);
      game.log(`${m.name} strikes at the retreating ${t.name}!`, RED);
      this.resolveMonsterAttack(game, m, entry, t, { feet: reach, ranged: false });
    }
  }

  /** Someone able to walk steps up past a dead character in the front rank, from the same side if possible. */
  closeRanks(game) {
    const members = game.party.members;
    for (const i of [0, 1]) {
      if (!members[i]?.dead) continue;
      const j = [i + 2, 3 - i].find((k) => members[k] && !isDown(members[k]));
      if (j === undefined) continue;
      [members[i], members[j]] = [members[j], members[i]];
      game.log(`${members[i].name} steps up to the front rank.`, YELLOW);
    }
  }

  /** With nobody left standing there is no one to tend the fallen, so the adventure ends. */
  checkDefeat(game) {
    if (game.party.members.every((x) => x.dead || x.hp <= 0)) game.gameOver();
  }

  tick(game, dt) {
    const time = game.time;
    for (const m of game.party.members) this.tickMember(game, m, dt);
    this.checkDefeat(game);
    this.closeRanks(game);
    this.endWrath(game);
    for (const m of game.entities) {
      if (m.dead || m.level !== game.party.level) continue;
      this.expire(game, m);
      if (!m.awake) {
        if (m.behaviour === 'dormant') continue; // Waits to be told, or attacked.
        if (m.notBeforeCheck == null || time >= m.notBeforeCheck) {
          m.notBeforeCheck = time + 1;
          if (this.noticeCheck(game, m)) { this.wake(game, m); game.log(`${m.name} notices you!`, RED); }
        }
        continue;
      }
      if (hasCondition(m, 'frightened') && time >= m.nextMove && canAct(m)) { game.fleeEntity(m); m.nextMove = time + this.moveDelay(m); continue; }
      if (!canAct(m)) continue;
      if (time >= m.nextAct) this.monsterAct(game, m);
      if (time >= m.nextMove) this.monsterMove(game, m);
    }
  }

  moveDelay(m) {
    const speed = Math.max(5, speedOf(m, this.srd) - (hasEffect(m, 'slowed') ? 10 : 0));
    return (this.cellFeet / speed) * ROUND;
  }

  expire(game, c) {
    const t = game.time;
    const expired = c.effects.filter((e) => e.until != null && e.until <= t);
    if (expired.length) c.effects = c.effects.filter((e) => e.until == null || e.until > t);
    for (const e of expired) if (e.id === 'light') game.log(`${c.name}'s light fades.`);
    const before = c.conditions.length;
    c.conditions = c.conditions.filter((x) => x.until == null || x.until > t);
    if (before !== c.conditions.length) c.sleeping = hasCondition(c, 'unconscious') && c.sleeping;
    if (c.kind === 'monster' && hasCondition(c, 'prone') && canAct(c) && t >= c.nextMove) { // Stand up: half movement.
      removeCondition(c, 'prone');
      c.nextMove = t + this.moveDelay(c);
    }
    if (c.sleepStage === 1 && !hasCondition(c, 'incapacitated')) {
      c.sleepStage = 0;
      if (!this.save(game, c, 'wis', c.sleepDc).success) {
        addCondition(c, 'unconscious', { until: t + 60, source: c.sleepSource });
        c.sleeping = true;
        game.log(`${c.name} falls asleep.`, CYAN);
      }
    }
  }

  tickMember(game, m, dt) {
    if (m.dead) return;
    this.expire(game, m);
    // Standing up is automatic and costs half a round of waiting.
    if (m.hp > 0 && hasCondition(m, 'prone')) {
      removeCondition(m, 'prone');
      m.actionReadyAt = Math.max(m.actionReadyAt, game.time + ROUND / 2);
    }
    if (m.hp > 0 && hasCondition(m, 'unconscious') && !m.sleeping) removeCondition(m, 'unconscious');
    // Burn torches.
    for (const slot of ['mainHand', 'offHand']) {
      const it = m.equipment[slot];
      if (it?.proto !== 'torch') continue;
      it.burn = (it.burn ?? 3600) - dt * this.timeScale;
      if (it.burn <= 0) { m.equipment[slot] = null; game.log(`${m.name}'s torch gutters out.`, RED); }
    }
    // Death saving throws once per round at 0 HP.
    if (m.hp <= 0 && !m.death.stable) {
      if (m.nextDeathSave == null || m.nextDeathSave < game.time - ROUND) m.nextDeathSave = game.time + ROUND;
      if (game.time >= m.nextDeathSave) {
        m.nextDeathSave = game.time + ROUND;
        const r = game.rng.int(1, 20);
        if (r === 20) { heal(m, 1); game.log(`${m.name} rallies from the brink!`, GREEN); return; }
        if (r === 1) m.death.fail += 2;
        else if (r >= 10) m.death.success += 1;
        else m.death.fail += 1;
        if (m.death.fail >= 3) {
          m.dead = true;
          game.log(`${m.name} has died.`, RED); game.sound('down');
          this.checkDefeat(game);
        } else if (m.death.success >= 3) {
          m.death.stable = true;
          game.log(`${m.name} is stable.`, GREEN);
        }
      }
    }
  }

  monsterTargets(game, m, reach) {
    return game.party.members.filter((x) => !x.dead && game.feet(x, m) <= reach && game.canSee(m, x));
  }

  monsterAct(game, m) {
    // Special abilities with saves (Web, breath weapons...), when one's ready.
    const special = this.pickSpecial(game, m);
    if (special) {
      this.useSpecial(game, m, special);
      m.nextAct = game.time + ROUND;
      return;
    }
    const meleePlan = multiattackPlan(m, false);
    const reach = Math.max(5, ...meleePlan.map((e) => e.attack.reach ?? 0));
    const adjacent = this.monsterTargets(game, m, reach).filter((x) => x.hp > 0);
    const downed = this.monsterTargets(game, m, reach);
    const pool = adjacent.length ? adjacent : downed;
    if (pool.length) {
      for (const entry of meleePlan.length ? meleePlan : []) {
        const t = game.rng.pick(pool.filter((x) => !x.dead).length ? pool.filter((x) => !x.dead) : pool);
        if (!t || t.dead) break;
        this.resolveMonsterAttack(game, m, entry, t, { feet: game.feet(t, m), ranged: false });
      }
      m.nextAct = game.time + ROUND;
      return;
    }
    const rangedPlan = multiattackPlan(m, true).filter((e) => e.attack.range);
    const visible = game.party.members.filter((x) => x.hp > 0 && game.canSee(m, x));
    if (rangedPlan.length && visible.length) {
      const living = visible;
      for (const entry of rangedPlan) {
        const inRange = living.filter((x) => game.feet(x, m) <= entry.attack.longRange);
        if (!inRange.length) break;
        const t = game.rng.pick(inRange);
        const feet = game.feet(t, m);
        game.fxBoltFrom(m, 4);
        this.resolveMonsterAttack(game, m, entry, t, { feet, ranged: true, longRange: feet > entry.attack.range, enemyAdjacent: false });
      }
      m.nextAct = game.time + ROUND;
      return;
    }
    m.nextAct = game.time + 0.5; // Nothing in reach yet; try again shortly.
  }

  /** Save-based abilities from the stat block, with Recharge and per-day limits. */
  pickSpecial(game, m) {
    const list = (m.actions ?? []).filter((e) => e.save && !e.attack && (e.damage || e.conditions));
    for (const e of list) {
      const within = e.text.match(/within (\d+) feet/) ?? e.text.match(/(\d+)-foot/);
      const range = within ? Number(within[1]) : 30;
      if (!game.party.members.some((x) => x.hp > 0 && game.feet(x, m) <= range && game.canSee(m, x))) continue;
      const recharge = e.name.match(/Recharge (\d)/);
      const perDay = e.name.match(/(\d)\/Day/);
      m.charges[e.name] ??= perDay ? Number(perDay[1]) : 1;
      if (m.charges[e.name] <= 0) {
        if (recharge && game.rng.int(1, 6) >= Number(recharge[1])) m.charges[e.name] = 1;
        else continue;
      }
      if (game.rng.int(1, 100) > 45) continue;
      return { entry: e, range };
    }
    return null;
  }

  useSpecial(game, m, { entry, range }) {
    m.charges[entry.name] -= 1;
    const area = /each creature|-foot (cone|line|emanation|sphere|cube)/i.test(entry.text);
    const inRange = game.party.members.filter((x) => x.hp > 0 && game.feet(x, m) <= range && game.canSee(m, x));
    const targets = area ? inRange : [game.rng.pick(inRange)];
    game.log(`${m.name} uses ${entry.name.replace(/ \(.*$/, '')}!`, RED);
    game.fxBoltFrom(m, 13);
    const half = /Success: Half/.test(entry.text);
    for (const t of targets) {
      const s = this.save(game, t, entry.save.ability, entry.save.dc, { cover: coverOf(game, m, t) });
      if (s.success && !half) { game.log(`${t.name} avoids it.`); continue; }
      for (const d of entry.damage ?? []) {
        const n = roll(game.rng, d.dice);
        this.hurtMember(game, t, s.success ? Math.floor(n / 2) : n, d.type);
      }
      if (!s.success && !t.dead) this.applyEntryConditions(game, m, t, entry);
    }
  }

  applyEntryConditions(game, m, t, entry) {
    for (const id of entry.conditions ?? []) {
      const short = /next turn/.test(entry.text);
      const rounds = short ? 1 : id === 'restrained' || id === 'grappled' ? 2 : 10;
      addCondition(t, id, { until: game.time + ROUND * rounds, source: m.uid });
      game.log(`${t.name} is ${id}!`, RED);
    }
  }

  resolveMonsterAttack(game, m, entry, t, ctx) {
    const r = monsterAttack(game, m, entry, t, ctx);
    m.attackAnim = game.realTime;
    // Which picture the renderer shows: bows and slings are shot, anything else at range is thrown.
    m.attackPose = !ctx.ranged ? 'attack' : /bow|sling|blowgun/i.test(entry.name) ? 'shoot' : 'throw';
    if (ctx.ranged) game.sound('throw');
    else if (game.fxSlash(m)) game.sound('claw'); // Once however many attacks a Multiattack makes at this moment.
    const name = entry.name.replace(/ \(.*$/, '');
    if (!r.hit) { game.log(`${m.name}'s ${name} misses ${t.name}. ${r.dice}`); game.sound('miss'); return r; }
    game.log(`${m.name}'s ${name} hits ${t.name} for ${r.dealt}${r.crit ? ' (CRIT)' : ''}. ${r.dice}`, RED);
    game.memberHit(t, r.dealt);
    if (r.saved) game.log(`${t.name} refuses to fall!`, YELLOW);
    if (r.lostConcentration || (t.hp <= 0 && t.concentration)) this.endConcentration(game, t);
    if (r.droppedToZero) { game.log(`${t.name} falls!`, RED); game.sound('down'); }
    if (r.killed) { game.log(`${t.name} is dead!`, RED); game.sound('down'); }
    if (t.hp > 0 && entry.conditions?.length) {
      const allowed = !entry.save || !this.save(game, t, entry.save.ability, entry.save.dc).success;
      if (allowed) this.applyEntryConditions(game, m, t, entry);
    }
    this.checkDefeat(game);
    return r;
  }

  monsterMove(game, m) {
    m.nextMove = game.time + this.moveDelay(m);
    const meleePlan = multiattackPlan(m, false);
    const reach = Math.max(5, ...meleePlan.map((e) => e.attack.reach ?? 0));
    if (hasCondition(m, 'restrained') || hasCondition(m, 'grappled')) return;
    if (this.monsterTargets(game, m, reach).some((x) => x.hp > 0)) return;
    const prefersRange = !meleePlan.length || (multiattackPlan(m, true).some((e) => e.attack.range) && game.rng.int(1, 2) === 1);
    if (prefersRange && game.party.members.some((x) => x.hp > 0 && game.canSee(m, x))) return;
    game.stepEntityToward(m, game.party.x, game.party.y);
  }

  onMonsterDeath(game, m) {
    if (m.deathHandled) return;
    m.deathHandled = true;
    game.log(`${m.name} is slain!`, GREEN);
    this.awardXp(game, m.xp ?? 0);
    this.dropGear(game, m);
    game.onEntityDeath(m);
  }

  /** XP is divided among the living party (SRD "Monsters"). */
  awardXp(game, total) {
    const living = game.party.members.filter((x) => !x.dead);
    const share = Math.floor(total / Math.max(1, living.length));
    for (const x of living) {
      x.xp += share;
      if (maybeLevelUp(x)) { game.log(`${x.name} reaches level ${x.level}!`, YELLOW); game.sound('level'); }
    }
  }

  /** A slain monster leaves the Gear listed in its stat block. */
  dropGear(game, m) {
    for (const entry of m.gear ?? []) {
      const parsed = entry.match(/^(.*?)(?: \((\d+)\))?$/);
      let name = parsed[1];
      const qty = parsed[2];
      if (qty && name.endsWith('s')) name = name.slice(0, -1);
      const id = name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-');
      if (!this.srd.items[id]) continue;
      game.dropItem(makeItem(qty ? `${id}:${qty}` : id), m.x, m.y, m.level, true);
      if (/bow$/.test(id) && !/cross/.test(id)) game.dropItem(makeItem(`arrows:${game.rng.int(2, 8)}`), m.x, m.y, m.level, true);
    }
  }

  // ---------------------------------------------------------------- rests
  restOptions(game) {
    return [
      { id: 'short', label: 'Short Rest', hint: 'One hour. Spend Hit Dice to heal. Class features recover.' },
      { id: 'long', label: 'Long Rest', hint: 'Eight hours. Full recovery. Each member eats a ration if they have one.' },
    ];
  }

  canRest(game) {
    return this.inCombat(game) ? 'You cannot rest with enemies nearby!' : null;
  }

  rest(game, kind) {
    const blocked = this.canRest(game);
    if (blocked) { game.log(blocked, RED); return false; }
    if (kind === 'short') {
      game.advanceTime(3600);
      for (const m of game.party.members) {
        const n = shortRest(game.rng, m);
        if (n) game.log(`${m.name} recovers ${n} HP.`, GREEN);
      }
      game.log('A short rest passes.');
    } else {
      game.advanceTime(LONG_REST_SECONDS);
      for (const m of game.party.members) this.longRestMember(m);
      game.log('A long rest passes. You feel restored.', GREEN);
    }
    game.sound('heal');
    return true;
  }

  longRestMember(m) {
    const hasFood = m.pack.findIndex((it) => it?.proto === 'rations');
    if (hasFood >= 0) {
      const stack = m.pack[hasFood];
      stack.qty = (stack.qty ?? 1) - 1;
      if (stack.qty <= 0) m.pack[hasFood] = null;
    }
    // A stable character regains 1 HP after 1d4 hours, so a Long Rest always wakes them.
    longRest(m);
    // An item's power comes back with the rest of whoever is carrying it.
    for (const it of [...Object.values(m.equipment), ...m.pack]) if (it?.powerUsed) it.powerUsed = false;
  }

  /** How the party's standing shows on the end screen. */
  summary(game) {
    return game.party.members.map((m) => `${m.name}: level ${m.level}, ${m.xp} XP${m.dead ? ' (fallen)' : ''}`);
  }
}

function attackModifiersFor(a, t, ctx, game, rules) {
  const base = attackModifiers(a, t, ctx);
  if (rules.cannotSee(game, a)) base.disadvantage = true;
  return base;
}

export { ABILITY_NAMES, XP_TABLE, PACK_SIZE, SLOTS, isIncapacitated };
