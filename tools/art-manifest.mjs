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

// --- screens and interface
add('title', 'image', '16:9', `${PAINT} A wide view of an old stone village well at night, its stones cracked, sickly green light glowing up from deep within, thorny brambles around it, a frightened village in the distance under a dark sky, with a coiled rope hanging down into the well. Plenty of dark empty sky in the upper part. No text, no border.`);
add('panel', 'tile', '1:1', `Dark weathered bronze-and-leather surface for a fantasy game interface panel, subtle scratches and tooling, low contrast, very dark. ${TEXTURE}`);

export default art;
