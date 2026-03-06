# rogue-ts — Specification

TypeScript port of Rogue 5.4.4 with a pluggable curses backend.

## Overview

`rogue-ts` is a faithful, mechanical translation of the original Rogue 5.4.4 C source code into TypeScript. It is **not** a reimagining — the goal is to preserve the exact game logic, data tables, combat formulas, dungeon generation, and item mechanics of the original.

The key architectural decision: Rogue communicates with the outside world exclusively through curses function calls. We define a `CursesBackend` interface that abstracts those calls. The game imports and calls the interface; consumers implement it for their environment (browser grid renderer, terminal emulator, canvas, etc.).

This is the same pattern as a Z-Machine interpreter that defines an `IOAdapter` interface — the engine runs the game, the adapter handles display and input.

## Package Structure

```
rogue-ts/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public API: startRogue(), CursesBackend, types
│   ├── curses.ts             # CursesBackend interface + curses constants
│   ├── types.ts              # Game data structures (Thing, Room, Stats, etc.)
│   ├── globals.ts            # Global game state (replaces extern.c/extern.h)
│   ├── main.ts               # Entry point, init sequence, playit() loop
│   ├── command.ts            # command() — the main input dispatcher
│   ├── io.ts                 # msg(), readchar(), status(), endmsg()
│   ├── rooms.ts              # do_rooms(), draw_room(), enter_room(), etc.
│   ├── passages.ts           # do_passages(), passnum(), etc.
│   ├── new_level.ts          # new_level() — level generation
│   ├── move.ts               # do_move(), do_run() — player movement
│   ├── chase.ts              # chase(), do_chase() — monster AI
│   ├── fight.ts              # attack(), fight(), hit_monster(), roll_em()
│   ├── monsters.ts           # monster table, new_monster(), wanderer()
│   ├── things.ts             # new_thing(), inv_name(), object creation
│   ├── pack.ts               # add_pack(), inventory(), get_item()
│   ├── weapons.ts            # wield(), missile(), do_motion()
│   ├── armor.ts              # wear(), take_off(), rust_armor()
│   ├── potions.ts            # quaff(), do_pot()
│   ├── scrolls.ts            # read_scroll()
│   ├── rings.ts              # ring_on(), ring_off(), ring_eat()
│   ├── sticks.ts             # do_zap(), fix_stick(), drain()
│   ├── daemon.ts             # start_daemon(), do_daemons(), fuse(), etc.
│   ├── daemons.ts            # runners(), doctor(), stomach(), swander()
│   ├── misc.ts               # look(), find_floor(), cansee(), etc.
│   ├── options.ts            # option(), parse_opts()
│   ├── save.ts               # save_game(), restore() — via CursesBackend
│   ├── rip.ts                # death(), total_winner(), score()
│   ├── list.ts               # _attach(), _detach(), _free_list()
│   ├── init.ts               # init_player(), init_probs(), init_names(), etc.
│   └── util.ts               # rnd(), roll(), sign(), spread()
└── dist/                     # Built output
```

File mapping is 1:1 with the original C source. Each `.c` file becomes a `.ts` module.

## CursesBackend Interface

This is the contract. The game calls these methods; consumers implement them.

```typescript
// ─── Constants ──────────────────────────────────────

/** Curses attributes (bitmask, matches PDCurses values) */
export const A_NORMAL    = 0x00000000;
export const A_STANDOUT  = 0x00010000;
export const A_UNDERLINE = 0x00020000;
export const A_REVERSE   = 0x00040000;
export const A_BLINK     = 0x00080000;
export const A_BOLD      = 0x00100000;
export const A_CHARTEXT  = 0x000000ff;
export const A_COLOR     = 0x0000ff00;

/** Curses color constants */
export const COLOR_BLACK   = 0;
export const COLOR_RED     = 1;
export const COLOR_GREEN   = 2;
export const COLOR_YELLOW  = 3;
export const COLOR_BLUE    = 4;
export const COLOR_MAGENTA = 5;
export const COLOR_CYAN    = 6;
export const COLOR_WHITE   = 7;

/** Special key constants (returned by getch) */
export const KEY_UP    = 0x103;
export const KEY_DOWN  = 0x102;
export const KEY_LEFT  = 0x104;
export const KEY_RIGHT = 0x105;
export const KEY_HOME  = 0x106;
export const KEY_END   = 0x168;
export const KEY_F1    = 0x109;
// ... (full table in implementation)

export const ERR = -1;
export const OK  = 0;

// ─── Window Handle ──────────────────────────────────

/**
 * Opaque window handle. The backend creates and manages these.
 * The game never inspects the internals — it only passes them
 * back to the backend's w* functions.
 */
export interface CursesWindow {
  /** Unique id for the backend to track this window */
  readonly id: number;
}

// ─── CursesBackend Interface ────────────────────────

export interface CursesBackend {
  // ── Screen lifecycle ──
  /** Initialize curses mode. Returns stdscr. Sets LINES and COLS. */
  initscr(): CursesWindow;
  /** Exit curses mode. */
  endwin(): void;
  /** True if endwin() has been called without a subsequent refresh. */
  isendwin(): boolean;

  // ── Screen dimensions (set by initscr, read by the game) ──
  readonly LINES: number;  // Must be >= 24
  readonly COLS: number;   // Must be >= 80

  // ── stdscr operations (implicit window = stdscr) ──
  /** Move cursor to (y, x) on stdscr. */
  move(y: number, x: number): void;
  /** Add character at current cursor position on stdscr. */
  addch(ch: number): void;
  /** Add string at current cursor position on stdscr. */
  addstr(str: string): void;
  /** Move to (y,x) then add character. */
  mvaddch(y: number, x: number, ch: number): void;
  /** Move to (y,x) then add string. */
  mvaddstr(y: number, x: number, str: string): void;
  /** Printf-style output at current position. */
  printw(fmt: string, ...args: unknown[]): void;
  /** Move then printf. */
  mvprintw(y: number, x: number, fmt: string, ...args: unknown[]): void;
  /** Return the character at current cursor position on stdscr. */
  inch(): number;
  /** Move to (y,x) then return character. */
  mvinch(y: number, x: number): number;
  /** Clear stdscr. */
  clear(): void;
  /** Clear from cursor to end of line on stdscr. */
  clrtoeol(): void;
  /** Copy stdscr to physical screen. */
  refresh(): void;
  /** Enable standout (reverse video) mode on stdscr. */
  standout(): void;
  /** Disable standout mode on stdscr. */
  standend(): void;
  /** Get cursor position on stdscr: returns [y, x]. */
  getyx(): [number, number];

  // ── Window operations ──
  /** Create a new window. */
  newwin(nlines: number, ncols: number, begy: number, begx: number): CursesWindow;
  /** Delete a window. */
  delwin(win: CursesWindow): void;
  /** Move cursor in window. */
  wmove(win: CursesWindow, y: number, x: number): void;
  /** Add character in window. */
  waddch(win: CursesWindow, ch: number): void;
  /** Add character at (y,x) in window. */
  mvwaddch(win: CursesWindow, y: number, x: number, ch: number): void;
  /** Add string in window. */
  waddstr(win: CursesWindow, str: string): void;
  /** Add string at (y,x) in window. */
  mvwaddstr(win: CursesWindow, y: number, x: number, str: string): void;
  /** Printf in window. */
  wprintw(win: CursesWindow, fmt: string, ...args: unknown[]): void;
  /** Copy window to physical screen. */
  wrefresh(win: CursesWindow): void;
  /** Clear from cursor to end of line in window. */
  wclrtoeol(win: CursesWindow): void;
  /** Mark window as needing full redraw on next refresh. */
  touchwin(win: CursesWindow): void;
  /** Mark window as needing full clear on next refresh. */
  clearok(win: CursesWindow, flag: boolean): void;
  /** Overlay src onto dst (copy non-blank chars). */
  overwrite(src: CursesWindow, dst: CursesWindow): void;

  // ── Input ──
  /**
   * Read a single keypress. This is the critical async bridge.
   * Returns a character code (0-255) or a KEY_* constant.
   *
   * IMPORTANT: This MUST be async (return Promise<number>).
   * The game's main loop awaits this. The consumer resolves
   * the promise when the user presses a key.
   */
  getch(): Promise<number>;

  // ── Terminal modes ──
  /** Disable line buffering. */
  cbreak(): void;
  /** Opposite of cbreak. */
  nocbreak(): void;
  /** Disable echo of typed characters. */
  noecho(): void;
  /** Enable echo. */
  echo(): void;
  /** Enable raw mode. */
  raw(): void;
  /** Disable raw mode. */
  noraw(): void;
  /** Enable/disable keypad translation (arrow keys etc). */
  keypad(win: CursesWindow, flag: boolean): void;
  /** Set typeahead fd (no-op in browser context). */
  typeahead(fd: number): void;

  // ── Misc ──
  /** Return terminal baud rate (return 19200 for browser). */
  baudrate(): number;
  /** Move physical cursor (low-level, rarely used). */
  mvcur(oldrow: number, oldcol: number, newrow: number, newcol: number): void;
  /** Enable insert/delete line optimization (no-op). */
  idlok(win: CursesWindow, flag: boolean): void;

  // ── Save/Restore (replaces file I/O) ──
  /**
   * Save game state. Replaces fopen/fwrite for save files.
   * Returns true if save succeeded.
   */
  saveGame(data: Uint8Array): Promise<boolean>;
  /**
   * Restore game state. Replaces fopen/fread for save files.
   * Returns the saved data, or null if no save exists.
   */
  restoreGame(): Promise<Uint8Array | null>;
}
```

### Why getch() is `Promise<number>`

The original C code calls `getch()` which blocks the thread until a key is pressed. In a browser/React environment, we can't block. Instead:

1. `getch()` returns a `Promise<number>`
2. The consumer holds a resolver ref (like Z-Machine's `readCharResolverRef`)
3. When the user presses a key, the consumer calls `resolver(keyCode)`
4. The game's `await getch()` resumes

**This means every function in the call chain above `getch()` must be `async`:**

```
main() → playit() → command() → readchar() → md_readchar() → getch()
```

All of these become `async` functions with `await` at the call sites. This is a mechanical transformation — find every call to `readchar()`, `wait_for()`, `get_str()`, etc., and make the caller async with await.

The chain of async functions from the Rogue source:
- `readchar()` — calls `md_readchar()` which calls `getch()`
- `wait_for()` — calls `readchar()` in a loop
- `get_str()` — calls `readchar()` in a loop
- `command()` — calls `readchar()`
- `playit()` — calls `command()` in a loop
- `msg()/endmsg()` — calls `wait_for()` for "--More--" prompts
- Various game functions that call `msg()` or `readchar()` directly

**Important:** The async infection is wider than this core chain. Because `msg()` is async, any function that can transitively call `msg()` must also be async. This includes daemon/fuse callbacks like `stomach()`, `doctor()`, `swander()`, and `runners()`, as well as functions like `hit_monster()`, `fight()`, `quaff()`, `read_scroll()`, `do_zap()`, etc. In practice, nearly every non-trivial game function becomes async. The `DelayedAction.func` type must reflect this (see Daemon/Fuse System section).

### Why printw uses `(fmt, ...args)` not template literals

The original C uses `printf`-style format strings (`%d`, `%s`, `%*d`, etc.). Rather than rewriting every format string in the game to template literals, we keep the printf signature and implement a simple `sprintf()` formatter in the curses backend or as a utility. This minimizes translation drift from the original source.

The game code stays close to the original:
```typescript
// C original:
// printw("Level: %d  Gold: %-5d  Hp: %*d(%*d)", level, purse, ...);
//
// TypeScript port:
await printw("Level: %d  Gold: %-5d  Hp: %*d(%*d)", level, purse, ...);
```

A `sprintf()` utility function is included in `util.ts` to handle C-style format strings.

## Public API

```typescript
// index.ts — the package's public API

export { CursesBackend, CursesWindow } from "./curses";
export {
  A_NORMAL, A_STANDOUT, A_REVERSE, A_BOLD, A_CHARTEXT,
  COLOR_BLACK, COLOR_RED, COLOR_GREEN, COLOR_YELLOW,
  COLOR_BLUE, COLOR_MAGENTA, COLOR_CYAN, COLOR_WHITE,
  KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT,
  ERR, OK,
} from "./curses";

/**
 * Start a game of Rogue.
 *
 * This is the main entry point. It runs the complete game loop
 * asynchronously. The returned promise resolves when the game ends
 * (player dies, wins, or quits).
 *
 * @param backend - Implementation of CursesBackend for display/input
 * @param options - Optional configuration
 */
export async function startRogue(
  backend: CursesBackend,
  options?: RogueOptions,
): Promise<RogueResult> {
  // ... init, playit loop, cleanup
}

export interface RogueOptions {
  /** Player name (default: "Rodney") */
  playerName?: string;
  /** RNG seed for reproducible dungeons (default: Date.now()) */
  seed?: number;
}

export interface RogueResult {
  /** How the game ended */
  outcome: "death" | "quit" | "victory";
  /** Final gold */
  gold: number;
  /** Dungeon level reached */
  level: number;
  /** What killed the player (if death) */
  killer?: string;
}
```

## Translation Rules

These rules ensure the TypeScript port stays faithful to the original C source.

### 1. Data Structures

The C source uses a `union thing` for both monsters and objects (items). In TypeScript, use discriminated types:

```typescript
// C original: union thing { struct { ... } _t; struct { ... } _o; };
// TypeScript:
interface ThingBase {
  next: Thing | null;
  prev: Thing | null;
}

interface Monster extends ThingBase {
  kind: "monster";
  pos: Coord;
  turn: boolean;
  type: string;         // char in C — the monster letter
  disguise: string;
  oldch: string;
  dest: Coord | null;
  flags: number;
  stats: Stats;
  room: Room | null;
  pack: GameObj | null;  // A monster's pack is always a list of items, never other monsters
}

interface GameObj extends ThingBase {
  kind: "object";
  type: number;         // POTION, SCROLL, WEAPON, etc.
  pos: Coord;
  text: string | null;
  launch: number;
  packch: string;
  damage: string;
  hurldmg: string;
  count: number;
  which: number;
  hplus: number;
  dplus: number;
  arm: number;
  flags: number;
  group: number;
  label: string | null;
}

type Thing = Monster | GameObj;
```

### 2. Global State

The original C uses global variables extensively (`extern` declarations in `extern.h`). In TypeScript, collect these into a single `GameState` object passed through the call chain, or use a module-level state object:

```typescript
// globals.ts
export const state = {
  player: null as Thing | null,
  lvlObj: null as Thing | null,
  mlist: null as Thing | null,
  rooms: [] as Room[],
  passages: [] as Room[],
  places: [] as Place[],
  level: 0,
  purse: 0,
  // ... all extern variables from extern.h
};
```

**Important:** The C globals use specific initial values. Preserve them exactly. Check `extern.c` for initializers.

### 3. Linked Lists

The C source uses intrusive linked lists (next/prev pointers inside the `thing` union). Port these directly — do NOT replace with arrays. The game logic depends on list manipulation semantics (insert, detach, iterate while modifying):

```typescript
// list.ts
export function attach(list: { head: Thing | null }, item: Thing): void { ... }
export function detach(list: { head: Thing | null }, item: Thing): void { ... }
export function freeList(list: { head: Thing | null }): void { ... }
```

### 4. The `places` Array

The dungeon map uses `PLACE places[]` indexed by `((x) << 5) + y`. This is a flat array with column-major indexing. Preserve this exact layout:

```typescript
// types.ts
interface Place {
  ch: string;          // p_ch — what's at this position
  flags: number;       // p_flags — F_PASS, F_SEEN, etc.
  monst: Thing | null; // p_monst — monster at this position
}

// globals.ts — 80 * 32 = 2560 entries (x << 5 gives room for y up to 31)
export const places: Place[] = Array.from({ length: 2560 }, () => ({
  ch: " ",
  flags: 0,
  monst: null,
}));

// Access pattern preserved exactly:
export function INDEX(y: number, x: number): Place { return places[(x << 5) + y]; }
export function chat(y: number, x: number): string { return places[(x << 5) + y].ch; }
export function flat(y: number, x: number): number { return places[(x << 5) + y].flags; }
export function moat(y: number, x: number): Thing | null { return places[(x << 5) + y].monst; }
```

### 5. Curses Window Access

The C code accesses `stdscr` and `curscr` directly, and the helper window `hw`. In the port, these are `CursesWindow` handles obtained from the backend:

```typescript
// globals.ts
export let stdscr: CursesWindow;
export let hw: CursesWindow;  // helper window for inventory display etc.

// main.ts
stdscr = backend.initscr();
hw = backend.newwin(backend.LINES, backend.COLS, 0, 0);
```

### 6. Character/Integer Duality

C treats `char` and `int` interchangeably. In the port:
The canonical internal representation is **`string` (single char)**. Convert to char code only at the backend boundary (`addch()`, `inch()`).

- Use `string` for all game-internal character storage: `Place.ch`, `Monster.type`, `Monster.oldch`, `Monster.disguise`, `GameObj.packch`, display constants like `PLAYER = "@"`, `PASSAGE = "#"`, etc.
- Use `number` (char code) only when doing character arithmetic, interfacing with the `CursesBackend` (`addch()` takes `number`, `inch()` returns `number`), or comparing against curses key constants.
- Convert at the boundary: `ch.charCodeAt(0)` when calling `addch()`, `String.fromCharCode(n)` when reading from `inch()`.

This keeps game logic readable (`place.ch === "#"` instead of `place.ch === 35`) and confines char-code conversion to a thin layer at the curses interface.

### 7. The `#define` Macros

Most `#define` constants become `const` values. Macro "functions" become inline functions:

```typescript
// Constants
export const MAXROOMS = 9;
export const NUMLINES = 24;
export const NUMCOLS = 80;
export const AMULETLEVEL = 26;

// Character constants — strings internally, per convention (§6)
export const PASSAGE = "#";
export const DOOR = "+";
export const FLOOR = ".";
export const PLAYER = "@";

// Macro functions
export function ce(a: Coord, b: Coord): boolean { return a.x === b.x && a.y === b.y; }
export function on(thing: { flags: number }, flag: number): boolean { return (thing.flags & flag) !== 0; }
export function GOLDCALC(): number { return rnd(50 + 10 * state.level) + 2; }
```

### 8. The Daemon/Fuse System

Rogue has a simple scheduler: "daemons" run every turn, "fuses" run after N turns. Port the arrays and functions directly:

```typescript
interface DelayedAction {
  type: number;
  func: (arg: number) => Promise<void>;
  arg: number;
  time: number;
}
// Daemon/fuse callbacks must be async because they can transitively
// call msg() → wait_for() → readchar() → getch(). For example,
// stomach() displays hunger messages via msg(). do_daemons() and
// do_fuses() must await each callback.

export const dList: DelayedAction[] = new Array(MAXDAEMONS).fill(null).map(() => ({
  type: 0, func: () => {}, arg: 0, time: 0,
}));
```

### 9. Signal Handling and Process Control

The C code uses `signal(SIGINT, ...)`, `fork()`, `md_shellescape()`, etc. These don't exist in a browser. Handle as follows:

- `signal(SIGINT, quit)` → no-op (the consumer handles quit via its own UI)
- `md_shellescape()` / `shell()` → no-op or show a message "Shell not available"
- `exit()` / `my_exit()` → throw a `RogueExit` exception caught by `startRogue()`
- `md_getusername()` → return `options.playerName`
- `md_gethomedir()` → return `"/"`
- `md_getpid()` → return `0`

```typescript
export class RogueExit {
  constructor(public code: number) {}
}
```

### 10. Save/Restore

The C code uses `fopen`/`fwrite`/`fread` for save files, with a custom serialization format in `state.c`. In the port:

- `save_game()` serializes all game state to a `Uint8Array`. The serialization format is defined by rogue-ts itself (not binary-compatible with the C version — C struct padding, pointer sizes, and endianness make that impractical). The format should capture the same logical state that `rs_save_file()` / `rs_restore_file()` handle in the original `state.c`.
- Calls `backend.saveGame(data)` instead of writing to a file
- `restore()` calls `backend.restoreGame()` to get the `Uint8Array` back
- The consumer stores the data however it wants (localStorage, IndexedDB, etc.)

### 11. Random Number Generation

The C code uses its own seeded RNG (varies by platform). Port the specific RNG used in the original source. The seed is set from `options.seed ?? Date.now()`:

```typescript
let seed: number;

export function setRNGSeed(s: number): void { seed = s; }

// Match the original RNG algorithm from mdport.c
// NOTE: Must use Math.imul() for the multiplication. A naive
// `seed * 1103515245` overflows Number.MAX_SAFE_INTEGER (2^53)
// when seed is large, silently producing wrong values.
// Math.imul() gives correct 32-bit integer multiplication.
export function RN(): number {
  seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
  return seed;
}

export function rnd(range: number): number {
  return range === 0 ? 0 : Math.abs(RN()) % range;
}
```

### 12. Printf Format Strings

Include a `sprintf()` utility that handles C format specifiers used in the Rogue source:

```typescript
export function sprintf(fmt: string, ...args: unknown[]): string { ... }
```

Must handle at minimum: `%d`, `%s`, `%c`, `%ld`, `%-Nd` (left-justify), `%*d` (width from arg), `%%`.

## What NOT to Change

These aspects must be preserved exactly from the original C source:

1. **Monster stats table** (`monsters[]` in `monsters.c`) — exact HP, damage strings, flags, carry percentages
2. **Item tables** (`pot_info[]`, `scr_info[]`, `ring_info[]`, `weap_info[]`, `arm_info[]`, `ws_info[]`) — exact names, probabilities, values
3. **Combat formulas** (`roll_em()`, `swing()`, `save_throw()`) — exact arithmetic
4. **Dungeon generation** (`do_rooms()`, `do_passages()`) — room placement algorithm, corridor connection logic
5. **Status line format** — exact printf format string from `status()` in `io.c`
6. **Message text** — all in-game messages preserved verbatim
7. **Key bindings** — all original key commands from `command()`
8. **Hunger timing** — HUNGERTIME, MORETIME, STOMACHSIZE, STARVETIME constants
9. **Experience levels** — `e_levels[]` table
10. **Armor class calculations** — exact AC formula

## Testing

Since this is a mechanical port, correctness can be validated by:

1. **Deterministic replay**: Set the same RNG seed, feed the same key sequence, verify the same game state at each step. The C version and TS version should produce identical dungeon layouts, monster placements, and combat outcomes for the same seed.

2. **Smoke testing**: Play the game. Does it feel like Rogue? Rooms look right? Monsters chase? Items work? Combat feels correct?

3. **Edge cases from the original**: The C source has known behaviors (not bugs) that should be preserved — e.g., the Xeroc disguise mechanic, the rust monster's armor interaction, the "you hear a maniacal laughter" scroll effect.

## Build & Publish

```json
{
  "name": "@ticktockbent/rogue-ts",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "license": "BSD-3-Clause",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/TickTockBent/rogue-ts.git"
  }
}
```

Zero runtime dependencies. No peer dependencies. Pure TypeScript, compiles to ESM.

## GridCursesBackend Contract

The `wshoffner.dev` project will implement `CursesBackend` as `GridCursesBackend`. Here's how each curses concept maps to gridrender:

| Curses Concept | GridCursesBackend Implementation |
|---|---|
| `initscr()` | Create `useAsciiGrid(80, 24)`, return stdscr handle |
| `stdscr` writes (`addch`, `mvaddstr`, etc.) | Write directly to the grid buffer |
| `refresh()` | Call `flush()` to push buffer to React |
| `clear()` | Call `buffer.clear()` |
| `move(y, x)` | Track cursor position internally |
| `getch()` | Return `Promise<number>`, resolved by `useGridInput` keypress |
| `newwin()` | Create a virtual 2D char array (off-screen buffer) |
| `wrefresh()` | Composite the window's buffer onto the grid buffer, then `flush()` |
| `overwrite()` | Copy non-blank chars from one virtual buffer to another |
| `standout()` / `standend()` | Set `{ inverse: true }` / `{ inverse: false }` on subsequent chars |
| `printw(fmt, args)` | `sprintf(fmt, ...args)` → `addstr(result)` |
| `inch()` | Read back from grid buffer: `buffer.getCell(row, col).char` |
| `clrtoeol()` | Write spaces from cursor to end of row |
| `touchwin()` / `clearok()` | Flag window for full redraw |
| `endwin()` | No-op or cleanup |
| `saveGame()` | `localStorage.setItem(key, base64(data))` |
| `restoreGame()` | `localStorage.getItem(key)` → decode |
| Terminal modes (`cbreak`, `noecho`, etc.) | No-ops (always in raw mode in browser) |

### Virtual Window Management

The grid buffer is the physical screen. `stdscr` maps directly to it. Additional windows created with `newwin()` are virtual:

```typescript
interface VirtualWindow {
  id: number;
  chars: number[][];    // [row][col] — char codes
  attrs: number[][];    // [row][col] — attribute bitmask
  curY: number;
  curX: number;
  nlines: number;
  ncols: number;
  begY: number;
  begX: number;
  touchedRows: Set<number>;
  clearOnRefresh: boolean;
}
```

- `stdscr` writes go directly to the grid buffer (no virtual layer)
- `hw` and other windows write to their virtual buffer
- `wrefresh(win)` composites the virtual buffer onto the grid buffer at `(begY, begX)`, then calls `flush()`
- `overwrite(src, dst)` copies non-space characters between virtual buffers

### Color Mapping

Rogue 5.4 uses only `standout` (reverse video) — it does **not** use curses color pairs. The original game is monochrome. The backend renders:

- Normal text: `{ fg: "white" }` (using wesOSColors)
- Standout text: `{ inverse: true }` (or `{ fg: "bg", bg: "white" }`)

However, we want the **consumer** to be able to inject per-character colorization for visual appeal. This is done via an optional `CharColorMap` passed to the `GridCursesBackend` constructor — **not** part of rogue-ts itself.

Different games using the same curses backend may use the same ASCII characters for completely different purposes (e.g., `*` is gold in Rogue but might be a star in another game). So the color map is per-game, defined by the consumer when wiring up the component.

```typescript
/**
 * Maps individual characters to display attributes.
 * The backend checks this map when rendering each character.
 * If a character has an entry, those attrs override the default.
 * If not, the default (white fg, no bg) is used.
 *
 * Attrs use the same color tokens as the wesOSColors ColorMap
 * (e.g., "green", "cyan", "yellow", "red", "muted").
 */
export interface CharColorMap {
  [ch: string]: {
    fg?: string;
    bg?: string;
    bold?: boolean;
  };
}

// Example: Rogue character colors (defined in Rogue.tsx, not in rogue-ts)
const rogueCharColors: CharColorMap = {
  "@": { fg: "green", bold: true },   // player
  "*": { fg: "yellow" },              // gold
  "!": { fg: "cyan" },                // potion
  "?": { fg: "magenta" },             // scroll
  ")": { fg: "white" },               // weapon
  "]": { fg: "white" },               // armor
  "=": { fg: "yellow" },              // ring
  "/": { fg: "yellow" },              // wand/staff
  ":": { fg: "red" },                 // food
  ",": { fg: "magenta", bold: true }, // amulet of yendor
  "^": { fg: "red" },                 // trap
  "%": { fg: "green" },               // stairs
  "+": { fg: "yellow" },              // door
  "#": { fg: "muted" },               // passage
  ".": { fg: "muted" },               // floor
  "-": { fg: "white" },               // horizontal wall
  "|": { fg: "white" },               // vertical wall
};

// Usage in Rogue.tsx:
const backend = new GridCursesBackend(buffer, flush, {
  charColors: rogueCharColors,
});
await startRogue(backend, { playerName: "Rodney" });
```

The `GridCursesBackend` constructor accepts an options object:

```typescript
interface GridCursesBackendOptions {
  /** Per-character color overrides. Applied when writing to the grid buffer. */
  charColors?: CharColorMap;
  /** Default fg color for characters not in the map (default: "white"). */
  defaultFg?: string;
}
```

When the backend processes an `addch(ch)` or `mvaddch(y, x, ch)` call:
1. Convert `ch` to a string character
2. Look up the character in `charColors`
3. If found, use those attrs; if not, use `{ fg: defaultFg }`
4. If standout mode is active, apply `{ inverse: true }` on top
5. Write to the grid buffer with the resolved attrs

This keeps rogue-ts completely color-unaware (faithful to the original monochrome game) while letting each consumer define its own visual style.

### Input Key Mapping

The `useGridInput` `onKey` handler receives `GridKeyEvent`. The `GridCursesBackend` translates:

| GridKeyEvent.key | getch() returns |
|---|---|
| Single char (`"a"`, `"."`, `">"`) | char code (`97`, `46`, `62`) |
| `"up"` | `KEY_UP` (0x103) |
| `"down"` | `KEY_DOWN` (0x102) |
| `"left"` | `KEY_LEFT` (0x104) |
| `"right"` | `KEY_RIGHT` (0x105) |
| `"escape"` | `27` |
| `"enter"` | `13` |
| `"space"` | `32` |

### Quit Handling

When the consumer wants to force-quit (e.g., user closes the game from the terminal UI):

1. Consumer sets a `forceQuit` flag
2. Next `getch()` call resolves with a special value (or the pending promise is abandoned)
3. `startRogue()` catches the `RogueExit` exception and returns the `RogueResult`

This matches the Z-Machine pattern where force-quit returns a never-resolving Promise.

## Summary

- **rogue-ts** is a standalone package: Rogue 5.4.4 ported to TypeScript, calling a `CursesBackend` interface
- **CursesBackend** is the contract: ~40 methods covering screen output, input, window management, and save/restore
- **getch() is async** — the critical bridge between blocking C game loop and browser event model
- **All call chains above getch() become async** — mechanical transformation
- **rogue-ts is color-unaware** — faithful to the original monochrome game; no color logic in the port
- **GridCursesBackend** (in wshoffner.dev) implements the interface using `@ticktockbent/gridrender`
- **CharColorMap** — optional per-game character→color map passed to GridCursesBackend, not to rogue-ts. Each consumer defines its own visual style. Different games using the same backend can colorize characters independently
- The game code stays as close to the original C as TypeScript allows — same variable names, same logic flow, same data tables
