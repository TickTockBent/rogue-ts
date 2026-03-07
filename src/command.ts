/**
 * Command dispatcher.
 * Ported from command.c
 *
 * Handles all key input during the main game loop.
 */

import type { Coord } from "./types.js";
import {
  state, ESCAPE, NUMLINES, NUMCOLS,
  STAIRS, AMULET, AMULETLEVEL,
  ISHUH, ISHALU, ISBLIND, ISTARGET, ISLEVIT, ISHASTE,
  ISWEARING, R_SEARCH, R_TELEPORT,
  FLOOR, PASSAGE, DOOR, TRAP,
  POTION, SCROLL, WEAPON, ARMOR, RING, STICK,
  CALLABLE,
  INDEX, chat, flat, moat,
  F_REAL, F_PASS, F_TMASK,
  pot_info, scr_info, ring_info, ws_info, weap_info, arm_info,
  MAXPOTIONS, MAXSCROLLS, MAXRINGS, MAXSTICKS, MAXWEAPONS, MAXARMORS,
  inv_t_name, helpstr, tr_name,
  monsters as monsterTemplates,
} from "./globals.js";
import { CTRL, rnd } from "./util.js";
import { msg, readchar, wait_for, status, getBackend } from "./io.js";
import { do_move, do_run } from "./move.js";
import { pick_up, drop, eat, get_item } from "./pack.js";
import { inventory } from "./pack.js";
import { look } from "./misc.js";
import { quit } from "./rip.js";
import { wield, missile } from "./weapons.js";
import { wear, take_off } from "./armor.js";
import { quaff } from "./potions.js";
import { read_scroll } from "./scrolls.js";
import { ring_on, ring_off } from "./rings.js";
import { do_zap } from "./sticks.js";
import { inv_name } from "./things.js";

/**
 * saveScreenBuffer / restoreScreenBuffer: Capture and restore the full
 * stdscr contents. Used by overlay screens (help, discovered, options)
 * so the dungeon map is restored after the overlay is dismissed.
 * This is necessary because most CursesBackend implementations don't
 * maintain an internal stdscr buffer that touchwin/clearok can repaint from.
 */
function saveScreenBuffer(): number[][] {
  const backend = getBackend();
  const buf: number[][] = [];
  for (let y = 0; y < NUMLINES; y++) {
    buf[y] = [];
    for (let x = 0; x < NUMCOLS; x++) {
      buf[y][x] = backend.mvinch(y, x);
    }
  }
  return buf;
}

function restoreScreenBuffer(buf: number[][]): void {
  const backend = getBackend();
  for (let y = 0; y < NUMLINES; y++) {
    for (let x = 0; x < NUMCOLS; x++) {
      backend.mvaddch(y, x, buf[y][x] & 0xff);
    }
  }
  backend.refresh();
}

// Direction deltas for movement keys
const dirMap: Record<string, [number, number]> = {
  h: [0, -1],
  j: [1, 0],
  k: [-1, 0],
  l: [0, 1],
  y: [-1, -1],
  u: [-1, 1],
  b: [1, -1],
  n: [1, 1],
};

// Uppercase = run in that direction
const runMap: Record<string, string> = {
  H: "h", J: "j", K: "k", L: "l",
  Y: "y", U: "u", B: "b", N: "n",
};

// Ctrl+dir = run until adjacent to something
const ctrlDirMap: Record<number, string> = {
  [CTRL("H")]: "h", [CTRL("J")]: "j", [CTRL("K")]: "k", [CTRL("L")]: "l",
  [CTRL("Y")]: "y", [CTRL("U")]: "u", [CTRL("B")]: "b", [CTRL("N")]: "n",
};

/**
 * command: Read and execute a command.
 * Returns true if the turn should end (monsters move).
 */
export async function command(): Promise<boolean> {
  const backend = getBackend();

  // Handle no_command (paralysis, etc.)
  if (state.no_command > 0) {
    state.no_command--;
    if (state.no_command === 0) {
      await msg("you can move again");
    }
    return true;
  }

  // If counting moves, continue the last direction
  if (state.count > 0) {
    state.count--;
    return await executeDirection(state.last_dir);
  }

  state.after = true;

  // If running, continue the run
  if (state.running) {
    return await executeDirection(state.runch);
  }

  // C original: clear message line each turn
  await msg("");

  // Draw surrounding area
  await look(true);
  await status();
  backend.move(state.player.t_pos.y, state.player.t_pos.x);
  backend.refresh();

  // Pick up items if auto-pickup is pending
  if (state.take !== "") {
    const takeCh = state.take;
    state.take = "";
    if (!state.move_no_pickup) {
      await pick_up(takeCh);
    }
  }

  // Read the command
  let ch = await readchar();

  // C original: numeric prefix — read digits to build a count
  if (ch >= "0" && ch <= "9") {
    state.count = 0;
    while (ch >= "0" && ch <= "9") {
      state.count = state.count * 10 + (ch.charCodeAt(0) - "0".charCodeAt(0));
      ch = await readchar();
    }
    state.count--;
  }

  // Check for movement
  if (dirMap[ch]) {
    const [dy, dx] = dirMap[ch];
    state.last_dir = ch;
    await do_move(dy, dx);
    return state.after;
  }

  // Check for running
  if (runMap[ch]) {
    const dir = runMap[ch];
    do_run(dir);
    state.last_dir = dir;
    const [dy, dx] = dirMap[dir];
    await do_move(dy, dx);
    return state.after;
  }

  // Check for ctrl+dir (run until adjacent)
  const ctrlDir = ctrlDirMap[ch.charCodeAt(0)];
  if (ctrlDir !== undefined) {
    do_run(ctrlDir);
    state.last_dir = ctrlDir;
    const [dy, dx] = dirMap[ctrlDir];
    await do_move(dy, dx);
    return state.after;
  }

  // Other commands
  switch (ch) {
    case ".":
      // Rest — do nothing, let monsters move
      break;

    case "s":
      // Search for hidden doors/traps
      await search();
      break;

    case ">":
      // Go down stairs
      await goDownStairs();
      break;

    case "<":
      // Go up stairs (need amulet)
      await goUpStairs();
      break;

    case "i":
      // Inventory
      state.after = false;
      await inventory(state.player.t_pack, 0);
      break;

    case ",":
    case "g":
      // Pick up item
      {
        const pickCh = chat(state.player.t_pos.y, state.player.t_pos.x);
        if (pickCh === FLOOR || pickCh === PASSAGE || pickCh === DOOR || pickCh === " ") {
          await msg("nothing to pick up");
        } else {
          await pick_up(pickCh);
        }
      }
      break;

    case "d":
      // Drop item
      await drop();
      break;

    case "e":
      // Eat food
      await eat();
      break;

    case "w":
      // Wield weapon
      await wield();
      break;

    case "W":
      // Wear armor
      await wear();
      break;

    case "T":
      // Take off armor
      await take_off();
      break;

    case "q":
      // Quaff potion
      await quaff();
      break;

    case "r":
      // Read scroll
      await read_scroll();
      break;

    case "P":
      // Put on ring
      await ring_on();
      break;

    case "R":
      // Remove ring
      await ring_off();
      break;

    case "z":
      // Zap wand/staff
      await do_zap();
      break;

    case "t":
      // Throw something
      await missile();
      break;

    case "f":
      // Fight to death or near death
      {
        state.to_death = true;
        const fightDir = await readchar();
        if (dirMap[fightDir]) {
          state.last_dir = fightDir;
          const [dy, dx] = dirMap[fightDir];
          await do_move(dy, dx);
        }
      }
      break;

    case "F":
      // Fight to the death (kamikaze)
      {
        state.to_death = true;
        state.kamikaze = true;
        const fightDir = await readchar();
        if (dirMap[fightDir]) {
          state.last_dir = fightDir;
          const [dy, dx] = dirMap[fightDir];
          await do_move(dy, dx);
        }
      }
      break;

    case "m":
      // Move without picking up
      {
        state.move_no_pickup = true;
        const moveDir = await readchar();
        if (dirMap[moveDir]) {
          state.last_dir = moveDir;
          const [dy, dx] = dirMap[moveDir];
          await do_move(dy, dx);
        }
        state.move_no_pickup = false;
      }
      break;

    case "c":
      // Call/name an item
      state.after = false;
      await call_it();
      break;

    case "a":
      // Repeat last command
      state.again = true;
      break;

    case ")":
      // Print current weapon
      state.after = false;
      if (state.cur_weapon !== null && state.cur_weapon._kind === "object") {
        await msg("you are wielding %s (%s)",
          inv_name(state.cur_weapon, false), state.cur_weapon.o_packch);
      } else {
        await msg("you are empty handed");
      }
      break;

    case "]":
      // Print current armor
      state.after = false;
      if (state.cur_armor !== null && state.cur_armor._kind === "object") {
        await msg("you are wearing %s", inv_name(state.cur_armor, false));
      } else {
        await msg("you are not wearing any armor");
      }
      break;

    case "=":
      // Print current rings
      state.after = false;
      {
        let foundRing = false;
        for (let hand = 0; hand < 2; hand++) {
          const ring = state.cur_ring[hand];
          if (ring !== null && ring._kind === "object") {
            await msg("on %s hand: %s",
              hand === 0 ? "left" : "right",
              inv_name(ring, false));
            foundRing = true;
          }
        }
        if (!foundRing) {
          await msg("not wearing any rings");
        }
      }
      break;

    case "@":
      // Toggle stat_msg / print current stats
      state.after = false;
      state.stat_msg = !state.stat_msg;
      await msg("terse stats %s", state.stat_msg ? "on" : "off");
      break;

    case "D":
      // Recall discoveries
      state.after = false;
      await discovered();
      break;

    case "/":
      // Identify character on screen
      state.after = false;
      await identify_char();
      break;

    case "^":
      // Identify trap type
      state.after = false;
      await identify_trap();
      break;

    case "I":
      // Inventory single item
      state.after = false;
      {
        await msg("which item? ");
        const itemCh = await readchar();
        if (itemCh.charCodeAt(0) === ESCAPE) {
          await msg("");
          break;
        }
        let found = false;
        let item = state.player.t_pack;
        while (item !== null) {
          if (item._kind === "object" && item.o_packch === itemCh) {
            await msg("%s (%s)", inv_name(item, false), item.o_packch);
            found = true;
            break;
          }
          item = item.l_next;
        }
        if (!found) {
          await msg("'%s' not in pack", itemCh);
        }
      }
      break;

    case "o":
      // Options
      state.after = false;
      await set_options();
      break;

    case "S":
      // Save game
      state.after = false;
      {
        const { saveGame } = await import("./save.js");
        const saveData = saveGame();
        state._saveData = saveData;
        await msg("game saved");
        // Signal the game loop to exit cleanly
        state.playing = false;
        const { RogueExit } = await import("./types.js");
        throw new RogueExit(0);
      }

    case "Q":
      // Quit
      state.after = false;
      await msg("really quit?");
      {
        const answer = await readchar();
        if (answer === "y" || answer === "Y") {
          await quit();
        } else {
          await msg("");
        }
      }
      break;

    case String.fromCharCode(CTRL("R")):
      // Redraw screen
      state.after = false;
      if (state.stdscr !== null) {
        backend.clearok(state.stdscr, true);
      }
      backend.refresh();
      break;

    case String.fromCharCode(CTRL("P")):
      // Repeat last message
      state.after = false;
      if (state.huh !== "") {
        await msg(state.huh);
      }
      break;

    case "?":
      // Help
      state.after = false;
      await help();
      break;

    case "v":
      // Version
      state.after = false;
      await msg("rogue-ts version: 5.4.4-ts (Phase 8)");
      break;

    default:
      // Unknown command
      state.after = false;
      if (state.terse) {
        await msg("illegal cmd '%s'", ch);
      } else {
        await msg("illegal command '%s'", ch);
      }
      state.count = 0;
      break;
  }

  // C original: ring of searching auto-searches each turn
  if (state.after && ISWEARING(R_SEARCH)) {
    await search();
  }

  // C original: ring of teleportation randomly teleports
  if (state.after && ISWEARING(R_TELEPORT) && rnd(50) === 0) {
    const { find_floor, roomin } = await import("./rooms.js");
    const { floor_at } = await import("./misc.js");
    const heroPos = state.player.t_pos;
    const newPos = { y: 0, x: 0 };
    find_floor(null, newPos, false, true);
    const backend = getBackend();
    backend.mvaddch(heroPos.y, heroPos.x, floor_at().charCodeAt(0));
    heroPos.y = newPos.y;
    heroPos.x = newPos.x;
    state.player.t_room = roomin(heroPos);
    await msg("teleport!");
  }

  return state.after;
}

/**
 * executeDirection: Execute movement in a saved direction.
 */
async function executeDirection(dir: string): Promise<boolean> {
  if (!dirMap[dir]) return false;
  const [dy, dx] = dirMap[dir];
  await do_move(dy, dx);
  return state.after;
}

/**
 * search: Look for hidden things around the hero.
 */
async function search(): Promise<void> {
  const backend = getBackend();
  const heroPos = state.player.t_pos;

  // C original: confused search has probability of failure per cell, not total failure
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dy === 0 && dx === 0) continue;
      const ny = heroPos.y + dy;
      const nx = heroPos.x + dx;
      if (ny <= 0 || ny >= NUMLINES - 1 || nx < 0 || nx >= NUMCOLS) continue;

      // Confused: each cell has a chance to fail
      if ((state.player.t_flags & ISHUH) && rnd(5) !== 0) continue;

      const pp = INDEX(ny, nx);
      if (!(pp.p_flags & F_REAL)) {
        if (rnd(5) === 0) {
          pp.p_flags |= F_REAL;
          pp.p_ch = (pp.p_flags & F_PASS) ? PASSAGE : DOOR;
          state.count = 0;
          state.running = false;
          if (!(state.player.t_flags & ISHALU)) {
            backend.mvaddch(ny, nx, pp.p_ch.charCodeAt(0));
          }
        }
      }
    }
  }
}

/**
 * goDownStairs: Descend to the next level.
 */
async function goDownStairs(): Promise<void> {
  if (chat(state.player.t_pos.y, state.player.t_pos.x) !== STAIRS) {
    if (state.terse) {
      await msg("no stairs");
    } else {
      await msg("I see no way down");
    }
    return;
  }

  // C original: levit_check — levitating players can't use stairs
  if (levit_check()) return;

  state.level++;
  state.seenstairs = false;
  state._newLevel = true;
  // C original: stairs don't give monsters a free turn
  state.after = false;
}

/**
 * goUpStairs: Ascend (only with the amulet, only at level 1).
 */
async function goUpStairs(): Promise<void> {
  if (chat(state.player.t_pos.y, state.player.t_pos.x) !== STAIRS) {
    if (state.terse) {
      await msg("no stairs");
    } else {
      await msg("I see no way up");
    }
    return;
  }

  if (!state.amulet) {
    await msg("your way is magically blocked");
    return;
  }

  // C original: levit_check — levitating players can't use stairs
  if (levit_check()) return;

  state.level--;
  if (state.level <= 0) {
    const { total_winner } = await import("./rip.js");
    await total_winner();
    return;
  }
  state._newLevel = true;
  state.after = false;
}

/**
 * call_it: Allow the player to name/call an item type.
 */
async function call_it(): Promise<void> {
  const obj = await get_item("call", CALLABLE);
  if (obj === null) return;

  const typeChar = String.fromCharCode(obj.o_type);
  let infoTable: { oi_guess: string | null }[] | null = null;
  let idx = obj.o_which;

  switch (typeChar) {
    case POTION: infoTable = pot_info; break;
    case SCROLL: infoTable = scr_info; break;
    case RING: infoTable = ring_info; break;
    case STICK: infoTable = ws_info; break;
    default:
      // Can also name individual objects
      await msg("what do you want to call it?");
      {
        const name = await readName();
        if (name !== "") {
          obj.o_label = name;
        }
      }
      return;
  }

  await msg("what do you want to call it?");
  const name = await readName();
  if (name !== "" && infoTable !== null) {
    infoTable[idx].oi_guess = name;
  }
}

/**
 * readName: Read a string from the player for naming items.
 */
async function readName(): Promise<string> {
  let name = "";
  for (;;) {
    const ch = await readchar();
    if (ch === "\n" || ch === "\r") break;
    if (ch.charCodeAt(0) === ESCAPE) return "";
    if (ch === "\b" || ch.charCodeAt(0) === 127) {
      if (name.length > 0) name = name.slice(0, -1);
      continue;
    }
    if (name.length < 30) {
      name += ch;
    }
  }
  return name;
}

/**
 * help: Display the help screen using the helpstr table.
 */
async function help(): Promise<void> {
  const backend = getBackend();
  const savedScreen = saveScreenBuffer();

  backend.clear();
  let row = 0;
  for (const entry of helpstr) {
    if (!entry.h_print) continue;

    let line: string;
    if (entry.h_ch === 0) {
      // Category header
      line = entry.h_desc.replace(/^\t/, "          ");
    } else {
      const keyStr = entry.h_ch < 32
        ? "^" + String.fromCharCode(entry.h_ch + 64)
        : String.fromCharCode(entry.h_ch);
      // h_desc is like "<dir>\tdescription" or "\tdescription"
      const parts = entry.h_desc.split("\t");
      const prefix = parts[0] || "";
      const desc = parts[1] || "";
      line = keyStr + prefix + " " + desc;
    }

    backend.mvaddstr(row, 0, line);
    row++;

    if (row >= NUMLINES - 1) {
      backend.mvaddstr(NUMLINES - 1, 0, "--Press space to continue--");
      backend.refresh();
      await wait_for(" ");
      backend.clear();
      row = 0;
    }
  }

  backend.mvaddstr(NUMLINES - 1, 0, "--Press space to continue--");
  backend.refresh();
  await wait_for(" ");
  restoreScreenBuffer(savedScreen);
}

/**
 * discovered: Show what items have been discovered/identified.
 */
async function discovered(): Promise<void> {
  const backend = getBackend();
  const lines: string[] = [];

  // Potions
  for (let i = 0; i < MAXPOTIONS; i++) {
    if (pot_info[i].oi_know) {
      lines.push(`A potion of ${pot_info[i].oi_name} (${state.p_colors[i]})`);
    }
  }
  // Scrolls
  for (let i = 0; i < MAXSCROLLS; i++) {
    if (scr_info[i].oi_know) {
      lines.push(`A scroll of ${scr_info[i].oi_name} (${state.s_names[i]})`);
    }
  }
  // Rings
  for (let i = 0; i < MAXRINGS; i++) {
    if (ring_info[i].oi_know) {
      lines.push(`A ring of ${ring_info[i].oi_name} (${state.r_stones[i]})`);
    }
  }
  // Sticks
  for (let i = 0; i < MAXSTICKS; i++) {
    if (ws_info[i].oi_know) {
      const stickType = state.ws_type[i] || "staff";
      lines.push(`A ${stickType} of ${ws_info[i].oi_name} (${state.ws_made[i]})`);
    }
  }

  if (lines.length === 0) {
    await msg("nothing discovered yet");
    return;
  }

  const savedScreen = saveScreenBuffer();
  backend.clear();
  let row = 0;
  for (const line of lines) {
    backend.mvaddstr(row, 0, line);
    row++;
    if (row >= NUMLINES - 1) {
      backend.mvaddstr(NUMLINES - 1, 0, "--Press space to continue--");
      backend.refresh();
      await wait_for(" ");
      backend.clear();
      row = 0;
    }
  }
  backend.mvaddstr(NUMLINES - 1, 0, "--Press space to continue--");
  backend.refresh();
  await wait_for(" ");
  restoreScreenBuffer(savedScreen);
}

/**
 * identify_char: Tell the player what a character on the screen represents.
 */
async function identify_char(): Promise<void> {
  await msg("what do you want identified? ");
  const ch = await readchar();

  const charNames: Record<string, string> = {
    "|": "wall of a room",
    "-": "wall of a room",
    ".": "floor",
    "#": "passage",
    "+": "door",
    "^": "trap",
    "%": "staircase",
    "*": "gold",
    ":": "food",
    "!": "potion",
    "?": "scroll",
    ")": "weapon",
    "]": "armor",
    "=": "ring",
    "/": "wand or staff",
    ",": "the Amulet of Yendor",
    "@": "you",
    " ": "solid rock",
  };

  // Check if it's a monster letter
  if (ch >= "A" && ch <= "Z") {
    const monsterIndex = ch.charCodeAt(0) - "A".charCodeAt(0);
    await msg("'%s': %s", ch, monsterTemplates[monsterIndex].m_name);
    return;
  }

  const description = charNames[ch];
  if (description !== undefined) {
    await msg("'%s': %s", ch, description);
  } else {
    await msg("'%s': unknown character", ch);
  }
}

/**
 * identify_trap: Show the type of an adjacent trap.
 */
async function identify_trap(): Promise<void> {
  const { get_dir } = await import("./misc.js");
  if (!await get_dir()) return;

  const trapY = state.player.t_pos.y + state.delta.y;
  const trapX = state.player.t_pos.x + state.delta.x;

  if (trapY <= 0 || trapY >= NUMLINES - 1 || trapX < 0 || trapX >= NUMCOLS) {
    await msg("no trap there");
    return;
  }

  const pp = INDEX(trapY, trapX);
  if (pp.p_ch !== TRAP) {
    await msg("no trap there");
    return;
  }

  const trapFlags = flat(trapY, trapX);
  const trapType = trapFlags & F_TMASK;
  const trapName = tr_name[trapType] || "a mysterious trap";
  await msg("%s", trapName);
}

/**
 * set_options: Allow the player to examine and set game options.
 */
async function set_options(): Promise<void> {
  const backend = getBackend();
  const savedScreen = saveScreenBuffer();

  backend.clear();
  backend.mvaddstr(0, 0, "Game options (press space to continue):");
  backend.mvaddstr(2, 0, `terse:    ${state.terse ? "on" : "off"}`);
  backend.mvaddstr(3, 0, `fruit:    ${state.fruit}`);
  backend.mvaddstr(4, 0, `name:     ${state.whoami}`);
  backend.mvaddstr(5, 0, `jump:     ${state.jump ? "on" : "off"}`);
  backend.mvaddstr(NUMLINES - 1, 0, "--Press space to continue--");
  backend.refresh();
  await wait_for(" ");
  restoreScreenBuffer(savedScreen);
}

/**
 * levit_check: Check if the player is levitating and can't use stairs.
 * Returns true if the player is levitating (action blocked).
 */
function levit_check(): boolean {
  if (state.player.t_flags & ISLEVIT) {
    return true;
  }
  return false;
}
