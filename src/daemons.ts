/**
 * Daemon callbacks.
 * Ported from daemon.c / daemons.c
 *
 * These are the actual callback functions invoked by the daemon/fuse system.
 * doctor()   — heals the player over time
 * stomach()  — handles hunger
 * swander()  — starts wandering monsters
 * rollwand() — creates wandering monsters
 * unconfuse() — removes confusion
 * unsee()     — removes see-invisible
 * sight()     — restores sight
 * nohaste()   — removes haste
 */

import type { Coord, Monster } from "./types.js";
import {
  state, HUNGERTIME, MORETIME, STOMACHSIZE, STARVETIME,
  ISRUN, ISHASTE, ISHUH, ISBLIND, ISREGEN, ISLEVIT,
  ISWEARING, R_REGEN, R_SUSTSTR,
  FOOD,
} from "./globals.js";
import { rnd } from "./util.js";
import { msg } from "./io.js";
import { start_daemon, kill_daemon, fuse, extinguish } from "./daemon.js";
import { find_floor } from "./rooms.js";
import { new_monster_thing } from "./list.js";
import { new_monster, randmonster } from "./monsters.js";
import { chg_str } from "./misc.js";

const AFTER = 2; // daemon type flag — match C original

/**
 * doctor: A healing daemon that restores hit points over time.
 */
export async function doctor(_arg: number): Promise<void> {
  const playerStats = state.player.t_stats;
  const maxStats = state.max_stats;

  state.quiet++;

  // Regen ring bonus
  if (ISWEARING(R_REGEN) || (state.player.t_flags & ISREGEN)) {
    playerStats.s_hpt++;
    if (playerStats.s_hpt > playerStats.s_maxhp) {
      playerStats.s_hpt = playerStats.s_maxhp;
    }
  }

  let healInterval: number;
  if (playerStats.s_lvl < 8) {
    healInterval = 21 - playerStats.s_lvl * 2;
  } else {
    healInterval = 3;
  }

  if (state.quiet > healInterval) {
    state.quiet = 0;
    playerStats.s_hpt++;
    if (playerStats.s_hpt > playerStats.s_maxhp) {
      playerStats.s_hpt = playerStats.s_maxhp;
    }
  }
}

/**
 * stomach: Digest food, handle hunger states.
 */
export async function stomach(_arg: number): Promise<void> {
  let digestRate = 1;

  // Rings of digestion speed it up or slow it down
  if (state.cur_ring[0] !== null && state.cur_ring[0]._kind === "object" &&
      state.cur_ring[0].o_which === 10) { // R_DIGEST
    digestRate -= state.cur_ring[0].o_arm;
  }
  if (state.cur_ring[1] !== null && state.cur_ring[1]._kind === "object" &&
      state.cur_ring[1].o_which === 10) { // R_DIGEST
    digestRate -= state.cur_ring[1].o_arm;
  }

  if (digestRate > 0) {
    state.food_left -= digestRate;
  } else if (digestRate < 0) {
    state.food_left -= digestRate;
  }

  if (state.food_left <= 0) {
    if (state.food_left < -STARVETIME) {
      // Starved to death
      await msg("you starved to death");
      const { death } = await import("./rip.js");
      await death("s"); // starvation
      return;
    }
    if (state.hungry_state < 3) {
      if (state.food_left < -MORETIME * 2) {
        state.hungry_state = 3;
        await msg(state.terse ? "faint" : "you feel too weak from lack of food");
      } else if (state.food_left < -MORETIME) {
        state.hungry_state = 2;
        await msg(state.terse ? "weak" : "you are starting to feel weak");
      } else {
        state.hungry_state = 1;
        await msg(state.terse ? "hungry" : "you are starting to get hungry");
      }
    }
  }
}

/**
 * swander: Start wandering monster generation fuse.
 */
export async function swander(_arg: number): Promise<void> {
  kill_daemon(swander);
  fuse(rollwand, 0, rnd(4) + 1, AFTER);
}

/**
 * rollwand: Create a wandering monster.
 */
export async function rollwand(_arg: number): Promise<void> {
  wanderer();
  start_daemon(swander, 0, AFTER);
}

/**
 * wanderer: Create a new wandering monster and aim it at the player.
 */
function wanderer(): void {
  const monsterCoord: Coord = { y: 0, x: 0 };
  if (!find_floor(null, monsterCoord, false, true)) {
    return;
  }

  const monsterThing = new_monster_thing();
  new_monster(monsterThing, randmonster(true), monsterCoord);
  monsterThing.t_flags |= ISRUN;
  monsterThing.t_dest = state.player.t_pos;
}

/**
 * unconfuse: Remove confusion from the player.
 */
export async function unconfuse(_arg: number): Promise<void> {
  state.player.t_flags &= ~ISHUH;
  await msg("you feel less %s now", state.player.t_flags & 0 ? "" : "confused");
}

/**
 * unsee: Remove see-invisible from the player.
 */
export async function unsee(_arg: number): Promise<void> {
  // Stub for now — in the full game this would remove see-invisible monsters
}

/**
 * sight: Restore sight (remove blindness).
 */
export async function sight(_arg: number): Promise<void> {
  if (state.player.t_flags & ISBLIND) {
    state.player.t_flags &= ~ISBLIND;
    if (!(state.player.t_flags & ISBLIND)) {
      await msg("the veil of darkness lifts");
    }
  }
}

/**
 * nohaste: Remove haste from the player.
 */
export async function nohaste(_arg: number): Promise<void> {
  state.player.t_flags &= ~ISHASTE;
  await msg("you feel yourself slowing down");
}
