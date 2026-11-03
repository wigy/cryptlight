# Engine guide

The engine runs a party through grid levels in real time and draws it. It knows nothing about hit points or
dice: a **ruleset** answers those questions, and a **module** supplies the world. `test/engine.test.js` runs the
whole engine against a 20-line stub ruleset, which is the shortest working example of the contract.

## Writing a module

A module is a JSON file (see `modules/thornwick/module.json`).

```json
{
  "id": "my-module", "name": "My Module", "ruleset": "srd5", "titleImage": "title",
  "start": { "level": "first", "x": 2, "y": 2, "dir": 0 },
  "intro": ["Shown in the log at the start."],
  "items": { "my-key": { "name": "Brass Key", "kind": "gear", "icon": "key" } },
  "levels": {
    "first": {
      "name": "First Level",
      "textures": { "wall": "wall-warren", "floor": "floor-warren", "ceiling": "ceiling" },
      "grid": ["#####", "#.g.#", "#...#", "#.D.#", "#####"],
      "legend": {
        "g": { "type": "monster", "proto": "goblin-warrior" },
        "D": { "type": "door", "style": "wood", "lock": { "key": "my-key", "dc": 15 } }
      }
    }
  }
}
```

`#` is wall, `.` is floor and any other character is looked up in `legend`, giving one object or a list. Cells are
10 feet across, and `dir` is 0-3 for N E S W.

| `type` | Fields |
|---|---|
| `monster` | `proto`, `behaviour` (`guard`, `sleep`), `name`, `onDeath` |
| `item` | `proto`, `qty` |
| `door` | `style` (`wood`, `iron`, `portcullis`), `id`, `lock`, `noHandle`, `secret`, `detectDc`, `startOpen` |
| `wall` | `kind` (`lever`, `plaque`, `alcove`), `text`, `onUse`, `once`, and for alcoves `wants`, `onWanted`, `onPlace`. It faces the first open side unless `face` is set. |
| `stairs` | `to`, `direction` (`up`, `down`), `text` |
| `plate`, `zone` | `onEnter`, `once`, `hidden`, `detectDc` |
| `pit` | `onEnter`, `to`, `hidden`, `detectDc` |
| `feature` | `sprite`, `blocks`, `items`, `lock`, `text`, `emptyText`, `onUse` |

Scripts (`onUse`, `onEnter`, `onDeath` and so on) are lists of actions:
`message`, `sound`, `openDoor`, `closeDoor`, `toggleDoor`, `setFlag`, `if`, `ifAll`, `spawn`, `teleport`,
`giveItem`, `placeItem`, `disarm`, `win`, and `rule`, which calls the ruleset by name.

In the srd5 ruleset, `rule` provides `trap` (`dice`, `save`, `dc`, `half`, `type`, `all`, `condition`, `rounds`),
`fall` (`dice`) and `awardXp` (`amount`). Monster and item ids are those in `data/srd/`.

## Writing a ruleset

Pass an object with these to `new Game(module, ruleset)`. `rules/srd5/ruleset.js` is the full example.

| Member | Purpose |
|---|---|
| `id`, `timeScale`, `slots` | Identity, game seconds per real second, paper-doll slots |
| `tick(game, dt)` | Advance the rules, including monster AI |
| `createMonster(game, proto)`, `monsterInfo(m)`, `wake(game, m)` | Monsters: create, how to draw, alert |
| `itemInfo(item)`, `canEquip(member, item, slot)`, `consume(game, member, item)` | Items |
| `memberStatus(game, m)`, `memberSheet(game, m)`, `memberActions(game, m, menu)`, `doAction(game, m, id)` | What the HUD shows and does |
| `light(game)` | `{ radius, mono, bright }`, which drives the renderer's lighting |
| `tryUnlock(game, lock, held)`, `noticeHidden(game, dc)`, `rule(game, name, args)` | World interactions |
| `defaultParty()`, `creationSteps()`, `createMember(choices)` | Party creation |
| `restOptions`, `rest`, `canRest`, `carriedWeight`, `throwHeld`, `attribution`, `summary` | Used by the HUD and end screen |
| `memberQuickActions(game, m)` | Optional. The icon row on a member's action box: `memberActions` entries plus `item` or `glyph` for the picture, `kind` to show the label, `empty` for an unassigned slot |
| `memberAbilities(game, m)`, `toggleQuick(game, m, id)` | Optional. The inventory's Skills & Spells list (`kind` is `skill` or `spell`) and picking two for quick access |
| `onNewGame`, `moveBlocked`, `partyStepSeconds`, `onPartyWillMove`, `markUnaware` | Optional hooks |

All game state must stay plain JSON, because saving serializes it directly. Use `game.rng`, never `Math.random`, so runs stay reproducible.
`main.js` currently wires in Thornwick and srd5 by name; change `MODULE` and the ruleset there to run something else.
