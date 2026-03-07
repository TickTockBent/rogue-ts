/**
 * Hero movement commands.
 * Ported from move.c
 */

import type { Coord, Monster, Thing } from "./types.js";
import {
  state, NUMCOLS, NUMLINES,
  FLOOR, PASSAGE, DOOR, TRAP, STAIRS, PLAYER,
  ISHUH, ISLEVIT, ISHELD, ISBLIND, ISGONE,
  ISWEARING, R_SUSTSTR, R_SUSTARM,
  SLEEPTIME, BEARTIME,
  F_PASS, F_REAL, F_PNUM, F_TMASK,
  INDEX, chat, setCh, flat, setFlat, moat, winat,
  T_DOOR, T_ARROW, T_SLEEP, T_BEAR, T_TELEP, T_DART, T_RUST, T_MYST,
  ESCAPE,
} from "./globals.js";
import { rnd, ce, spread } from "./util.js";
import { msg, step_ok, getBackend } from "./io.js";
import { diag_ok, floor_at, chg_str } from "./misc.js";
import { enter_room, leave_room, find_floor, roomin } from "./rooms.js";

/**
 * do_run: Start the hero running.
 */
export function do_run(ch: string): void {
  state.running = true;
  state.after = false;
  state.runch = ch;
}

/**
 * do_move: Check to see that a move is legal. If it is, handle consequences.
 */
export async function do_move(dy: number, dx: number): Promise<void> {
  const backend = getBackend();
  const heroPos = state.player.t_pos;

  state.firstmove = false;
  if (state.no_move > 0) {
    state.no_move--;
    await msg("you are still stuck in the bear trap");
    return;
  }

  let nhY: number;
  let nhX: number;

  // Do a confused move (maybe)
  if ((state.player.t_flags & ISHUH) && rnd(5) !== 0) {
    const rndPos = rndmove(state.player);
    nhY = rndPos.y;
    nhX = rndPos.x;
    if (nhY === heroPos.y && nhX === heroPos.x) {
      state.after = false;
      state.running = false;
      state.to_death = false;
      return;
    }
  } else {
    nhY = heroPos.y + dy;
    nhX = heroPos.x + dx;
  }

  // Check bounds
  if (nhX < 0 || nhX >= NUMCOLS || nhY <= 0 || nhY >= NUMLINES - 1) {
    state.running = false;
    state.after = false;
    return;
  }

  // Check diagonal movement
  if (!diag_ok(heroPos, { y: nhY, x: nhX })) {
    state.after = false;
    state.running = false;
    return;
  }

  if (state.running && nhY === heroPos.y && nhX === heroPos.x) {
    state.after = false;
    state.running = false;
  }

  const fl = flat(nhY, nhX);
  let ch = winat(nhY, nhX);

  // Check for hidden traps
  if (!(fl & F_REAL) && ch === FLOOR) {
    if (!(state.player.t_flags & ISLEVIT)) {
      setCh(nhY, nhX, TRAP);
      const pp = INDEX(nhY, nhX);
      pp.p_flags |= F_REAL;
      ch = TRAP;
    }
  } else if ((state.player.t_flags & ISHELD) && ch !== "F") {
    await msg("you are being held");
    return;
  }

  switch (ch) {
    case " ":
    case "|":
    case "-":
      state.running = false;
      state.after = false;
      break;

    case DOOR:
      state.running = false;
      if (flat(heroPos.y, heroPos.x) & F_PASS) {
        enter_room({ y: nhY, x: nhX });
      }
      doMoveStuff(nhY, nhX, fl);
      break;

    case TRAP:
      await be_trapped({ y: nhY, x: nhX });
      doMoveStuff(nhY, nhX, fl);
      break;

    case PASSAGE:
      state.player.t_room = roomin(heroPos);
      doMoveStuff(nhY, nhX, fl);
      break;

    case FLOOR:
      if (!(fl & F_REAL)) {
        await be_trapped(heroPos);
      }
      doMoveStuff(nhY, nhX, fl);
      break;

    case STAIRS:
      state.seenstairs = true;
      state.running = false;
      // Don't set state.take for stairs (no auto-pickup)
      doMoveStuff(nhY, nhX, fl);
      break;

    default:
      state.running = false;
      // Check if it's a monster
      if ((ch >= "A" && ch <= "Z") || moat(nhY, nhX) !== null) {
        // fight — simplified for Phase 6 milestone
        const { fight } = await import("./fight.js");
        await fight({ y: nhY, x: nhX }, state.cur_weapon, false);
      } else {
        if (ch !== STAIRS) {
          state.take = ch;
        }
        doMoveStuff(nhY, nhX, fl);
      }
      break;
  }
}

/**
 * doMoveStuff: Handle the actual position update after a valid move.
 */
function doMoveStuff(nhY: number, nhX: number, fl: number): void {
  const backend = getBackend();
  const heroPos = state.player.t_pos;

  // Erase hero from old position
  backend.mvaddch(heroPos.y, heroPos.x, floor_at().charCodeAt(0));

  // Check if leaving a room
  if ((fl & F_PASS) && chat(state.oldpos.y, state.oldpos.x) === DOOR) {
    leave_room({ y: nhY, x: nhX });
  }

  // Update hero position
  state.oldpos.y = heroPos.y;
  state.oldpos.x = heroPos.x;
  heroPos.y = nhY;
  heroPos.x = nhX;
}

/**
 * be_trapped: Handle trap effects.
 * Simplified for Phase 6 milestone.
 */
export async function be_trapped(tc: Coord): Promise<string> {
  // Levitating players don't trigger traps
  if (state.player.t_flags & ISLEVIT) return "";

  const fl = flat(tc.y, tc.x);
  const trapType = fl & F_TMASK;

  switch (trapType) {
    case T_DOOR: // Trapdoor
      state.level++;
      state._newLevel = true;
      await msg("you fell into a trap!");
      return String.fromCharCode(T_DOOR);
    case T_ARROW: { // Arrow trap
      const arrowDmg = roll(1, 6);
      if (state.player.t_stats.s_hpt > arrowDmg) {
        await msg("oh no! An arrow shot you");
      } else {
        await msg("an arrow killed you");
      }
      state.player.t_stats.s_hpt -= arrowDmg;
      break;
    }
    case T_SLEEP: // Sleeping gas
      await msg("a strange white mist envelops you and you fall asleep");
      state.no_command += spread(SLEEPTIME);
      if (state.no_command < 0) state.no_command = 0;
      break;
    case T_BEAR: // Bear trap
      state.no_move += spread(BEARTIME);
      if (state.no_move < 0) state.no_move = 0;
      await msg("you are caught in a bear trap");
      break;
    case T_TELEP: { // Teleport trap
      const backend = getBackend();
      // Erase hero from old position
      backend.mvaddch(state.player.t_pos.y, state.player.t_pos.x,
        floor_at().charCodeAt(0));
      // Teleport to random location
      find_floor(null, state.player.t_pos, false, true);
      enter_room(state.player.t_pos);
      await msg("teleport!");
      return String.fromCharCode(T_TELEP);
    }
    case T_DART: { // Poison dart
      const dartDmg = roll(1, 4);
      state.player.t_stats.s_hpt -= dartDmg;
      if (!ISWEARING(R_SUSTSTR) && !save_throw(0, state.player)) {
        chg_str(-1);
      }
      await msg("a small dart just hit you in the shoulder");
      break;
    }
    case T_RUST: // Rust trap
      await msg("a gush of water hits you on the head");
      rust_armor();
      break;
    case T_MYST: // Mysterious trap
      await msg("you hear a strange humming");
      break;
  }
  return "";
}

/**
 * rust_armor: Rust the player's armor from trap.
 */
function rust_armor(): void {
  if (state.cur_armor === null || state.cur_armor._kind !== "object") return;
  if (ISWEARING(R_SUSTARM)) return;
  const armor = state.cur_armor;
  if (armor.o_flags & 0o40) return; // ISPROT
  armor.o_arm++;
  if (armor.o_arm > 9) armor.o_arm = 9;
}

/**
 * save_throw: Check for a saving throw (local for traps).
 */
function save_throw(which: number, tp: { t_stats: { s_lvl: number } }): boolean {
  const need = 14 - Math.floor(tp.t_stats.s_lvl / 2);
  return roll(1, 20) >= need - which;
}

function roll(number: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < number; i++) {
    total += rnd(sides) + 1;
  }
  return total;
}

/**
 * rndmove: Pick a random valid move for a confused creature.
 */
export function rndmove(who: Monster): Coord {
  const heroPos = who.t_pos;
  const possibleMoves: Coord[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ny = heroPos.y + dy;
      const nx = heroPos.x + dx;

      if (ny <= 0 || ny >= NUMLINES - 1 || nx < 0 || nx >= NUMCOLS) continue;
      if (!diag_ok(heroPos, { y: ny, x: nx })) continue;

      const ch = winat(ny, nx);
      if (step_ok(ch)) {
        possibleMoves.push({ y: ny, x: nx });
      }
    }
  }

  if (possibleMoves.length === 0) {
    return { y: heroPos.y, x: heroPos.x };
  }
  return possibleMoves[rnd(possibleMoves.length)];
}
