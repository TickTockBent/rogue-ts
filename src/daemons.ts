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
  FOOD, AFTER,
} from "./globals.js";
import { rnd } from "./util.js";
import { msg } from "./io.js";
import { start_daemon, kill_daemon, fuse, extinguish } from "./daemon.js";
import { find_floor } from "./rooms.js";
import { new_monster_thing } from "./list.js";
import { new_monster, randmonster } from "./monsters.js";
import { chg_str } from "./misc.js";

// AFTER imported from globals.js

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

  // Ring food drain: each ring adds to digest rate
  if (state.cur_ring[0] !== null && state.cur_ring[0]._kind === "object") {
    digestRate += ring_eat(0);
  }
  if (state.cur_ring[1] !== null && state.cur_ring[1]._kind === "object") {
    digestRate += ring_eat(1);
  }

  // Amulet: if player has it, they need less food
  if (state.amulet) {
    digestRate -= 1;
  }

  if (digestRate > 0) {
    state.food_left -= digestRate;
  } else if (digestRate < 0) {
    state.food_left -= digestRate;
  }

  // C original progression:
  // food_left > 0: decrement normally (handled above)
  // food_left == 0: "hungry"
  // food_left < -MORETIME: "weak"
  // food_left < -2*MORETIME: "faint" with random no_command
  // food_left < -STARVETIME: death
  if (state.food_left <= 0) {
    if (state.food_left < -STARVETIME) {
      // Starved to death
      await msg("you starved to death");
      const { death } = await import("./rip.js");
      await death("s"); // starvation
      return;
    }

    if (state.food_left < -MORETIME * 2) {
      if (state.hungry_state < 3) {
        state.hungry_state = 3;
        await msg(state.terse ? "faint" : "you feel too weak from lack of food");
      }
      // Fainting: random chance of no_command
      if (state.no_command === 0 && rnd(20) === 0) {
        state.no_command = rnd(8) + 4;
        if (!state.terse) {
          await msg("you faint from lack of food");
        } else {
          await msg("faint");
        }
      }
    } else if (state.food_left < -MORETIME) {
      if (state.hungry_state < 2) {
        state.hungry_state = 2;
        await msg(state.terse ? "weak" : "you are starting to feel weak");
      }
    } else {
      if (state.hungry_state < 1) {
        state.hungry_state = 1;
        await msg(state.terse ? "hungry" : "you are starting to get hungry");
      }
    }
  }
}

/**
 * ring_eat: Return the food cost for wearing a ring on a given hand.
 * C original: most rings cost 1 food/turn, slow digestion is negative.
 */
function ring_eat(hand: number): number {
  const ring = state.cur_ring[hand];
  if (ring === null || ring._kind !== "object") return 0;
  if (ring.o_which === 10) { // R_DIGEST
    return -ring.o_arm - 1; // slow digestion saves food
  }
  return 1; // all other rings cost 1 food/turn
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
  const { CANSEE, SEEMONST, ISINVIS } = await import("./globals.js");

  // Clear see-invisible and see-monsters flags
  state.player.t_flags &= ~CANSEE;

  if (state.player.t_flags & SEEMONST) {
    state.player.t_flags &= ~SEEMONST;
  }
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
