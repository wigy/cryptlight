# Plan: Barrow of the Two Brothers

Status: built. The map grids below were starting sketches, so `modules/barrow/module.json` is the final word.

Adapt the one-page dungeon as a second module, `modules/barrow/`, playable from vacation next to The Well at Thornwick.

## Source

*Barrow of the Two Brothers* by L. Shaffrey (Copper Pieces), an entry in the 2021 One Page Dungeon Contest, for a Level 1-2 party.

- Adventure: https://copperpieces.itch.io/barrow-of-the-two-brothers
- Author's notes: https://copperpieces.blogspot.com/2021/07/barrow-of-two-brothers-one-page-dungeon.html
- Licence: CC BY-SA 3.0, http://creativecommons.org/licenses/by-sa/3.0, printed on the PDF. The itch page itself states no licence.

Author's answers in the comments, which the page alone doesn't make clear:

- The lid of Olaf's tomb **can't be opened from inside**. Players are meant to dig in from outside through entrance 11, and the magic sword is the reward for working that out.
- The object between rooms 6 and 7 is a **door**.

The map gives no scale, so the grid below is an interpretation.

## The adventure

Anders went looking for treasure in a barrow and died in a trap; his parents offer 50gp to whoever finds him. Brothers Ethelred and Olaf killed each other over their dying mother's crown and were buried together. Their spirits are still there.

| Area | Contents |
|---|---|
| 1 | Excavated entrance, salt on the stairs |
| 2 | 3 skeletons. Anders's corpse under a slab, with his diary (The Tale of the Two Brothers) |
| 3 | Trap: a falling slab, 2d8, DC 12 Dex for half, releases 3 skeletons |
| 4 | Ethelred's tomb inside a salt circle. Silver dagger (20gp). Dagger and lid are stuck until the circle is broken. Shaft inside |
| 5, 8 | 30-foot shafts between the upper and lower levels |
| 6 | Tomb of the Traitors: 3 skeletons and 2 ghouls, each with a silver torc (10gp). Anyone who has committed treachery has Disadvantage on checks and attacks |
| Passage | Door, then a thick salt line |
| 7 | Both brothers' skeletons on thrones, gold crown (300gp) between them, 4 skeleton guards awaiting orders |
| 9 | Olaf's tomb, as 4, holding *Wrath* |
| 10 | Two trapped slabs, each releasing 3 skeletons |
| 11 | Blocked entrance, 1d6 hours to clear, salt on the stairs |

**The crown choice.** Crown one brother and his spirit fades; the other attacks as a Shadow and orders the skeletons to attack. Crown neither, or try to steal the crown, and both attack as Shadows. Spirits and the crown can't cross unbroken salt.

**Wrath.** +1 longsword, requires attunement. Once per day, gain Advantage on the next attack against a target, but you must keep attacking it until it or you reach 0 HP.

Our rules: "once per day" means once per Long Rest. Leaving a dungeon already applies a Long Rest automatically, so going on vacation recharges it. So does a Long Rest taken inside the dungeon.

## How it plays in the engine

### Levels

Three levels. The grids are starting sketches, to be adjusted in play.

`hillside` is new, and exists so that entrance 11 can really be dug from outside as the author intended. The party starts at `S`.

```
################
#X.w.S.1...R.2.#     X exit, w win zone, 1 stairs to area 1, R rubble, 2 stairs to area 11
################
```

`upper` holds both barrows, with solid rock between them.

```
######<###########<######     stairs up to the hillside
######~###########~######     salt ward
######.###########.######
#.......................#  <- sketch only: split in two by rock at the centre
#..a.s.P.t.t.#.t.t.P.t..#     a Anders, s skeletons, P plinth, t trapped slab
#.......................#
####..o..#########..o..##     o salt circle
#####.T.###########.T.###     T tomb, with the shaft inside
#########################
```

`lower`

```
###########E#####O###########     E and O the thrones, alcoves in the north wall
###########.......###########
###########...c...###########     c crown
###########s.s.s.s###########     4 guards, dormant
##############z##############     z zone: leaving uncrowned
##############~##############     salt ward
##############D##############     door
##########.........##########     room 6
##########.t.t.t.t.##########
#5...........................8#   shafts to the tombs
##############################
```

### Scripted rooms

| Area | Implementation | Engine work |
|---|---|---|
| Hook, ending | `win` zone on the hillside next to the exit, when Anders was found. The text depends on how the crown ended. Without Anders, the exit is a plain `leave` | Reward rule (gap 6) |
| 2 | 3 `skeleton`. `feature` corpse with the diary and `onUse` setting `anders-found`, and the Tale shown in the log | None |
| 3, 10 | `plate`, `hidden`, `detectDc`, `rule trap` with 2d8, Dex, DC 12, half, then 3 `spawn` | None |
| 4, 9 | Salt circle `feature` that sets a flag when scuffed. Tomb `feature` checks the flag with `if`, then gives up the item and takes the party down by `teleport`. From below, the lid of 9 stays shut until the flag is set, as the author ruled | None |
| 5, 8 | `stairs` from the lower level to beside the tombs. Stairs at 8 are refused until 9 is opened from above | `if` on stairs, or a zone plus `teleport` |
| 6 | 3 `skeleton` and 1 `ghoul`, reduced from the source (see Balance), `onDeath` `giveItem` for each torc, and `rule dread` from a zone | Gap 5 |
| 7 | Crown on the floor, thrones as alcoves that want it, `onWanted` runs that brother's outcome | Gaps 1, 2, 3 |
| 11 | Rubble `feature`, `onUse` passes 1d6 hours and removes itself | Gap 4 |

### The crown logic

Picking up the crown can't count as stealing, because it has to be picked up to be placed on a throne. So stealing means *trying to leave with it*:

- **Crown a brother:** award XP, his spirit fades, the other brother spawns as a Shadow, guards wake. The crown then stays on the throne.
- **Step on zone `z` with nobody crowned, or attack a guard:** both brothers spawn as Shadows, guards wake. This covers both "crown neither" and "steal the crown".
- **Salt line:** the Shadows can't follow past it, though skeletons can. Retreating is a real tactic, as in the source.
- **Taking the crown out:** the salt stops it until the party scuffs the line, and again at the stairs. That's the greedy ending: 300gp, the harder fight, and no brother at rest.

## Engine and rules gaps

Each is small and general, not Barrow-specific. All must stay plain JSON for saves, and be documented in `docs/ENGINE.md`.

1. **Wards** (`engine/world.js`). New `ward` object with `holdsTag`, `holdsItem` and a broken state, using a floor decal. `canEnter` refuses tagged entities, which covers all monster movement. `step` refuses a party carrying the item, through a new `ruleset.partyCarries(game, proto)`, since only the ruleset knows about packs. Using it breaks it.
2. **Monster tags and dormant guards.** `tag` on monsters and in `spawn` opts. A `dormant` behaviour that skips `noticeCheck` and isn't woken by a neighbour's alert. A `wake` script action by tag. An `onWake` script, so attacking a guard triggers the outcome.
3. **Alcove options** (`engine/render/view3d.js:184`, `useWall`). `art`, so a throne isn't drawn as the font, and `keeps`, so a crown placed there can't be taken back.
4. **`removeObject` action and `rule passTime`** for the rubble.
5. **`rule dread`** in srd5. A timed effect giving Disadvantage on attacks and ability checks, applied to members with the Criminal background (decision 2). `attackModifiers` and `d20` need to honour it.
6. **`rule reward`**: gold into a pack rather than on the floor, as `win` ends play at once.
7. **Per-module credit.** Done: every module has a `license` field, and its adventure card links to the License and Attributions screen. The Barrow only needs its own entry, with the BY-SA text as its `file`.
8. **Test helpers.** `loadModule()` in `test/helpers.mjs` is hard-coded to Thornwick, so it takes an id. The reference checks in `test/srd-data.test.js` loop over every listed module.
9. **Wrath's power** in srd5. Attunement isn't modelled, so it works for whoever has it in hand.
   - A new member action marks the focused target, and gives Advantage on the next attack against it.
   - While the mark lasts, `targetsFor` offers that member only the marked target, so they can't attack anything else.
   - The mark ends when the target or the member reaches 0 HP, or the party leaves the level, so nobody gets stuck unable to attack.
   - The use is recorded on the sword itself, so passing it to a friend doesn't give a second one. `longRestMember` clears it on everything that member carries, which covers both the Rest menu and `onLeaveAdventure`.

Already sufficient: `spawn` with `name`, `plate`, `zone`, `if`, `ifAll`, `onDeath`, `awardXp`, `unique`, `stays`, and multiple modules. Sprites already map `ghoul` to `zombie` and `shadow` to `shade`.

## Balance

XP from `data/srd/`: skeleton 50, ghoul 200, Shadow 100. High budget for four characters: 400 at level 1, 800 at level 2. Level 2 needs about 300 XP each.

| Encounter | As written | XP | Fits |
|---|---|---|---|
| Room 2 | 3 skeletons | 150 | Yes |
| Room 3 | 3 skeletons, plus trap | 150 | Yes, 300 if it's joined to room 2 |
| Room 6 | 3 skeletons, 2 ghouls | 550 | **Over level 1** |
| Room 6, reduced | 3 skeletons, 1 ghoul | 350 | Yes |
| Room 7, one brother | 4 skeletons, 1 Shadow | 300 | Yes |
| Room 7, both | 4 skeletons, 2 Shadows | 400 | At the level 1 limit |
| Room 10 | 2 × 3 skeletons, plus traps | 300 | Yes |

A party arriving at room 6 has only about 75 XP each, so it's probably still level 1. Decided: reduce room 6 to 3 skeletons and 1 ghoul (350 XP), with one torc fewer, and keep `recommendedLevels` at 1-2. The fairness check in `test/barrow.test.js` showed that awake they still killed the party in most runs (the bot won 3 of 40), so they're also asleep in their coffins until the party comes close (15 of 40).

Monster rider effects aren't implemented for monsters in general: no code applies the Shadow's Strength drain. Its absence makes Shadows easier than the SRD's. Leave that out of this work and note it in the README.

## Items

All ids unique across modules.

| Id | Item | Flags |
|---|---|---|
| `anders-diary` | Diary with the Tale | `stays` |
| `two-brothers-crown` | Gold crown, 300gp | `unique` |
| `ethelred-dagger` | Silver dagger, 20gp | `unique` |
| `traitor-torc` | Silver torc, 10gp | |
| `wrath` | `base: longsword`, `bonus: 1`, with its power (gap 9) | `unique` |

## Art

Paid Gemini images through `tools/art-manifest.mjs`, about 8-10. Like all our generated art, they're committed to the repo in `assets/raw` and `assets/game`. The source's PDF and map aren't.

- Must have: title, throne alcove, tomb sprite, salt-line decal, corpse under slab, rubble.
- Hillside: wall, floor and sky tiles.
- `ghoul` and `ghoul-attack`, which the ghast uses too.

This is always our own adaptation with our own art. The author's images are never used, including as reference images for generating art. The tag "No generative AI was used" on the itch page describes the author's original and isn't a licence condition. Our License and Attributions screen already says our images were generated.

## Licensing

- `modules/barrow/` stays CC BY-SA 3.0, or a compatible later version, inside an MIT project. Add a `modules/barrow/LICENSE` notice and a line in the README's credits.
- Credit the title, L. Shaffrey and the source URL, and state that it's adapted, listing the changes: the hillside level, the reduced room 6, the crown staying on the throne, and the dread rule.
- The grid counts as an adaptation of the map, so it's covered too. The art is our own and stays under the project's licence.

## Order of work

1. **Engine gaps 1-6 and 9**, each with a unit test in `test/engine.test.js` or `test/rules.test.js`. Thornwick must stay untouched and passing.
2. **Module without new art**, using stand-ins, listed in `modules/index.json`.
3. **Scenario tests** in a new `test/barrow.test.js`:
   - each crown ending, including attacking a guard
   - Shadows stopped by unbroken salt, and able to cross once it's broken
   - crown stopped at each salt line
   - lid of 9 shut from below, open from above
   - Anders's reward paid only once
   - `unique` items gone on a replay, and `stays` items left behind
4. **Bot playthrough** to a win, with the fairness check, then tune the numbers.
5. **Credits and licence** (gap 7).
6. **Art**: generate, process, review each image.
7. **Browser check**: extend `test/browser/ui-flow.mjs` and make sure the vacation screen fits two adventures. Existing steps select Thornwick by id, so they should keep working.
8. **Docs**: `docs/ENGINE.md`, the README's list, and remove the entry from `TODO.md`.

## Decisions made

1. **Reaching Olaf's barrow:** the `hillside` level, so the party digs in from outside as the author intended.
2. **Who counts as treacherous:** the Criminal background only, with a log line saying why.

## Known edge cases

- A thrown crown could cross a salt line, as wards only check walking. Either refuse the throw through `throwHeld` or accept it.
- Passing the time at the rubble doesn't advance monsters' behaviour in any special way; it only moves the clock.
- Wrath left on the floor doesn't recharge until someone carrying it takes a Long Rest.
- Replays: the crown is `unique`, so a party that carried it out replays without it. The choice in room 7 then needs its own text, and thrones with nothing to place.
