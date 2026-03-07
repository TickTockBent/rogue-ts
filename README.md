# rogue-ts

A faithful TypeScript port of **Rogue 5.4.4**, the 1980 dungeon crawler that started the roguelike genre.

```
                       __________
                      /          \
                     /    REST    \
                    /      IN      \
                   /     PEACE      \
                  /                  \
                  |    adventurer    |
                  |     142 Au      |
                  |   killed by a   |
                  |    hobgoblin    |
                  |   on level 3    |
                  |                  |
                 *|     *     *      |*
         ________)|//\//\///\//\//\//|(________
```

## What is this?

Rogue is the original dungeon-crawling game. You descend through procedurally generated levels of the Dungeons of Doom, fighting monsters, collecting treasure, and searching for the Amulet of Yendor. Every run is different. When you die, you stay dead. It invented the genre that bears its name.

This project is a line-by-line port of the [original C source code](https://github.com/Davidslv/rogue) (Rogue 5.4.4) into TypeScript. It preserves the original game mechanics, formulas, data tables, and behavior — down to the RNG algorithm and the exact damage calculation for a rattlesnake bite.

## Why?

The original Rogue is tightly coupled to Unix curses and terminal I/O. This port separates the game engine from its display layer, exposing a clean `CursesBackend` interface. You provide the rendering; the engine provides the dungeon.

This means Rogue can now run in a browser, in Electron, in a TUI framework, on a canvas, or anywhere else you can draw characters on a grid and read keystrokes.

## Architecture

```
┌─────────────────────────────────┐
│         Your Frontend           │
│  (terminal, browser, canvas)    │
└──────────┬──────────────────────┘
           │ implements CursesBackend
┌──────────▼──────────────────────┐
│         rogue-ts engine         │
│                                 │
│  30 source files, ~8000 lines   │
│  Zero runtime dependencies      │
│  Pure ESM, fully async          │
└─────────────────────────────────┘
```

**30 source files** mirror the original C source structure:

| File | Purpose |
|------|---------|
| `main.ts` | Game loop, public API (`startRogue`, `resumeRogue`) |
| `globals.ts` | All game state, constants, and 16 data tables |
| `command.ts` | Keyboard input dispatcher (40+ commands) |
| `rooms.ts` | Room generation and room management |
| `passages.ts` | Corridor generation between rooms |
| `new_level.ts` | Level generation orchestrator |
| `move.ts` | Hero movement and trap effects |
| `fight.ts` | Combat system with 8 monster special attacks |
| `chase.ts` | Monster AI and pathfinding |
| `monsters.ts` | Monster creation, wanderers, Medusa gaze |
| `pack.ts` | Inventory management |
| `things.ts` | Item creation and naming |
| `potions.ts` | 14 potion effects |
| `scrolls.ts` | 18 scroll effects |
| `sticks.ts` | 14 wand/staff effects with bolt bouncing |
| `rings.ts` | 14 ring types |
| `weapons.ts` | Weapon system with thrown missiles |
| `armor.ts` | Armor equip/remove |
| `daemons.ts` | Timed effects (healing, hunger, wandering monsters) |
| `daemon.ts` | Daemon/fuse scheduling system |
| `save.ts` | JSON-based save/restore |
| `rip.ts` | Death, scoring, and victory |
| `init.ts` | Player creation and item name generation |
| `misc.ts` | Visibility, `look()`, field-of-view |
| `io.ts` | Message system and input helpers |
| `list.ts` | Linked list operations |
| `util.ts` | RNG, dice rolling, utility functions |
| `types.ts` | Core data structures |
| `curses.ts` | `CursesBackend` interface definition |
| `index.ts` | Public API exports |

## Usage

```typescript
import { startRogue } from "@ticktockbent/rogue-ts";
import type { CursesBackend } from "@ticktockbent/rogue-ts";

// Implement the display interface
const backend: CursesBackend = {
  getch: async () => { /* return keypress */ },
  mvaddch: (y, x, ch) => { /* draw character at position */ },
  mvaddstr: (y, x, str) => { /* draw string at position */ },
  move: (y, x) => { /* move cursor */ },
  refresh: () => { /* flush display */ },
  clear: () => { /* clear screen */ },
  // ... see CursesBackend interface for full API
};

// Start the game
const result = await startRogue(backend, {
  name: "Rodney",
  seed: 42,          // optional: deterministic RNG seed
  tombstone: true,   // optional: show ASCII tombstone on death
});

console.log(result);
// { outcome: "death", gold: 142, level: 3, killer: "hobgoblin" }
// { outcome: "victory", gold: 5832, level: 1 }
// { outcome: "quit", gold: 0, level: 1 }
// { outcome: "save", gold: 200, level: 5 }
```

### Save and Restore

```typescript
import { startRogue, resumeRogue } from "@ticktockbent/rogue-ts";

// Game saves return the save data in the result
const result = await startRogue(backend, { name: "Rodney" });
if (result.outcome === "save") {
  const saveData = result.saveData; // JSON string
  // Store it however you like (localStorage, file, database)

  // Later, resume:
  const resumed = await resumeRogue(backend, saveData);
}
```

## Building

```bash
npm install
npm run build        # compile to dist/
npm run typecheck    # type-check without emitting
npx tsx test/smoke.ts  # run 153 smoke tests
```

Requires Node.js 18+ and TypeScript 5.x. Zero runtime dependencies.

## How faithful is this port?

Very. A systematic audit compared every function in all 30 source files against the original Rogue 5.4.4 C source. This produced [37 issues](https://github.com/TickTockBent/rogue-ts/issues?q=is%3Aissue+is%3Aclosed+label%3Ac-source-diff) tracking every discrepancy, all of which have been resolved. Specific areas of fidelity:

- **RNG**: Same linear congruential generator as the original (`seed * 11109 + 13849`, high-bit extraction)
- **Combat**: Exact `swing()` formula (`need = 20 - atLvl - opArm`), armor class from equipped items, protection ring bonuses, sleeping monster +4 hit bonus, launcher weapon bonuses
- **Monster AI**: 8 special attack types (Aquator rust, Vampire drain, Nymph steal, etc.), Flytrap stationary behavior, greedy monsters chase gold, no diagonal movement in passages
- **Items**: All 14 potions, 18 scrolls, 14 wands/staffs, 14 rings with correct formulas. Bolt spells bounce off walls. Scare monster scrolls crumble when picked up.
- **Dungeon generation**: Room placement, passage digging, trap placement, monster and item spawning rates matching the original
- **Hunger system**: Four-stage progression (hungry, weak, faint, starve) with ring food drain
- **Visibility**: Dark room lamp radius, hallucination display, see-invisible mechanics
- **Daemon/fuse system**: BEFORE and AFTER passes per turn, haste double-turns for both player and monsters

## What's different from the original?

- **Language**: TypeScript instead of C
- **I/O**: Async — `getch()` returns a `Promise`, allowing non-blocking frontends
- **Display**: Abstracted behind `CursesBackend` instead of hardcoded curses calls
- **Data structures**: Linked lists preserved from the original (not replaced with arrays)
- **State**: All mutable state lives in a single `state` object, making save/restore straightforward
- **Strings**: Internal characters are JavaScript strings, converted to char codes only at the curses boundary
- **Save format**: JSON instead of binary memory dump

## The Amulet of Yendor

Somewhere below level 26, the Amulet of Yendor waits. Find it, carry it back to the surface, and you win. Or die trying — that's more likely. Good luck.

## License

[MIT](LICENSE)

The original Rogue was created by Michael Toy, Glenn Wichman, and Ken Arnold at UC Berkeley, circa 1980. This is a clean-room port from the publicly available source code.
