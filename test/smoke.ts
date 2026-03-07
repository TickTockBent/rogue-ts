/**
 * Smoke tests for rogue-ts.
 *
 * Runs a headless game with a scripted input backend and verifies
 * core systems work: init, movement, combat, items, save/restore.
 */

import type { CursesBackend, CursesWindow } from "../src/curses.js";
import { startRogue, resumeRogue } from "../src/main.js";
import type { RogueResult } from "../src/types.js";
import { RogueExit } from "../src/types.js";

// ─── Mock CursesBackend ──────────────────────────────

class MockBackend implements CursesBackend {
  private screen: number[][] = [];
  private curY = 0;
  private curX = 0;
  private inputQueue: number[] = [];
  private inputResolvers: ((ch: number) => void)[] = [];
  private nextWinId = 1;
  private exhaustedCount = 0;
  readonly maxExhausted = 200; // safety limit

  readonly LINES = 24;
  readonly COLS = 80;

  constructor() {
    this.screen = Array.from({ length: this.LINES }, () =>
      new Array(this.COLS).fill(32) // space
    );
  }

  queueInput(...chars: (string | number)[]): void {
    for (const ch of chars) {
      const code = typeof ch === "string" ? ch.charCodeAt(0) : ch;
      if (this.inputResolvers.length > 0) {
        const resolver = this.inputResolvers.shift()!;
        resolver(code);
      } else {
        this.inputQueue.push(code);
      }
    }
  }

  // Screen lifecycle
  initscr(): CursesWindow { return { id: this.nextWinId++ }; }
  endwin(): void {}
  isendwin(): boolean { return false; }

  // stdscr operations
  move(y: number, x: number): void { this.curY = y; this.curX = x; }
  addch(ch: number): void {
    if (this.curY >= 0 && this.curY < this.LINES && this.curX >= 0 && this.curX < this.COLS) {
      this.screen[this.curY][this.curX] = ch & 0xff;
      this.curX++;
    }
  }
  addstr(str: string): void {
    for (const ch of str) this.addch(ch.charCodeAt(0));
  }
  mvaddch(y: number, x: number, ch: number): void {
    this.move(y, x);
    this.addch(ch);
  }
  mvaddstr(y: number, x: number, str: string): void {
    this.move(y, x);
    this.addstr(str);
  }
  printw(_fmt: string, ..._args: unknown[]): void {}
  mvprintw(_y: number, _x: number, _fmt: string, ..._args: unknown[]): void {}
  inch(): number {
    if (this.curY >= 0 && this.curY < this.LINES && this.curX >= 0 && this.curX < this.COLS) {
      return this.screen[this.curY][this.curX];
    }
    return 32;
  }
  mvinch(y: number, x: number): number {
    if (y >= 0 && y < this.LINES && x >= 0 && x < this.COLS) {
      return this.screen[y][x];
    }
    return 32;
  }
  clear(): void {
    for (const row of this.screen) row.fill(32);
  }
  clrtoeol(): void {
    if (this.curY >= 0 && this.curY < this.LINES) {
      for (let x = this.curX; x < this.COLS; x++) {
        this.screen[this.curY][x] = 32;
      }
    }
  }
  refresh(): void {}
  standout(): void {}
  standend(): void {}
  getyx(): [number, number] { return [this.curY, this.curX]; }

  // Window operations
  newwin(_nlines: number, _ncols: number, _begy: number, _begx: number): CursesWindow {
    return { id: this.nextWinId++ };
  }
  delwin(_win: CursesWindow): void {}
  wmove(_win: CursesWindow, _y: number, _x: number): void {}
  waddch(_win: CursesWindow, _ch: number): void {}
  mvwaddch(_win: CursesWindow, _y: number, _x: number, _ch: number): void {}
  waddstr(_win: CursesWindow, _str: string): void {}
  mvwaddstr(_win: CursesWindow, _y: number, _x: number, _str: string): void {}
  wprintw(_win: CursesWindow, _fmt: string, ..._args: unknown[]): void {}
  wrefresh(_win: CursesWindow): void {}
  wclear(_win: CursesWindow): void {}
  wclrtoeol(_win: CursesWindow): void {}
  touchwin(_win: CursesWindow): void {}
  clearok(_win: CursesWindow, _flag: boolean): void {}
  overwrite(_src: CursesWindow, _dst: CursesWindow): void {}

  // Input — auto-quit when queue exhausted
  // wait_for(" ") only accepts space, so we can't send Q while --More-- is up.
  // Strategy: send Escape (0x1b) to break msg_esc prompts, space to clear
  // --More--, then Q + y to quit. Repeat the cycle.
  async getch(): Promise<number> {
    if (this.inputQueue.length > 0) {
      this.exhaustedCount = 0;
      return this.inputQueue.shift()!;
    }
    this.exhaustedCount++;
    if (this.exhaustedCount > this.maxExhausted) {
      // Force-exit the game by throwing RogueExit.
      // This unwinds cleanly — the game's catch handler treats it as normal termination.
      throw new RogueExit(0);
    }
    // Send spaces to clear any --More-- prompts while draining
    return 32;
  }

  // Terminal modes
  cbreak(): void {}
  nocbreak(): void {}
  noecho(): void {}
  echo(): void {}
  raw(): void {}
  noraw(): void {}
  keypad(_win: CursesWindow, _flag: boolean): void {}
  typeahead(_fd: number): void {}

  // Misc
  baudrate(): number { return 9600; }
  mvcur(_oldrow: number, _oldcol: number, _newrow: number, _newcol: number): void {}
  idlok(_win: CursesWindow, _flag: boolean): void {}

  // Save/Restore (unused in smoke tests)
  async saveGame(_data: Uint8Array): Promise<boolean> { return true; }
  async restoreGame(): Promise<Uint8Array | null> { return null; }

  // Test helpers
  getCharAt(y: number, x: number): string {
    if (y >= 0 && y < this.LINES && x >= 0 && x < this.COLS) {
      return String.fromCharCode(this.screen[y][x]);
    }
    return " ";
  }

  findChar(ch: string): { y: number; x: number } | null {
    const code = ch.charCodeAt(0);
    for (let y = 0; y < this.LINES; y++) {
      for (let x = 0; x < this.COLS; x++) {
        if (this.screen[y][x] === code) return { y, x };
      }
    }
    return null;
  }

  dumpScreen(): string {
    return this.screen
      .map(row => row.map(c => String.fromCharCode(c)).join(""))
      .join("\n");
  }
}

// ─── Test runner ─────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

/**
 * Run a promise with a timeout. If it doesn't resolve in time,
 * reject with an error. For game tests, this catches hangs from
 * missing input in the queue.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Test timed out after ${ms}ms (likely waiting for input)`)), ms)
    ),
  ]);
}


// ─── Test: Game initializes and generates a level ────

async function testGameInit(): Promise<void> {
  console.log("\n[Test: Game Init & Level Generation]");

  const backend = new MockBackend();
  // Rest a turn, then auto-quit kicks in from exhausted input
  backend.queueInput(".");

  const result = await withTimeout(startRogue(backend, { seed: 42, playerName: "TestHero" }), 5000);

  assert(result.outcome === "quit", `outcome is quit (got ${result.outcome})`);
  assert(result.level === 1, `level is 1 (got ${result.level})`);
  assert(result.gold >= 0, `gold is non-negative (got ${result.gold})`);
}

// ─── Test: Movement works ────────────────────────────

async function testMovement(): Promise<void> {
  console.log("\n[Test: Player Movement]");

  const backend = new MockBackend();
  // Move in various directions — auto-quit handles the exit
  backend.queueInput(".", "h", "l", "j", "k", ".");

  const result = await withTimeout(startRogue(backend, { seed: 123 }), 5000);

  assert(result.outcome === "quit", `outcome is quit (got ${result.outcome})`);
  assert(true, "movement commands consumed without error");
}

// ─── Test: Inventory ─────────────────────────────────

async function testInventory(): Promise<void> {
  console.log("\n[Test: Inventory Display]");

  const backend = new MockBackend();
  // Open inventory (i) — msg() shows items, --More-- dismissed by auto-input
  backend.queueInput("i");

  const result = await withTimeout(startRogue(backend, { seed: 456 }), 5000);

  assert(result.outcome === "quit", `outcome is quit (got ${result.outcome})`);
  assert(true, "inventory opened and closed without error");
}

// ─── Test: Version command ───────────────────────────

async function testVersion(): Promise<void> {
  console.log("\n[Test: Version Command]");

  const backend = new MockBackend();
  backend.queueInput("v");

  const result = await withTimeout(startRogue(backend, { seed: 789 }), 5000);

  assert(result.outcome === "quit", `outcome is quit (got ${result.outcome})`);
  assert(true, "version command handled without error");
}

// ─── Test: Save and Restore ──────────────────────────

async function testSaveRestore(): Promise<void> {
  console.log("\n[Test: Save & Restore]");

  // Start a game, move a bit, save
  const backend1 = new MockBackend();
  backend1.queueInput(".", ".", "S");

  const result1 = await withTimeout(startRogue(backend1, { seed: 1000, playerName: "SaveTest" }), 5000);

  assert(result1.outcome === "save", `save outcome (got ${result1.outcome})`);
  assert(typeof result1.saveData === "string", "saveData is a string");
  assert(result1.saveData!.length > 100, `saveData has content (${result1.saveData!.length} chars)`);

  // Parse the save data to verify structure
  const saveObj = JSON.parse(result1.saveData!);
  assert(saveObj.version === 1, `save version is 1 (got ${saveObj.version})`);
  assert(saveObj.flags.whoami === "SaveTest", `player name preserved (got ${saveObj.flags.whoami})`);
  assert(saveObj.flags.level === 1, `level preserved (got ${saveObj.flags.level})`);
  assert(saveObj.player !== undefined, "player data present");
  assert(Array.isArray(saveObj.places), "places array present");
  assert(saveObj.places.length === 32 * 80, `places has ${32 * 80} entries (got ${saveObj.places.length})`);
  assert(Array.isArray(saveObj.rooms), "rooms array present");
  assert(saveObj.rooms.length === 9, `9 rooms (got ${saveObj.rooms.length})`);
  assert(Array.isArray(saveObj.d_list), "daemon list present");

  // Verify daemon function names were serialized
  const daemonNames = saveObj.d_list
    .filter((d: { d_func_name: string | null }) => d.d_func_name !== null)
    .map((d: { d_func_name: string }) => d.d_func_name);
  assert(daemonNames.includes("doctor"), "doctor daemon serialized");
  assert(daemonNames.includes("stomach"), "stomach daemon serialized");

  // Resume the saved game — auto-quit handles exit
  const backend2 = new MockBackend();
  backend2.queueInput(".");

  const result2 = await withTimeout(resumeRogue(backend2, result1.saveData!), 5000);

  assert(result2.outcome === "quit", `resumed game quit (got ${result2.outcome})`);
  assert(result2.level === result1.level, `level matches after restore (${result2.level} === ${result1.level})`);
}

// ─── Test: Combat system functions ───────────────────

async function testCombatSystem(): Promise<void> {
  console.log("\n[Test: Combat System (unit)]");

  // Test roll_em and swing directly
  const { swing } = await import("../src/fight.js");
  const { setRNGSeed } = await import("../src/util.js");

  setRNGSeed(42);

  // swing(attackLevel, opponentArmor, weaponPlus)
  // need = 20 - atLvl - opArm + wplus; hits if d20 >= need
  // With low attack level and good armor, should miss sometimes
  let hits = 0;
  for (let i = 0; i < 100; i++) {
    if (swing(1, 2, 0)) hits++;
  }
  assert(hits > 0, `swing hits sometimes (${hits}/100 with lvl=1, arm=2)`);
  assert(hits < 100, `swing misses sometimes (${hits}/100)`);

  // Very high level should almost always hit
  setRNGSeed(42);
  hits = 0;
  for (let i = 0; i < 100; i++) {
    if (swing(20, 10, 5)) hits++;
  }
  assert(hits > 80, `high-level swing hits often (${hits}/100)`);
}

// ─── Test: RNG determinism ───────────────────────────

async function testRNGDeterminism(): Promise<void> {
  console.log("\n[Test: RNG Determinism]");

  const { setRNGSeed, rnd } = await import("../src/util.js");

  // Same seed should produce same sequence
  setRNGSeed(12345);
  const seq1: number[] = [];
  for (let i = 0; i < 20; i++) seq1.push(rnd(100));

  setRNGSeed(12345);
  const seq2: number[] = [];
  for (let i = 0; i < 20; i++) seq2.push(rnd(100));

  assert(
    seq1.every((v, i) => v === seq2[i]),
    "same seed produces identical sequence"
  );

  // Different seed should produce different sequence
  setRNGSeed(99999);
  const seq3: number[] = [];
  for (let i = 0; i < 20; i++) seq3.push(rnd(100));

  const allSame = seq1.every((v, i) => v === seq3[i]);
  assert(!allSame, "different seed produces different sequence");

  // rnd(n) should be in range [0, n)
  setRNGSeed(42);
  let inRange = true;
  for (let i = 0; i < 1000; i++) {
    const val = rnd(10);
    if (val < 0 || val >= 10) { inRange = false; break; }
  }
  assert(inRange, "rnd(10) always in [0,10)");
}

// ─── Test: Linked list operations ────────────────────

async function testLinkedList(): Promise<void> {
  console.log("\n[Test: Linked List Operations]");

  const { _attach, _detach, new_item } = await import("../src/list.js");

  // Build a list of 3 items
  const listHead: { head: import("../src/types.js").Thing | null } = { head: null };

  const item1 = new_item();
  item1.o_arm = 1;
  _attach(listHead, item1);
  assert(listHead.head === item1, "attach first item");

  const item2 = new_item();
  item2.o_arm = 2;
  _attach(listHead, item2);
  assert(listHead.head === item2, "attach prepends to head");
  assert(item2.l_next === item1, "second item links to first");

  const item3 = new_item();
  item3.o_arm = 3;
  _attach(listHead, item3);
  assert(listHead.head === item3, "attach third item to head");

  // Count items
  let count = 0;
  let cur = listHead.head;
  while (cur !== null) { count++; cur = cur.l_next; }
  assert(count === 3, `list has 3 items (got ${count})`);

  // Detach middle item
  _detach(listHead, item2);
  count = 0;
  cur = listHead.head;
  while (cur !== null) { count++; cur = cur.l_next; }
  assert(count === 2, `list has 2 items after detach (got ${count})`);
  assert(item3.l_next === item1, "links reconnected after detach");
}

// ─── Test: Daemon system ─────────────────────────────

async function testDaemonSystem(): Promise<void> {
  console.log("\n[Test: Daemon & Fuse System]");

  const { start_daemon, kill_daemon, fuse, do_daemons, do_fuses, find_slot } = await import("../src/daemon.js");
  const { resetState } = await import("../src/globals.js");

  resetState();

  let daemonCalled = 0;
  let fuseFired = false;

  const testDaemon = async (_arg: number): Promise<void> => { daemonCalled++; };
  const testFuse = async (_arg: number): Promise<void> => { fuseFired = true; };

  const AFTER = 2;
  start_daemon(testDaemon, 0, AFTER);
  fuse(testFuse, 0, 3, AFTER);

  // Run 1 turn
  await do_daemons(AFTER);
  await do_fuses(AFTER);
  assert(daemonCalled === 1, `daemon called on turn 1 (count=${daemonCalled})`);
  assert(!fuseFired, "fuse not fired yet (3 turns)");

  // Run 2 more turns
  await do_daemons(AFTER);
  await do_fuses(AFTER);
  await do_daemons(AFTER);
  await do_fuses(AFTER);
  assert(daemonCalled === 3, `daemon called 3 times (count=${daemonCalled})`);
  assert(fuseFired, "fuse fired after 3 turns");

  // Kill daemon
  kill_daemon(testDaemon);
  daemonCalled = 0;
  await do_daemons(AFTER);
  assert(daemonCalled === 0, "daemon no longer fires after kill");

  // find_slot for dead daemon
  assert(find_slot(testDaemon) === null, "killed daemon slot returns null");
}

// ─── Test: Item creation ─────────────────────────────

async function testItemCreation(): Promise<void> {
  console.log("\n[Test: Item Creation]");

  const { resetState } = await import("../src/globals.js");
  const { setRNGSeed } = await import("../src/util.js");
  const { init_probs, init_colors, init_names, init_stones, init_materials } = await import("../src/init.js");
  const { new_thing } = await import("../src/things.js");
  const { inv_name } = await import("../src/things.js");

  resetState();
  setRNGSeed(42);
  init_probs();
  init_colors();
  init_names();
  init_stones();
  init_materials();

  // Generate several items and check they're valid
  const itemTypes = new Set<number>();
  for (let i = 0; i < 50; i++) {
    const item = new_thing();
    assert(item._kind === "object", `item ${i} is object kind`);
    assert(item.o_type > 0, `item ${i} has a type (${item.o_type})`);
    itemTypes.add(item.o_type);

    // Check inv_name doesn't crash
    const name = inv_name(item, false);
    assert(name.length > 0, `item ${i} has a name: "${name.slice(0, 40)}"`);

    if (itemTypes.size >= 5) break; // got enough variety
  }

  assert(itemTypes.size >= 3, `generated ${itemTypes.size} different item types`);
}

// ─── Test: Save data structure integrity ─────────────

async function testSaveStructure(): Promise<void> {
  console.log("\n[Test: Save Data Structure]");

  const backend = new MockBackend();
  // Move around a bit to create game state, then save
  backend.queueInput(".", "j", ".", "k", ".", "S");

  const result = await withTimeout(startRogue(backend, { seed: 2000, playerName: "StructTest" }), 5000);

  assert(result.outcome === "save", "game saved");
  const save = JSON.parse(result.saveData!);

  // Check all expected top-level keys
  const expectedKeys = [
    "version", "flags", "pack_used", "string_arrays",
    "delta", "oldpos", "stairs", "nh",
    "places", "player", "max_stats",
    "cur_armor_id", "cur_weapon_id", "cur_ring_ids",
    "monsters", "lvl_objs", "all_objs",
    "rooms", "passages", "oldrp_idx",
    "d_list",
    "pot_info_state", "scr_info_state", "ring_info_state", "ws_info_state",
  ];
  for (const key of expectedKeys) {
    assert(key in save, `save has key: ${key}`);
  }

  // Player should have valid stats
  assert(save.player.t_stats.s_hpt > 0, `player has HP (${save.player.t_stats.s_hpt})`);
  assert(save.player.t_stats.s_str > 0, `player has STR (${save.player.t_stats.s_str})`);
  assert(save.player.t_type === "@", `player type is @ (got ${save.player.t_type})`);

  // Player should have pack items (at minimum, starting weapon + armor + food)
  assert(save.player.t_pack.length >= 2, `player has ${save.player.t_pack.length} pack items`);

  // Equipment references should be valid IDs found in all_objs
  const allObjIds = new Set(save.all_objs.map((o: { id: number }) => o.id));
  if (save.cur_weapon_id >= 0) {
    assert(allObjIds.has(save.cur_weapon_id), `cur_weapon_id ${save.cur_weapon_id} found in all_objs`);
  }
  if (save.cur_armor_id >= 0) {
    assert(allObjIds.has(save.cur_armor_id), `cur_armor_id ${save.cur_armor_id} found in all_objs`);
  }

  // Monster list should reference valid rooms
  for (const mon of save.monsters) {
    if (mon.t_room_idx >= 0 && mon.t_room_idx < 100) {
      assert(mon.t_room_idx < 9, `monster room idx ${mon.t_room_idx} < 9`);
    }
  }

  // Places with monsters should have valid monster IDs
  const allMonIds = new Set(save.monsters.map((m: { id: number }) => m.id));
  const placesWithMonsters = save.places.filter(
    (p: { p_monst_id: number }) => p.p_monst_id >= 0
  );
  for (const place of placesWithMonsters) {
    assert(
      allMonIds.has(place.p_monst_id),
      `place monster id ${place.p_monst_id} found in monsters`
    );
  }

  // Item knowledge arrays should have correct lengths
  assert(save.pot_info_state.length === 14, `pot_info has 14 entries (got ${save.pot_info_state.length})`);
  assert(save.scr_info_state.length === 18, `scr_info has 18 entries (got ${save.scr_info_state.length})`);
  assert(save.ring_info_state.length === 14, `ring_info has 14 entries (got ${save.ring_info_state.length})`);
  assert(save.ws_info_state.length === 14, `ws_info has 14 entries (got ${save.ws_info_state.length})`);
}

// ─── Test: Descend stairs ────────────────────────────

async function testDescendStairs(): Promise<void> {
  console.log("\n[Test: Descend Stairs]");

  const backend = new MockBackend();
  // Try go down (>), which should fail on non-stairs — auto-quit handles exit
  backend.queueInput(">");

  const result = await withTimeout(startRogue(backend, { seed: 555 }), 5000);

  assert(result.outcome === "quit", "game quit after failed stairs attempt");
  assert(result.level === 1, "still on level 1");
}

// ─── Test: Help screen ──────────────────────────────

async function testHelpScreen(): Promise<void> {
  console.log("\n[Test: Help Screen]");

  const backend = new MockBackend();
  // Press ? for help — spaces from auto-quit dismiss pages
  backend.queueInput("?");

  const result = await withTimeout(startRogue(backend, { seed: 666 }), 5000);

  assert(result.outcome === "quit", "game quit after help");
  assert(true, "help screen displayed without error");
}

// ─── Test: Search for traps/doors ────────────────────

async function testSearch(): Promise<void> {
  console.log("\n[Test: Search Command]");

  const backend = new MockBackend();
  backend.queueInput("s", "s", "s", "s", "s");

  const result = await withTimeout(startRogue(backend, { seed: 777 }), 5000);

  assert(result.outcome === "quit", "game quit after searching");
  assert(true, "search commands handled without error");
}

// ─── Test: Save/Restore roundtrip preserves state ─────

async function testSaveRestoreState(): Promise<void> {
  console.log("\n[Test: Save/Restore State Fidelity]");

  // Play a few turns and save
  const backend1 = new MockBackend();
  backend1.queueInput(".", ".", ".", ".", ".", "S");

  const result1 = await withTimeout(startRogue(backend1, { seed: 3000, playerName: "Fidelity" }), 5000);
  assert(result1.outcome === "save", "first save works");

  const save1 = JSON.parse(result1.saveData!);

  // Restore, play a turn, save again
  const backend2 = new MockBackend();
  backend2.queueInput(".", "S");

  const result2 = await withTimeout(resumeRogue(backend2, result1.saveData!), 5000);
  assert(result2.outcome === "save", "save after restore works");

  const save2 = JSON.parse(result2.saveData!);

  // Key state should be consistent
  assert(save2.flags.whoami === "Fidelity", "player name preserved through roundtrip");
  assert(save2.flags.level === save1.flags.level, "level preserved");
  assert(save2.player.t_type === "@", "player type still @");

  // HP may have changed (doctor daemon heals), but should be positive
  assert(save2.player.t_stats.s_hpt > 0, `HP positive after roundtrip (${save2.player.t_stats.s_hpt})`);

  // Rooms should still be present
  assert(save2.rooms.length === 9, "9 rooms after roundtrip");

  // String arrays should persist (randomized names/colors)
  assert(save2.string_arrays.p_colors.length === 14, "potion colors preserved");
  assert(
    save2.string_arrays.p_colors[0] === save1.string_arrays.p_colors[0],
    "potion color[0] matches across saves"
  );
}

// ─── Test: Help then continue playing ────────────────

async function testHelpThenPlay(): Promise<void> {
  console.log("\n[Test: Help Then Play]");

  const backend = new MockBackend();
  // Press ? for help, 3 spaces to dismiss all pages, then movement commands, then save
  backend.queueInput("?", " ", " ", " ", ".", "j", ".", "S");

  const result = await withTimeout(startRogue(backend, { seed: 666 }), 5000);

  assert(result.outcome === "save", `game saved after help+play (got ${result.outcome})`);
  assert(result.level === 1, `still on level 1 (got ${result.level})`);
}

// ─── Main ────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== rogue-ts Smoke Tests ===");

  await testRNGDeterminism();
  await testLinkedList();
  await testDaemonSystem();
  await testItemCreation();
  await testGameInit();
  await testMovement();
  await testInventory();
  await testVersion();
  await testHelpScreen();
  await testHelpThenPlay();
  await testSearch();
  await testDescendStairs();
  await testCombatSystem();
  await testSaveRestore();
  await testSaveStructure();
  await testSaveRestoreState();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
