/**
 * Monster AI — chase and movement.
 * Ported from chase.c
 */

import type { Coord, Thing, Monster, Room } from "./types.js";
import {
  state, NUMLINES, NUMCOLS,
  FLOOR, PASSAGE, DOOR, GOLD,
  ISRUN, ISHELD, ISSLOW, ISHASTE, ISINVIS, ISFLY, ISGREED, ISMEAN, ISCANC,
  ISGONE, ISDARK, CANSEE,
  F_PASS,
  INDEX, chat, flat, moat, setMoat, winat,
} from "./globals.js";
import { rnd, sign, ce } from "./util.js";
import { step_ok, getBackend } from "./io.js";
import { diag_ok, see_monst, cansee } from "./misc.js";
import { attack } from "./fight.js";
import { roomin } from "./rooms.js";

/**
 * runners: Make all running monsters move.
 * C original: haste monsters get a double turn.
 */
export async function runners(): Promise<void> {
  let tp = state.mlist;
  while (tp !== null) {
    const next = tp.l_next; // save next before potential removal
    if (tp._kind === "monster" && (tp.t_flags & ISRUN)) {
      if (!(tp.t_flags & ISHELD)) {
        // Slow monsters only move every other turn
        if (tp.t_flags & ISSLOW) {
          tp.t_turn = !tp.t_turn;
          if (!tp.t_turn) {
            tp = next;
            continue;
          }
        }

        // First move
        await do_chase(tp);

        // Haste: double move (C original: ntimes=2 for ISHASTE)
        if (tp.t_flags & ISHASTE) {
          await do_chase(tp);
        }
      }
    }
    tp = next;
  }
}

/**
 * do_chase: Make one monster chase/move.
 */
export async function do_chase(tp: Monster): Promise<void> {
  const backend = getBackend();
  const heroPos = state.player.t_pos;

  // Flytrap (F): stationary — only attacks adjacent hero
  if (tp.t_type === "F") {
    if (Math.abs(tp.t_pos.y - heroPos.y) <= 1 &&
        Math.abs(tp.t_pos.x - heroPos.x) <= 1) {
      await attack(tp);
    }
    return;
  }

  // Set destination
  // ISGREED: chase nearest gold pile if not carrying gold
  if ((tp.t_flags & ISGREED) && tp.t_reserved === 0) {
    let bestGold: Coord | null = null;
    let bestDist = Infinity;
    let item = state.lvl_obj;
    while (item !== null) {
      if (item._kind === "object" && item.o_type === GOLD.charCodeAt(0)) {
        const dist = (item.o_pos.x - tp.t_pos.x) ** 2 +
                     (item.o_pos.y - tp.t_pos.y) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestGold = item.o_pos;
        }
      }
      item = item.l_next;
    }
    tp.t_dest = bestGold !== null ? bestGold : heroPos;
  } else {
    tp.t_dest = heroPos;
  }

  const dest = tp.t_dest;

  // Find direction to move
  const newPos = chase(tp, dest);
  if (newPos === null) return;

  // Check if monster reached the hero
  if (ce(newPos, heroPos)) {
    await attack(tp);
    return;
  }

  // Move the monster
  const oldPos = { y: tp.t_pos.y, x: tp.t_pos.x };
  const oldRoom = tp.t_room;
  const newRoom = roomin(newPos);

  // Erase from old position if visible
  if (see_monst(tp)) {
    backend.mvaddch(oldPos.y, oldPos.x, tp.t_oldch.charCodeAt(0));
  }

  // Update moat
  setMoat(oldPos.y, oldPos.x, null);

  // Save character at new position before placing monster
  tp.t_oldch = chat(newPos.y, newPos.x);

  tp.t_pos = { y: newPos.y, x: newPos.x };
  setMoat(newPos.y, newPos.x, tp);
  tp.t_room = newRoom;

  // If leaving a room to a passage in a dark room, erase the door area
  if (oldRoom !== null && oldRoom !== newRoom &&
      (oldRoom.r_flags & ISDARK) && !(oldRoom.r_flags & ISGONE)) {
    // Monster left a dark room — it was visible at the door, now gone
  }

  // Draw monster at new position if visible
  if (see_monst(tp)) {
    backend.mvaddch(newPos.y, newPos.x, tp.t_disguise.charCodeAt(0));
  }
}

/**
 * chase: Find best adjacent cell to move toward destination.
 * C original: in passages, no diagonal movement.
 */
function chase(tp: Monster, dest: Coord): Coord | null {
  const curPos = tp.t_pos;
  let bestDist = Infinity;
  let bestPos: Coord | null = null;

  // Check if monster is in a passage (no diagonal movement allowed)
  const inPassage = (flat(curPos.y, curPos.x) & F_PASS) !== 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dy === 0 && dx === 0) continue;

      // C original: no diagonal movement in passages
      if (inPassage && dy !== 0 && dx !== 0) continue;

      const ny = curPos.y + dy;
      const nx = curPos.x + dx;

      if (ny <= 0 || ny >= NUMLINES - 1 || nx < 0 || nx >= NUMCOLS) continue;
      if (!diag_ok(curPos, { y: ny, x: nx })) continue;

      const ch = winat(ny, nx);

      // Can the monster step here?
      if (!step_ok(ch) && (ny !== dest.y || nx !== dest.x)) continue;

      // Don't step on other monsters (unless it's the hero's position)
      if (moat(ny, nx) !== null &&
          !(ny === state.player.t_pos.y && nx === state.player.t_pos.x)) continue;

      const distance = (dest.x - nx) * (dest.x - nx) +
                       (dest.y - ny) * (dest.y - ny);
      if (distance < bestDist) {
        bestDist = distance;
        bestPos = { y: ny, x: nx };
      }
    }
  }

  return bestPos;
}
