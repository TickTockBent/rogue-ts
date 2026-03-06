/**
 * Combat functions.
 * Ported from fight.c
 */

import type { Coord, Thing, Monster, GameObj } from "./types.js";
import {
  state, monsters as monsterTemplates, e_levels,
  ISHUH, ISRUN, ISMEAN, ISHASTE, ISTARGET, ISBLIND, ISCANC, ISHALU,
  CANHUH, SEEMONST,
  R_ADDHIT, R_ADDDAM, R_PROTECT, ISWEARING,
  moat, setMoat,
} from "./globals.js";
import { rnd, on } from "./util.js";
import { msg, addmsg, endmsg, getBackend } from "./io.js";
import { _detach } from "./list.js";
import { set_mname, see_monst, check_level } from "./misc.js";
import { runto } from "./monsters.js";

// Hit/miss message strings
const h_names = [
  " scored an excellent hit on ",
  " hit ",
  " have injured ",
  " swing and hit ",
  " scored an excellent hit on ",
  " hit ",
  " has injured ",
  " swings and hits ",
];

const m_names = [
  " miss",
  " swing and miss",
  " barely miss",
  " don't hit",
  " misses",
  " swings and misses",
  " barely misses",
  " doesn't hit",
];

// Strength adjustments to hit
const str_plus = [
  -7, -6, -5, -4, -3, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1,
  1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3,
];

// Strength adjustments to damage
const add_dam = [
  -7, -6, -5, -4, -3, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3,
  3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6,
];

/**
 * fight: The player attacks the monster.
 */
export async function fight(mp: Coord, weap: Thing | null, thrown: boolean): Promise<boolean> {
  const tp = moat(mp.y, mp.x);
  if (tp === null || tp._kind !== "monster") return false;

  state.count = 0;
  state.quiet = 0;
  runto(mp);

  const mname = set_mname(tp);
  let didHit = false;
  state.has_hit = state.terse && !state.to_death;

  if (roll_em(state.player, tp, weap, thrown)) {
    if (thrown) {
      await thunk(weap, mname, state.terse);
    } else {
      await hit(null, mname, state.terse);
    }

    if (tp.t_stats.s_hpt <= 0) {
      await killed(tp, true);
    }
    didHit = true;
  } else {
    if (thrown) {
      await bounce(weap, mname, state.terse);
    } else {
      await miss(null, mname, state.terse);
    }
  }

  return didHit;
}

/**
 * attack: The monster attacks the player.
 */
export async function attack(mp: Monster): Promise<number> {
  state.running = false;
  state.count = 0;
  state.quiet = 0;

  if (state.to_death && !(mp.t_flags & ISTARGET)) {
    state.to_death = false;
    state.kamikaze = false;
  }

  const mname = set_mname(mp);
  const oldHp = state.player.t_stats.s_hpt;

  if (roll_em(mp, state.player, null, false)) {
    if (state.has_hit) {
      addmsg(".  ");
    }
    await hit(mname, null, false);
    state.has_hit = false;

    if (state.player.t_stats.s_hpt <= 0) {
      // Player dies
      const { death } = await import("./rip.js");
      await death(mp.t_type);
      return 0;
    }

    if (!state.kamikaze) {
      const damage = oldHp - state.player.t_stats.s_hpt;
      if (damage > state.max_hit) {
        state.max_hit = damage;
      }
      if (state.player.t_stats.s_hpt <= state.max_hit) {
        state.to_death = false;
      }
    }
  } else {
    if (state.has_hit) {
      addmsg(".  ");
    }
    await miss(mname, null, false);
  }

  return 1;
}

/**
 * swing: Determine if an attack hits.
 */
export function swing(atLvl: number, opArm: number, wplus: number): boolean {
  const need = 20 - atLvl - opArm + wplus;
  return rollDice(1, 20) >= need;
}

/**
 * roll_em: Roll to see if the attacker hits the defender.
 * Returns true if hit, damages defender.
 */
export function roll_em(
  thatt: Monster,
  thdef: Monster,
  weap: Thing | null,
  hurl: boolean,
): boolean {
  const attStats = thatt.t_stats;
  const defStats = thdef.t_stats;

  // Parse damage string
  let damageStr: string;
  if (weap !== null && weap._kind === "object") {
    damageStr = hurl ? weap.o_hurldmg : weap.o_damage;
  } else {
    damageStr = attStats.s_dmg;
  }

  let didHit = false;
  const isPlayerAttacking = thatt === state.player;
  const isPlayerDefending = thdef === state.player;

  // Each damage component (e.g., "1x8/1x8/2x6")
  const parts = damageStr.split("/");
  for (const part of parts) {
    const match = part.match(/(\d+)x(\d+)/);
    if (!match) continue;

    const ndice = parseInt(match[1], 10);
    const nsides = parseInt(match[2], 10);

    // Determine to-hit bonus
    let hplus = 0;
    let dplus = 0;

    if (weap !== null && weap._kind === "object") {
      hplus = weap.o_hplus;
      dplus = weap.o_dplus;
    }

    if (isPlayerAttacking) {
      const strIdx = Math.min(attStats.s_str, 31);
      hplus += str_plus[strIdx];
      dplus += add_dam[strIdx];

      // Ring bonuses
      if (ISWEARING(R_ADDHIT)) {
        const ring = state.cur_ring[0];
        if (ring !== null && ring._kind === "object" && ring.o_which === R_ADDHIT) {
          hplus += ring.o_arm;
        }
        const ring2 = state.cur_ring[1];
        if (ring2 !== null && ring2._kind === "object" && ring2.o_which === R_ADDHIT) {
          hplus += ring2.o_arm;
        }
      }
      if (ISWEARING(R_ADDDAM)) {
        const ring = state.cur_ring[0];
        if (ring !== null && ring._kind === "object" && ring.o_which === R_ADDDAM) {
          dplus += ring.o_arm;
        }
        const ring2 = state.cur_ring[1];
        if (ring2 !== null && ring2._kind === "object" && ring2.o_which === R_ADDDAM) {
          dplus += ring2.o_arm;
        }
      }
    }

    // Check if this attack hits
    if (swing(attStats.s_lvl, defStats.s_arm, hplus)) {
      let damage = rollDice(ndice, nsides) + dplus;
      if (damage < 0) damage = 0;
      defStats.s_hpt -= damage;
      didHit = true;
    }
  }

  return didHit;
}

/**
 * hit: Print a hit message.
 */
export async function hit(er: string | null, ee: string | null, noend: boolean): Promise<void> {
  const attackerName = er === null ? "you" : er;
  const defenderName = ee === null ? "you" : ee;
  const idx = er === null ? rnd(4) : rnd(4) + 4;

  addmsg(attackerName + h_names[idx] + defenderName);
  if (!noend) {
    await endmsg();
  }
}

/**
 * miss: Print a miss message.
 */
export async function miss(er: string | null, ee: string | null, noend: boolean): Promise<void> {
  const attackerName = er === null ? "you" : er;
  const defenderName = ee === null ? " you" : " " + ee;

  addmsg(attackerName + m_names[er === null ? rnd(4) : rnd(4) + 4] + defenderName);
  if (!noend) {
    await endmsg();
  }
}

/**
 * thunk: Print a thrown weapon hit message.
 */
export async function thunk(weap: Thing | null, mname: string, noend: boolean): Promise<void> {
  addmsg("the missile hit " + mname);
  if (!noend) {
    await endmsg();
  }
}

/**
 * bounce: Print a thrown weapon miss message.
 */
export async function bounce(weap: Thing | null, mname: string, noend: boolean): Promise<void> {
  addmsg("the missile misses " + mname);
  if (!noend) {
    await endmsg();
  }
}

/**
 * killed: Called when a monster has been killed.
 */
export async function killed(tp: Monster, pr: boolean): Promise<void> {
  const monsterIndex = tp.t_type.charCodeAt(0) - "A".charCodeAt(0);
  const mname = monsterTemplates[monsterIndex].m_name;

  if (pr) {
    if (state.has_hit) {
      addmsg(".  ");
      state.has_hit = false;
    }
    addmsg("you defeated ");
    await msg("the %s", mname);
  }

  state.player.t_stats.s_exp += tp.t_stats.s_exp;
  await check_level();

  // Remove monster from the map
  remove_mon(tp.t_pos, tp, true);
}

/**
 * remove_mon: Remove a monster from the level.
 */
export function remove_mon(mp: Coord, tp: Monster, wasKill: boolean): void {
  const backend = getBackend();

  // Detach from monster list
  const mlistHead = { head: state.mlist };
  _detach(mlistHead, tp);
  state.mlist = mlistHead.head;

  // Restore the character on the map
  setMoat(mp.y, mp.x, null);

  const oldCh = tp.t_oldch;
  if (see_monst(tp)) {
    backend.mvaddch(mp.y, mp.x, oldCh.charCodeAt(0));
  }

  // Drop any items the monster was carrying
  // (simplified — full drop logic in Phase 7)
}

function rollDice(number: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < number; i++) {
    total += rnd(sides) + 1;
  }
  return total;
}
