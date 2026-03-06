/**
 * Ring functions.
 * Ported from rings.c
 */

import type { GameObj, Thing } from "./types.js";
import {
  state,
  RING, ring_info,
  R_ADDSTR, R_PROTECT, R_ADDHIT, R_ADDDAM,
  R_AGGR, R_TELEPORT, R_SEEINVIS, R_SUSTSTR,
  R_SEARCH, R_STEALTH, R_NOP, R_REGEN, R_DIGEST, R_SUSTARM,
  ISCURSED, ISKNOW,
  LEFT, RIGHT, ESCAPE,
} from "./globals.js";
import { msg, readchar } from "./io.js";
import { get_item } from "./pack.js";
import { inv_name } from "./things.js";
import { chg_str } from "./misc.js";

/**
 * ring_on: Put on a ring.
 */
export async function ring_on(): Promise<void> {
  if (state.cur_ring[LEFT] !== null && state.cur_ring[RIGHT] !== null) {
    if (!state.terse) {
      await msg("you already have a ring on each hand");
    } else {
      await msg("wearing two");
    }
    return;
  }

  const obj = await get_item("put on", RING.charCodeAt(0));
  if (obj === null) return;

  if (obj.o_type !== RING.charCodeAt(0)) {
    await msg("that's not a ring");
    return;
  }

  // Pick which hand
  let hand: number;
  if (state.cur_ring[LEFT] === null && state.cur_ring[RIGHT] === null) {
    if (!state.terse) {
      await msg("put it on which hand (left or right)?");
    } else {
      await msg("which hand?");
    }
    const ch = await readchar();
    if (ch === "l" || ch === "L") {
      hand = LEFT;
    } else if (ch === "r" || ch === "R") {
      hand = RIGHT;
    } else {
      await msg("please type left hand or right hand");
      return;
    }
  } else if (state.cur_ring[LEFT] === null) {
    hand = LEFT;
  } else {
    hand = RIGHT;
  }

  if (state.cur_ring[hand] !== null) {
    if (!state.terse) {
      await msg("you are already wearing a ring on that hand");
    } else {
      await msg("already wearing one");
    }
    return;
  }

  state.cur_ring[hand] = obj;

  // Apply ring effects
  switch (obj.o_which) {
    case R_ADDSTR:
      chg_str(obj.o_arm);
      break;
    case R_SEEINVIS:
      // Show invisible monsters
      state.player.t_flags &= ~0; // placeholder — full see_monst update deferred
      break;
    case R_AGGR:
      {
        const { aggravate } = await import("./scrolls.js");
        aggravate();
      }
      break;
  }

  if (!state.terse) {
    await msg("you are now wearing %s (%s)",
      inv_name(obj, false), obj.o_packch);
  } else {
    await msg("wearing %s (%s)", inv_name(obj, false), obj.o_packch);
  }
}

/**
 * ring_off: Take off a ring.
 */
export async function ring_off(): Promise<void> {
  if (state.cur_ring[LEFT] === null && state.cur_ring[RIGHT] === null) {
    if (!state.terse) {
      await msg("you aren't wearing any rings");
    } else {
      await msg("no rings");
    }
    return;
  }

  let hand: number;
  if (state.cur_ring[LEFT] !== null && state.cur_ring[RIGHT] !== null) {
    if (!state.terse) {
      await msg("which hand (left or right)?");
    } else {
      await msg("which hand?");
    }
    const ch = await readchar();
    if (ch === "l" || ch === "L") {
      hand = LEFT;
    } else if (ch === "r" || ch === "R") {
      hand = RIGHT;
    } else {
      await msg("please type left hand or right hand");
      return;
    }
  } else if (state.cur_ring[LEFT] !== null) {
    hand = LEFT;
  } else {
    hand = RIGHT;
  }

  const ring = state.cur_ring[hand];
  if (ring === null) {
    await msg("not wearing a ring on that hand");
    return;
  }

  if (ring._kind !== "object") return;

  if (ring.o_flags & ISCURSED) {
    await msg("you can't.  It appears to be cursed");
    return;
  }

  // Remove ring effects
  switch (ring.o_which) {
    case R_ADDSTR:
      chg_str(-ring.o_arm);
      break;
    case R_SEEINVIS:
      // Invisible monsters become invisible again
      break;
  }

  state.cur_ring[hand] = null;
  await msg("was wearing %s (%s)", inv_name(ring, true), ring.o_packch);
}
