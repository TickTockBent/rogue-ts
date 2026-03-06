/**
 * Hero movement commands.
 * Ported from move.c
 */

import type { Coord, Monster, Thing } from "./types.js";
import {
  state, NUMCOLS, NUMLINES,
  FLOOR, PASSAGE, DOOR, TRAP, STAIRS, PLAYER,
  ISHUH, ISLEVIT, ISHELD, ISBLIND, ISGONE,
  F_PASS, F_REAL, F_PNUM,
  INDEX, chat, setCh, flat, setFlat, moat, winat,
  T_DOOR, T_TELEP, ESCAPE,
} from "./globals.js";
import { rnd, ce } from "./util.js";
import { msg, step_ok, getBackend } from "./io.js";
import { diag_ok, floor_at } from "./misc.js";
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
      state.take = ch;
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
  const fl = flat(tc.y, tc.x);
  const trapType = fl & 0x07; // F_TMASK

  switch (trapType) {
    case 0: // T_DOOR - trapdoor
      await msg("you fell into a trap!");
      state.level++;
      // new_level will be called by the game loop
      return String.fromCharCode(T_DOOR);
    case 1: // T_ARROW
      await msg("oh no! An arrow shot you");
      state.player.t_stats.s_hpt -= roll(1, 6);
      break;
    case 2: // T_SLEEP
      await msg("a strange white mist envelops you and you fall asleep");
      state.no_command += rnd(10) + 4;
      break;
    case 3: // T_BEAR
      await msg("you are caught in a bear trap");
      state.no_move += 2;
      break;
    case 4: // T_TELEP
      await msg("teleport!");
      // Teleport to random location
      find_floor(null, state.player.t_pos, false, true);
      enter_room(state.player.t_pos);
      return String.fromCharCode(T_TELEP);
    case 5: // T_DART
      await msg("a small dart just hit you in the shoulder");
      state.player.t_stats.s_hpt -= roll(1, 4);
      break;
    case 6: // T_RUST
      await msg("a gush of water hits you on the head");
      break;
    case 7: // T_MYST
      await msg("you hear a strange humming");
      break;
  }
  return "";
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
