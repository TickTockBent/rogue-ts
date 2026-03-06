/**
 * Monster AI — chase and movement.
 * Ported from chase.c — simplified for Phase 6 milestone.
 */

import type { Coord, Thing, Monster, Room } from "./types.js";
import {
  state, NUMLINES, NUMCOLS,
  FLOOR, PASSAGE, DOOR,
  ISRUN, ISHELD, ISSLOW, ISHASTE, ISINVIS, ISFLY,
  F_PASS,
  INDEX, chat, flat, moat, setMoat, winat,
} from "./globals.js";
import { rnd, sign, ce } from "./util.js";
import { step_ok, getBackend } from "./io.js";
import { diag_ok } from "./misc.js";
import { attack } from "./fight.js";
import { roomin } from "./rooms.js";

/**
 * runners: Make all running monsters move.
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

        await do_chase(tp);

        // Fast monsters get an extra move
        if ((tp.t_flags & ISHASTE) && tp.l_next !== null) {
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

  // Determine where the monster wants to go
  const dest = tp.t_dest || heroPos;

  // Find direction to move
  const chaseResult = chase(tp, dest);
  if (chaseResult === null) return;

  const newPos = chaseResult;

  // Check if monster reached the hero
  if (ce(newPos, heroPos)) {
    await attack(tp);
    return;
  }

  // Move the monster
  const oldPos = { y: tp.t_pos.y, x: tp.t_pos.x };

  // Erase old position if visible
  const oldCh = tp.t_oldch;
  if (backend.mvinch(oldPos.y, oldPos.x) !== " ".charCodeAt(0)) {
    backend.mvaddch(oldPos.y, oldPos.x, oldCh.charCodeAt(0));
  }

  // Update monster position
  setMoat(oldPos.y, oldPos.x, null);
  tp.t_pos = { y: newPos.y, x: newPos.x };
  setMoat(newPos.y, newPos.x, tp);

  // Save character at new position
  tp.t_oldch = chat(newPos.y, newPos.x);
  tp.t_room = roomin(newPos);

  // Draw monster at new position if visible
  // (simplified visibility check)
  const playerRoom = state.player.t_room;
  const monsterRoom = tp.t_room;
  if (monsterRoom !== null && monsterRoom === playerRoom && !(tp.t_flags & ISINVIS)) {
    backend.mvaddch(newPos.y, newPos.x, tp.t_disguise.charCodeAt(0));
  }
}

/**
 * chase: Find direction to chase toward destination.
 */
function chase(tp: Monster, dest: Coord): Coord | null {
  const curPos = tp.t_pos;
  let bestDist = Infinity;
  let bestPos: Coord | null = null;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dy === 0 && dx === 0) continue;

      const ny = curPos.y + dy;
      const nx = curPos.x + dx;

      if (ny <= 0 || ny >= NUMLINES - 1 || nx < 0 || nx >= NUMCOLS) continue;
      if (!diag_ok(curPos, { y: ny, x: nx })) continue;

      const ch = winat(ny, nx);

      // Can the monster step here?
      if (!step_ok(ch) && (ny !== dest.y || nx !== dest.x)) continue;

      // Don't step on other monsters (unless it's the hero)
      if (moat(ny, nx) !== null && !(ny === dest.y && nx === dest.x)) continue;

      const distance = (dest.x - nx) * (dest.x - nx) + (dest.y - ny) * (dest.y - ny);
      if (distance < bestDist) {
        bestDist = distance;
        bestPos = { y: ny, x: nx };
      }
    }
  }

  return bestPos;
}
