// Every generated image: its prompt, aspect ratio and how tools/process-art.py treats it.
// kinds: tile (seamless square), face (square, not tiled), sprite (cut out from magenta), sheet (icon grid), image (as is).
const PAINT = 'Richly detailed painterly dark fantasy illustration, hand-painted digital oil, dramatic torchlit lighting, muted earthy palette, consistent with a classic 1980s fantasy role-playing game box painting.';
// Cutouts get their own wording: "torchlit" made Gemini paint actual torches floating beside the subject.
const SOLO = 'Richly detailed painterly dark fantasy illustration, hand-painted digital oil, moody side lighting, muted earthy palette, consistent with a classic 1980s fantasy role-playing game box painting. The subject is the only thing in the picture: no torches, no flames, no candles, no props beside it.';
const CUTOUT = 'Isolated on a completely flat, uniform, pure solid magenta (#FF00FF) background filling the whole image. No magenta on the subject. No cast shadow, no ground, no floor, no scenery, no text, no border, no frame. Crisp clean silhouette, whole subject in frame with a small margin.';
const CREATURE = `${SOLO} Full body from head to feet, standing and facing the viewer head-on, slightly threatening pose, as if about to attack someone directly in front of it. ${CUTOUT}`;
const TEXTURE = 'Flat, straight-on orthographic texture for a 3D game, filling the entire frame edge to edge, even diffuse lighting with no vignette and no directional shadows, high detail, no text, no border.';
const PORTRAIT = `${PAINT} Head-and-shoulders character portrait, three-quarter view, face clearly visible, looking at the viewer, dark blurred dungeon background, square composition, no text, no border.`;

const art = {};
const add = (id, kind, aspect, prompt, extra = {}) => { art[id] = { kind, aspect, prompt, ...extra }; };

// --- world textures
add('wall-warren', 'tile', '1:1', `Rough-hewn dungeon wall of irregular dark grey granite blocks with crumbling mortar, some damp and moss. ${TEXTURE}`);
add('wall-crypt', 'tile', '1:1', `Ancient crypt wall of large, carefully fitted pale limestone blocks, water-stained and dark with age, faint carved border lines. ${TEXTURE}`, { gain: 0.62 });
add('floor-warren', 'tile', '1:1', `Top-down view of a dungeon floor of worn uneven dark flagstones with packed dirt in the cracks. ${TEXTURE}`);
add('floor-crypt', 'tile', '1:1', `Top-down view of a crypt floor of large square pale stone slabs, cracked and damp with dark water stains. ${TEXTURE}`, { gain: 0.62 });
add('ceiling', 'tile', '1:1', `View looking straight up at a low dungeon ceiling of rough dark stone with soot stains and small roots. ${TEXTURE}`);
add('door-wood', 'face', '1:1', `Heavy dungeon door of thick dark oak planks with black iron bands, big rivets and an iron ring handle, filling the frame completely edge to edge, straight-on. ${TEXTURE}`);
add('door-iron', 'face', '1:1', `Massive rusted iron dungeon door with riveted plates and a large keyhole in the center, filling the frame completely edge to edge, straight-on. ${TEXTURE}`);
add('portcullis', 'sprite', '1:1', `A rusted black iron portcullis grating of thick vertical and horizontal bars with pointed ends at the bottom, straight-on and perfectly flat, filling the frame from edge to edge. Between the bars is only flat solid pure magenta (#FF00FF). No shadow, no scenery, no text.`, { noTrim: true });
add('stairs-down', 'face', '1:1', `Straight-on view into a narrow stone stairway descending into blackness, seen from the top, stone arch around it filling the frame, torchlit near steps fading to total darkness. High detail, no text, no border.`);
add('stairs-up', 'face', '1:1', `Straight-on view of a narrow stone stairway rising upward into shadow, stone arch around it filling the frame, torchlit worn steps. High detail, no text, no border.`);
add('alcove', 'face', '1:1', `A dungeon stone wall with a dry carved stone font basin set into a shallow arched niche at its center, straight-on view, flat lighting, the wall fills the frame edge to edge. ${PAINT} No text, no border.`);

// --- wall fixtures and floor decals (cut out)
add('lever-up', 'sprite', '1:1', `${SOLO} A heavy iron wall lever on a bolted iron plate, handle pointing up, straight-on view. ${CUTOUT}`);
add('lever-down', 'sprite', '1:1', `${SOLO} A heavy iron wall lever on a bolted iron plate, handle pointing down, straight-on view. ${CUTOUT}`);
add('plaque', 'sprite', '1:1', `${SOLO} A weathered square stone tablet with rows of illegible chiselled marks, straight-on view, slightly chipped edges. ${CUTOUT}`);
add('pit', 'sprite', '1:1', `Top-down view of a square black pit in a stone floor, broken flagstones around the rim, darkness inside. ${CUTOUT}`, { noTrim: true });
add('plate', 'sprite', '1:1', `Top-down view of a square stone pressure plate slightly sunken, with a thin dark gap around it and soot marks. ${CUTOUT}`, { noTrim: true });

// --- creatures
add('rat', 'sprite', '1:1', `${SOLO} A huge diseased giant rat, front view coming straight at the viewer, matted fur, bared yellow teeth, red eyes. ${CUTOUT}`);
add('goblin', 'sprite', '3:4', `A small wiry goblin warrior with green skin, long ears and yellow eyes, wearing patched leather armor, holding a notched scimitar and a small round wooden shield. ${CREATURE}`);
add('goblin-boss', 'sprite', '3:4', `A goblin chieftain with green skin and a scarred face, wearing a chain shirt, a dented helmet with horns and a ragged red cloak, holding a scimitar. ${CREATURE}`);
add('skeleton', 'sprite', '3:4', `An animated human skeleton warrior with yellowed bones and glowing eye sockets, holding a rusty shortsword, tattered rags on its hips. ${CREATURE}`);
add('zombie', 'sprite', '3:4', `A shambling rotting human zombie with grey-green flesh and torn peasant clothes, arms reaching toward the viewer. ${CREATURE}`);
add('cultist', 'sprite', '3:4', `A hooded human cultist in dark crimson robes with the face in shadow, holding a curved ritual sickle. ${CREATURE}`);
add('cultist-boss', 'sprite', '3:4', `A fanatical necromancer priest in black and gold robes, gaunt pale face, a dark glowing blade in one hand and a blue stone clutched in the other. ${CREATURE}`);
add('shade', 'sprite', '3:4', `A living shadow creature, a humanoid silhouette of swirling black smoke with long clawed hands and two pale glowing eyes. ${CREATURE}`);
add('spider', 'sprite', '1:1', `${SOLO} A giant hairy cave spider, front view coming at the viewer, many eyes glinting, fangs dripping. ${CUTOUT}`);
add('centipede', 'sprite', '1:1', `${SOLO} A giant armored cave centipede rearing up toward the viewer, front view, snapping mandibles. ${CUTOUT}`);

// --- creatures attacking, repainted from the sprites above so each stays recognisably the same creature
// Asking to repaint the "same creature" alone made Gemini copy the reference's pose and change only the face.
const ATTACK = `The reference image only shows what this character looks like: keep its colors, clothing, equipment and painting style, but do not copy its pose. Draw a completely new, dynamic full-body action pose with the limbs in clearly different positions, caught mid-attack on someone directly in front of it, body twisted into the blow and leaning toward the viewer. ${SOLO} ${CUTOUT}`;
const attackPose = (id, aspect, pose) => add(`${id}-attack`, 'sprite', aspect, `${pose} ${ATTACK}`, { ref: id });
attackPose('rat', '1:1', 'The giant rat leaps at the viewer with jaws wide open and front claws spread.');
attackPose('goblin', '3:4', 'The goblin swings its scimitar high overhead with one arm, shield thrust forward, mouth open in a war cry.');
attackPose('goblin-boss', '3:4', 'The goblin chieftain brings its scimitar down in a two-handed overhead chop, cloak flying behind it.');
attackPose('skeleton', '3:4', 'The skeleton thrusts its rusty shortsword forward in a stabbing lunge, jaw hanging open.');
attackPose('zombie', '3:4', 'The zombie lurches forward grabbing with both clawed hands, mouth gaping wide to bite. The whole body down to both bare feet fits in the frame with a wide empty margin below the feet and on every side.');
attackPose('cultist', '3:4', 'The cultist faces the viewer with the hood toward us and the face in shadow, one arm raised high above the head holding the sickle ready to slash down, robes swirling. The whole figure down to the feet fits in the frame with a wide empty margin on every side.');
attackPose('cultist-boss', '3:4', 'The necromancer stabs forward with the dark glowing blade, the blue stone flaring in the other hand.');
attackPose('shade', '3:4', 'The shadow creature lashes out with one long clawed hand stretched toward the viewer. Its smoke stays close to its body, all of it black and grey, and the whole creature fits in the frame with a wide empty margin on every side, nothing touching the edges.');
attackPose('spider', '1:1', 'The spider rears up with its front legs raised high and its dripping fangs spread wide, about to strike.');
attackPose('centipede', '1:1', 'The centipede has uncoiled and lashes straight at the viewer in a long diagonal strike across the frame, head huge and close, mandibles spread wide open, legs splayed out.');

// Ranged attacks get their own pose: a bow drawn, or a blade let fly, aimed at someone directly in front of it.
const RANGED = `The reference image only shows what this character looks like: keep its colors, clothing and painting style, but do not copy its pose. Draw a completely new full-body pose with the limbs in clearly different positions, facing the viewer and aiming straight at someone directly in front of it. ${SOLO} ${CUTOUT}`;
const rangedPose = (id, kind, aspect, pose) => add(`${id}-${kind}`, 'sprite', aspect, `${pose} ${RANGED}`, { ref: id });
rangedPose('goblin', 'shoot', '3:4', 'The goblin has slung its shield on its back and draws a short wooden bow at full stretch, arrow nocked and pointed straight at the viewer, one yellow eye squinting along the shaft.');
rangedPose('goblin', 'throw', '3:4', 'The goblin is in the middle of throwing a dagger overarm at the viewer: throwing arm whipped forward at shoulder height, the dagger just leaving its fingers, shield arm swung back for balance.');
rangedPose('goblin-boss', 'shoot', '3:4', 'The goblin chieftain, scimitar sheathed at its hip, draws a short bow at full stretch with an arrow pointed straight at the viewer, cloak hanging behind it.');
rangedPose('skeleton', 'shoot', '3:4', 'The skeleton has its shortsword sheathed at its hip and draws a battered short bow at full stretch, arrow pointed straight at the viewer, bony fingers at its jaw.');

// --- effects
add('slash', 'sprite', '1:1', `${SOLO} Three parallel curved claw slash marks raking diagonally through empty space from upper right to lower left, like a monster's claws tearing the air, tapering to sharp points at both ends, pale bone-white hot core fading to deep blood red edges, with a few flecks of blood. Only the three slash marks: no creature, no hand, no claws, no symbols. ${CUTOUT}`, { size: 512, loose: true });

// --- dungeon features
add('chest', 'sprite', '1:1', `${SOLO} A closed old wooden treasure chest bound in iron, front view seen from slightly above. ${CUTOUT}`);
add('chest-open', 'sprite', '1:1', `${SOLO} An open empty old wooden treasure chest bound in iron, lid up, front view seen from slightly above. ${CUTOUT}`);
add('altar', 'sprite', '1:1', `${SOLO} A blood-stained black stone sacrificial altar carved with skulls, front view. ${CUTOUT}`);

// --- items, as one sheet: order matters, it names the cells (see ICONS)
export const ICONS = ['sword', 'dagger', 'axe', 'mace', 'bow', 'staff', 'spear', 'shield', 'heavy-armor', 'light-armor', 'potion', 'scroll', 'key', 'torch', 'food', 'tools', 'coin', 'amulet', 'ring', 'book', 'arrows', 'pouch', 'gem', 'bones', 'unknown'];
const iconDesc = 'row 1: longsword, dagger, battle axe, spiked mace, wooden bow; row 2: wizard staff, spear, round shield, steel chain mail shirt, brown leather armor; row 3: red potion bottle, rolled parchment scroll, iron key, lit torch, bread and cheese; row 4: leather roll of lockpicks, stack of gold coins, silver amulet, gold ring, leather-bound book; row 5: quiver of arrows, leather pouch, glowing blue gemstone, pile of bones, small wooden crate';
add('icons', 'sheet', '1:1', `A game inventory icon sheet: exactly 25 separate fantasy items in a neat 5 by 5 grid, evenly spaced, each centered in its own cell and not touching any other, painted in a consistent hand-painted fantasy RPG style with strong readable silhouettes. In order, ${iconDesc}. ${CUTOUT}`, { grid: 5 });

// --- action icons for the character boxes; items already have theirs on the sheet above
// Saying "icon" here made Gemini add graphic symbols and pictograms, so these ask for a plain painted object.
const ACTION = `${SOLO} One single painted object with a strong simple silhouette, centered, filling most of the frame. Only this one object: no symbols, no pictograms, no arrows, no graphic overlays, no frame, no background plate. ${CUTOUT}`;
add('icon-fist', 'sprite', '1:1', `A clenched human fist seen from the front, bare scarred knuckles, a leather wrap around the wrist. ${ACTION}`, { size: 128 });
add('icon-dodge', 'sprite', '1:1', `A lone worn leather boot seen from the side, heel lifted as if springing away, with a pale wisp of dust curling behind the heel. ${ACTION}`, { size: 128 });
add('icon-search', 'sprite', '1:1', `An antique brass magnifying glass with a round lens and a wooden handle, tilted diagonally. ${ACTION}`, { size: 128 });
add('icon-cast', 'sprite', '1:1', `A complete slender carved wooden magic wand lying diagonally across the frame, from bottom left to top right, one unbroken piece with no hand holding it, golden sparks glowing around its tip. ${ACTION}`, { size: 128, loose: true });
add('icon-skill', 'sprite', '1:1', `A single jagged bolt of golden lightning floating in empty space, glowing, with small crackling sparks. ${ACTION}`, { size: 128 });

// --- portraits: the default party, then one per remaining class
add('portrait-fighter', 'image', '1:1', `A stocky female dwarf fighter with braided copper hair, scarred cheek, steel chain mail. ${PORTRAIT}`);
add('portrait-rogue', 'image', '1:1', `A sly young halfling rogue with curly brown hair, a mischievous smile and a dark leather hood. ${PORTRAIT}`);
add('portrait-cleric', 'image', '1:1', `A determined human woman cleric with short dark hair, warm brown skin, chain shirt and a silver holy symbol at her neck. ${PORTRAIT}`);
add('portrait-wizard', 'image', '1:1', `A serene elf woman wizard with long silver-blonde hair, pointed ears and deep blue robes, faint magic light on her face. ${PORTRAIT}`);
add('portrait-barbarian', 'image', '1:1', `A fierce barbarian warrior with war paint, wild hair and a fur mantle. ${PORTRAIT}`);
add('portrait-bard', 'image', '1:1', `A charming bard with a feathered cap and a lute strap over one shoulder, a knowing smile. ${PORTRAIT}`);
add('portrait-druid', 'image', '1:1', `A weathered druid with leaf-woven hair, wooden torc and green-brown robes. ${PORTRAIT}`);
add('portrait-monk', 'image', '1:1', `A calm shaven-headed monk in simple ochre wraps, focused gaze. ${PORTRAIT}`);
add('portrait-paladin', 'image', '1:1', `A noble paladin in polished plate armor with a white tabard, resolute expression. ${PORTRAIT}`);
add('portrait-ranger', 'image', '1:1', `A lean ranger in a green hooded cloak with a bowstring across the chest, keen eyes. ${PORTRAIT}`);
add('portrait-sorcerer', 'image', '1:1', `A young sorcerer with arcane light in their eyes, wind-tossed hair and traces of faint scales on the cheek. ${PORTRAIT}`);
add('portrait-warlock', 'image', '1:1', `A pale warlock in dark leathers with an eerie violet glow from an occult pendant, unsettling smile. ${PORTRAIT}`);

// --- dwarf portraits, one per class apart from the fighter, whose portrait is already a dwarf
const DWARF = 'Clearly a dwarf: short, broad and stocky, with a wide nose and a heavy brow.';
add('portrait-dwarf-barbarian', 'image', '1:1', `A fierce male dwarf barbarian with a wild red beard, war paint and a fur mantle. No flames or fire in front of the character. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-bard', 'image', '1:1', `A charming female dwarf bard with braided auburn hair, a feathered cap and a lute strap over one shoulder, a knowing smile. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-cleric', 'image', '1:1', `A determined male dwarf cleric with a neat grey beard, chain shirt and a silver holy symbol at his neck. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-druid', 'image', '1:1', `A weathered female dwarf druid with leaf-woven braids, wooden torc and green-brown robes. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-monk', 'image', '1:1', `A calm shaven-headed male dwarf monk with a short plaited beard, simple ochre wraps and a focused gaze. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-paladin', 'image', '1:1', `A noble female dwarf paladin with blonde braids, polished plate armor and a white tabard, resolute expression. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-ranger', 'image', '1:1', `A lean, keen-eyed male dwarf ranger with a dark beard, a green hooded cloak and a bowstring across the chest. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-rogue', 'image', '1:1', `A sly female dwarf rogue with black braids, a dark leather hood and a mischievous smile. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-sorcerer', 'image', '1:1', `A young male dwarf sorcerer with a short copper beard, arcane light in his eyes, wind-tossed hair and traces of faint scales on the cheek. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-warlock', 'image', '1:1', `A pale female dwarf warlock in dark leathers with an eerie violet glow from an occult pendant, unsettling smile. No flames or fire in front of the character. ${DWARF} ${PORTRAIT}`);
add('portrait-dwarf-wizard', 'image', '1:1', `An elderly male dwarf wizard with a long silver beard and deep blue robes, faint magic light on his face. ${DWARF} ${PORTRAIT}`);

// --- elf portraits, one per class on offer apart from the wizard, whose portrait is already an elf
const ELF = 'Clearly an elf: slender, with long pointed ears, high cheekbones and fine ageless features. No flames or fire in front of the character.';
add('portrait-elf-barbarian', 'image', '1:1', `A fierce female elf barbarian with wild dark red hair, war paint and a fur mantle. ${ELF} ${PORTRAIT}`);
add('portrait-elf-bard', 'image', '1:1', `A charming male elf bard with long golden hair, a feathered cap and a lute strap over one shoulder, a knowing smile. ${ELF} ${PORTRAIT}`);
add('portrait-elf-cleric', 'image', '1:1', `A determined female elf cleric with short white-blonde hair, a chain shirt and a silver holy symbol at her neck. ${ELF} ${PORTRAIT}`);
add('portrait-elf-druid', 'image', '1:1', `A weathered male elf druid with leaf-woven brown hair, wooden torc and green-brown robes. ${ELF} ${PORTRAIT}`);
add('portrait-elf-fighter', 'image', '1:1', `A battle-hardened male elf fighter with tied-back black hair, a scar across one brow and steel chain mail. ${ELF} ${PORTRAIT}`);
add('portrait-elf-monk', 'image', '1:1', `A calm shaven-headed female elf monk in simple ochre wraps, focused gaze. ${ELF} ${PORTRAIT}`);
add('portrait-elf-paladin', 'image', '1:1', `A noble male elf paladin with long silver hair, polished plate armor and a white tabard, resolute expression. ${ELF} ${PORTRAIT}`);
add('portrait-elf-ranger', 'image', '1:1', `A lean, keen-eyed female elf ranger with auburn braids, a green hooded cloak and a bowstring across the chest. ${ELF} ${PORTRAIT}`);
add('portrait-elf-rogue', 'image', '1:1', `A sly male elf rogue with dark tousled hair, a dark leather hood and a mischievous smile. ${ELF} ${PORTRAIT}`);

// --- halfling portraits, one per class on offer apart from the rogue, whose portrait is already a halfling
const HALFLING = 'Clearly a full-grown adult halfling, not a child: a small folk with a round, rosy, mature face, full cheeks, a small nose, rounded ears with only the faintest point, and no beard. No flames or fire in front of the character.';
add('portrait-halfling-barbarian', 'image', '1:1', `A fierce female halfling barbarian with wild curly red hair, war paint and a fur mantle too big for her. ${HALFLING} ${PORTRAIT}`);
add('portrait-halfling-bard', 'image', '1:1', `A charming male halfling bard with curly chestnut hair, a feathered cap and a lute strap over one shoulder, a knowing smile. ${HALFLING} ${PORTRAIT}`);
add('portrait-halfling-cleric', 'image', '1:1', `A determined female halfling cleric in her forties, bareheaded, with short curly black hair, deep brown skin, a chain shirt and a silver holy symbol at her neck. ${HALFLING} ${PORTRAIT}`);
add('portrait-halfling-druid', 'image', '1:1', `A weathered older male halfling druid with leaf-woven curly grey hair, wooden torc and green-brown robes. ${HALFLING} ${PORTRAIT}`);
add('portrait-halfling-fighter', 'image', '1:1', `A battle-hardened middle-aged male halfling fighter with cropped sandy curls, weathered skin, crow's feet, a scar on the chin and steel chain mail. ${HALFLING} ${PORTRAIT}`);
add('portrait-halfling-monk', 'image', '1:1', `A calm shaven-headed middle-aged female halfling monk with fine lines around the eyes, simple ochre wraps and a focused gaze. ${HALFLING} ${PORTRAIT}`);
add('portrait-halfling-paladin', 'image', '1:1', `A noble female halfling paladin with tied-back golden curls, polished plate armor and a white tabard, resolute expression. ${HALFLING} ${PORTRAIT}`);
add('portrait-halfling-ranger', 'image', '1:1', `A lean, keen-eyed male halfling ranger with dark curly hair, a green hooded cloak and a bowstring across the chest. ${HALFLING} ${PORTRAIT}`);
add('portrait-halfling-wizard', 'image', '1:1', `A kindly elderly female halfling wizard with curly white hair and deep blue robes, faint magic light on her face. ${HALFLING} ${PORTRAIT}`);

// --- gnome portraits, one per class on offer
const GNOME = 'Clearly a gnome: a tiny folk with a large head, a big prominent nose, very large bright eyes, a wide grin line and small pointed ears. No flames or fire in front of the character.';
add('portrait-gnome-barbarian', 'image', '1:1', `A fierce male gnome barbarian with a wild orange beard, war paint and a fur mantle too big for him. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-bard', 'image', '1:1', `A charming female gnome bard with bright copper pigtails, a feathered cap and a lute strap over one shoulder, a knowing smile. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-cleric', 'image', '1:1', `A determined male gnome cleric with a neat white beard, tanned skin, a chain shirt and a silver holy symbol at his neck. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-druid', 'image', '1:1', `A weathered female gnome druid with leaf-woven ash-grey hair, wooden torc and green-brown robes. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-fighter', 'image', '1:1', `A battle-hardened female gnome fighter with short spiky russet hair, a scarred nose and steel chain mail. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-monk', 'image', '1:1', `A calm shaven-headed male gnome monk with a thin grey moustache, simple ochre wraps and a focused gaze. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-paladin', 'image', '1:1', `A noble male gnome paladin with a trimmed golden beard, polished plate armor and a white tabard, resolute expression. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-ranger', 'image', '1:1', `A lean, keen-eyed female gnome ranger with dark brown braids, a green hooded cloak and a bowstring across the chest. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-rogue', 'image', '1:1', `A sly male gnome rogue with slicked black hair, a dark leather hood and a mischievous smile. ${GNOME} ${PORTRAIT}`);
add('portrait-gnome-wizard', 'image', '1:1', `An eccentric female gnome wizard with wild white hair, small round spectacles and deep blue robes, faint magic light on her face. ${GNOME} ${PORTRAIT}`);

// --- human portraits, for the classes whose portrait is another species; the other class portraits already look human
const HUMAN = 'Clearly an ordinary human of normal proportions, with rounded ears. No flames or fire in front of the character.';
add('portrait-human-fighter', 'image', '1:1', `A battle-hardened human woman fighter with tied-back dark blonde hair, a scar across one cheek and steel chain mail. The painting runs right to the edges of the image, with no aged paper, worn edges or vignette frame. ${HUMAN} ${PORTRAIT}`);
add('portrait-human-rogue', 'image', '1:1', `A sly human woman rogue with short black hair, olive skin, a dark leather hood and a mischievous smile. ${HUMAN} ${PORTRAIT}`);
add('portrait-human-wizard', 'image', '1:1', `A wise elderly human man wizard with a long grey beard and deep blue robes, faint magic light on his face. ${HUMAN} ${PORTRAIT}`);

// --- the other sex for every species and class on offer, as each portrait above shows only one
const NO_FRAME = 'The painting runs right to the edges of the image, with no aged paper, worn edges or vignette frame.';
const CLASS_LOOK = {
  barbarian: 'war paint and a fur mantle', bard: 'a feathered cap and a lute strap over one shoulder, a knowing smile', cleric: 'a chain shirt and a silver holy symbol at the neck',
  druid: 'leaves woven into the hair, a wooden torc and green-brown robes', fighter: 'a battle-hardened look, a scar on the face and steel chain mail', monk: 'a shaven head, simple ochre wraps and a focused gaze',
  paladin: 'polished plate armor and a white tabard, resolute expression', ranger: 'a lean build, keen eyes, a green hooded cloak and a bowstring across the chest', rogue: 'a dark leather hood and a sly, mischievous smile',
  wizard: 'deep blue robes and faint magic light on the face',
};
const SPECIES_LOOK = { human: HUMAN, dwarf: `${DWARF} No flames or fire in front of the character.`, elf: ELF, halfling: HALFLING, gnome: GNOME };
const OTHER_SEX = {
  human: {
    barbarian: ['female', 'wild black hair and a broken nose'], bard: ['female', 'long auburn hair'], cleric: ['male', 'a cropped dark beard and warm brown skin'], druid: ['female', 'long grey-streaked hair and a weathered face'], fighter: ['male', 'short greying hair and a stubbled jaw'],
    monk: ['female', 'calm dark eyes'], paladin: ['female', 'tied-back blonde hair'], ranger: ['female', 'a dark braid'], rogue: ['male', 'tousled black hair and olive skin'], wizard: ['female', 'long white hair and an elderly, wise face'],
  },
  dwarf: {
    barbarian: ['female', 'wild red braids and no beard'], bard: ['male', 'a braided chestnut beard'], cleric: ['female', 'neat iron-grey braids and no beard'], druid: ['male', 'a long moss-brown beard'], fighter: ['male', 'a thick black beard and a broken nose'],
    monk: ['female', 'no beard'], paladin: ['male', 'a square golden beard'], ranger: ['female', 'dark brown braids and no beard'], rogue: ['male', 'a short forked black beard'], wizard: ['female', 'long silver braids, an elderly face and no beard'],
  },
  elf: {
    barbarian: ['male', 'wild black hair'], bard: ['female', 'long copper hair'], cleric: ['male', 'short silver hair'], druid: ['female', 'long chestnut hair'], fighter: ['female', 'tied-back raven hair'],
    monk: ['male', 'a serene face'], paladin: ['female', 'long golden hair'], ranger: ['male', 'long ash-brown hair'], rogue: ['female', 'short dark hair'], wizard: ['male', 'long pale hair'],
  },
  halfling: {
    barbarian: ['male', 'wild curly black hair'], bard: ['female', 'curly honey-blonde hair'], cleric: ['male', 'short curly grey hair, middle-aged'], druid: ['female', 'curly grey hair, weathered and middle-aged'], fighter: ['female', 'cropped auburn curls, middle-aged and weathered'],
    monk: ['male', 'fine lines around the eyes, middle-aged'], paladin: ['male', 'cropped sandy curls, middle-aged'], ranger: ['female', 'dark curly hair in a short braid'], rogue: ['female', 'curly brown hair'], wizard: ['male', 'curly white hair and an elderly, kindly face'],
  },
  gnome: {
    barbarian: ['female', 'wild orange hair'], bard: ['male', 'a curled copper moustache'], cleric: ['female', 'neat white hair in a bun'], druid: ['male', 'a long ash-grey beard'], fighter: ['male', 'a short russet beard and a scarred nose'],
    monk: ['female', 'bright calm eyes'], paladin: ['female', 'golden braids'], ranger: ['male', 'a short dark beard'], rogue: ['female', 'slicked black hair'], wizard: ['male', 'a wild white beard and small round spectacles'],
  },
};
for (const [species, classes] of Object.entries(OTHER_SEX)) {
  for (const [cls, [sex, look]] of Object.entries(classes)) {
    add(`portrait-${species}-${cls}-${sex}`, 'image', '1:1', `A ${sex} ${species} ${cls} with ${look}, ${CLASS_LOOK[cls]}. Clearly ${sex}. ${SPECIES_LOOK[species]} ${NO_FRAME} ${PORTRAIT}`);
  }
}

// --- Barrow of the Two Brothers: our own paintings, from these descriptions only
add('wall-earth', 'tile', '1:1', `A steep bank of dark peaty earth and coarse grass with embedded stones, at night. ${TEXTURE}`, { gain: 0.7, standIn: 'wall-warren' });
add('floor-grass', 'tile', '1:1', `Top-down view of rough moorland ground, trampled dark grass and bare soil with small stones, at night. ${TEXTURE}`, { gain: 0.7, standIn: 'floor-warren' });
add('ceiling-night', 'tile', '1:1', `View straight up at a dark, overcast night sky with faint clouds and a few dim stars. ${TEXTURE}`, { standIn: 'ceiling' });
add('throne-ethelred', 'face', '1:1', `A skeleton in rusted royal armor slumped on a tall stone throne with a carved fleeing stag above it, the bony head bare and waiting for a crown, in a shallow niche in a limestone crypt wall, straight-on view, the wall fills the frame edge to edge. ${PAINT} No text, no border.`, { standIn: 'alcove' });
add('throne-olaf', 'face', '1:1', `A skeleton in battered war gear sitting upright on a tall stone throne with a carved sword above it, the bony head bare and waiting for a crown, in a shallow niche in a limestone crypt wall, straight-on view, the wall fills the frame edge to edge. ${PAINT} No text, no border.`, { standIn: 'alcove' });
add('tomb', 'sprite', '1:1', `${SOLO} A closed medieval stone tomb chest with the carved effigy of a lying warrior on its lid, front three-quarter view from slightly above. ${CUTOUT}`, { standIn: 'altar' });
add('rubble', 'sprite', '1:1', `${SOLO} A heap of fallen dark rocks and packed earth, front view. ${CUTOUT}`, { standIn: 'altar' });
add('corpse-slab', 'sprite', '1:1', `${SOLO} The legs and one arm of a dead young man in plain traveller's clothes, sticking out from under a broken stone slab, seen from slightly above, only a little blood. ${CUTOUT}`, { standIn: 'skeleton' });
add('salt-line', 'sprite', '1:1', `Top-down view of a thick, rough band of coarse white salt poured straight across the middle of the frame from the left edge to the right edge, with scattered white grains along it. Only the salt. ${CUTOUT}`, { noTrim: true, neutral: true, standIn: 'plate' });
add('ghoul', 'sprite', '3:4', `A gaunt, hunched ghoul with grey-white leathery skin stretched over its bones, long black claws, a lolling tongue and pointed teeth, in rotted burial wrappings. ${CREATURE}`);
attackPose('ghoul', '3:4', 'The ghoul springs at the viewer with both clawed hands reaching out and its jaws gaping wide to bite. The whole body down to the feet fits in the frame with a wide empty margin on every side.');
add('icon-crown', 'sprite', '1:1', `An old royal crown of heavy dark gold with a band and tall pointed tips, set with a few dull red stones, seen from the front and slightly above. ${ACTION}`, { size: 128 });
add('title-barrow', 'image', '16:9', `${PAINT} A wide view of a grassy burial mound at night with a freshly dug stone-lined entrance, a heap of spoil and a spade beside it, and a second, smaller mound with a blocked entrance behind it, under a dark cloudy sky. No text, no border.`, { crop: 0.035, standIn: 'title' });

// --- screens and interface
add('title', 'image', '16:9', `${PAINT} A wide view of an old stone village well at night, its stones cracked, sickly green light glowing up from deep within, thorny brambles around it, a frightened village in the distance under a dark sky, with a coiled rope hanging down into the well. Plenty of dark empty sky in the upper part. No text, no border.`);
add('panel', 'tile', '1:1', `Dark weathered bronze-and-leather surface for a fantasy game interface panel, subtle scratches and tooling, low contrast, very dark. ${TEXTURE}`);

export default art;
