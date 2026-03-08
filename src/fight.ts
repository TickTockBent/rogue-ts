/**
 * Combat functions.
 * Ported from fight.c
 */

import type { Coord, Thing, Monster, GameObj } from "./types.js";
import {
  state, monsters as monsterTemplates, e_levels,
  ISHUH, ISRUN, ISMEAN, ISHASTE, ISTARGET, ISBLIND, ISCANC, ISHALU, ISHELD,
  CANHUH, SEEMONST, CANSEE, ISINVIS,
  R_ADDHIT, R_ADDDAM, R_PROTECT, R_SUSTSTR, R_SUSTARM, ISWEARING,
  VS_POISON, VS_MAGIC,
  ARMOR_TYPE,
  ISCURSED, ISPROT,
  moat, setMoat,
} from "./globals.js";
import { rnd } from "./util.js";
import { msg, addmsg, endmsg, getBackend } from "./io.js";
import { _detach } from "./list.js";
import { set_mname, see_monst, check_level, chg_str } from "./misc.js";
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

  // Xeroc: reveal on first attack if disguised
  if (tp.t_type === "X" && tp.t_disguise !== "X" && !thrown) {
    tp.t_disguise = "X";
    const backend = getBackend();
    if (see_monst(tp)) {
      backend.mvaddch(mp.y, mp.x, "X".charCodeAt(0));
    }
  }

  const mname = set_mname(tp);
  let didHit = false;
  state.has_hit = state.terse && !state.to_death;

  if (roll_em(state.player, tp, weap, thrown)) {
    if (thrown) {
      await thunk(weap, mname, state.terse);
    } else {
      await hit(null, mname, state.terse);
    }

    // CANHUH confusion transfer: if player has CANHUH and hits, confuse the monster
    if (!thrown && (state.player.t_flags & CANHUH) && !(tp.t_flags & ISCANC)) {
      await msg("your hands stop glowing %s", "red");
      state.player.t_flags &= ~CANHUH;
      tp.t_flags |= ISHUH;
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

    // Apply monster special attack effects
    await special_hit(mp);

    if (state.player.t_stats.s_hpt <= 0) {
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
  const need = 20 - atLvl - opArm;
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

      // Sleeping monster bonus: +4 to hit if monster isn't running
      if (!isPlayerDefending && thdef !== state.player && !(thdef.t_flags & ISRUN)) {
        hplus += 4;
      }

      // Launcher bonus: if hurling a missile with matching launcher
      if (hurl && weap !== null && weap._kind === "object" && weap.o_launch >= 0) {
        const curWeap = state.cur_weapon;
        if (curWeap !== null && curWeap._kind === "object" && curWeap.o_which === weap.o_launch) {
          hplus += curWeap.o_hplus;
          dplus += curWeap.o_dplus;
        }
      }

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

    // Determine defender's armor class
    let defArm = defStats.s_arm;
    if (isPlayerDefending) {
      if (state.cur_armor !== null && state.cur_armor._kind === "object") {
        defArm = state.cur_armor.o_arm;
      }
      // R_PROTECT ring bonus
      if (ISWEARING(R_PROTECT)) {
        for (let hand = 0; hand < 2; hand++) {
          const ring = state.cur_ring[hand];
          if (ring !== null && ring._kind === "object" && ring.o_which === R_PROTECT) {
            defArm -= ring.o_arm;
          }
        }
      }
    }

    // Check if this attack hits
    if (swing(attStats.s_lvl, defArm, hplus)) {
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

  // Flytrap death: release the player
  if (tp.t_type === "F") {
    state.player.t_flags &= ~ISHELD;
    state.vf_hit = 0;
  }

  // Leprechaun death: drop stolen gold
  if (tp.t_type === "L" && tp.t_reserved > 0) {
    state.purse += tp.t_reserved;
    await msg("you find %d gold pieces", tp.t_reserved);
    tp.t_reserved = 0;
  }

  // Remove monster from the map
  await remove_mon(tp.t_pos, tp, true);
}

/**
 * remove_mon: Remove a monster from the level.
 */
export async function remove_mon(mp: Coord, tp: Monster, wasKill: boolean): Promise<void> {
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
  if (tp.t_pack !== null) {
    const { _attach: attachItem } = await import("./list.js");
    const { setCh: setChAt, flat: flatAt, setFlat: setFlatAt, F_DROPPED: fDropped } = await import("./globals.js");
    let item: Thing | null = tp.t_pack;
    while (item !== null) {
      const next: Thing | null = item.l_next;
      item.l_next = null;
      item.l_prev = null;
      if (item._kind === "object") {
        item.o_pos.y = mp.y;
        item.o_pos.x = mp.x;
        const typeCh = String.fromCharCode(item.o_type);
        const listHead = { head: state.lvl_obj };
        attachItem(listHead, item);
        state.lvl_obj = listHead.head;
        setChAt(mp.y, mp.x, typeCh);
        setFlatAt(mp.y, mp.x, flatAt(mp.y, mp.x) | fDropped);
      }
      item = next;
    }
    tp.t_pack = null;
  }
}

/**
 * save_throw: See if a save throw is successful.
 * C original: need = 14 - tp->t_stats.s_lvl / 2; roll(1,20) >= need - which
 */
export function save_throw(which: number, tp: Monster): boolean {
  const need = 14 - Math.floor(tp.t_stats.s_lvl / 2);
  return rollDice(1, 20) >= need - which;
}

/**
 * special_hit: Handle monster special attack effects after a hit.
 */
async function special_hit(mp: Monster): Promise<void> {
  if (mp.t_flags & ISCANC) return;

  switch (mp.t_type) {
    case "A": // Aquator — rust armor
      await rust_armor(mp);
      break;
    case "I": // Ice Monster — freeze player
      state.no_command += rnd(2) + 2;
      if (state.no_command > 1) {
        await msg("you are frozen");
      }
      break;
    case "R": // Rattlesnake — poison
      if (!save_throw(VS_POISON, state.player) && !ISWEARING(R_SUSTSTR)) {
        chg_str(-1);
        await msg("you feel a bite in your leg and now feel weaker");
      }
      break;
    case "W": // Wraith — drain experience level
      if (rnd(100) < 15) {
        const playerStats = state.player.t_stats;
        if (playerStats.s_exp === 0) {
          // Already at minimum
          const { death } = await import("./rip.js");
          await death("W");
        } else {
          playerStats.s_exp = Math.floor(playerStats.s_exp / 2);
          if (playerStats.s_lvl > 1) {
            playerStats.s_lvl--;
            const lostHp = rollDice(1, 10);
            playerStats.s_maxhp -= lostHp;
            if (playerStats.s_maxhp < 2) playerStats.s_maxhp = 2;
            if (playerStats.s_hpt > playerStats.s_maxhp) {
              playerStats.s_hpt = playerStats.s_maxhp;
            }
          }
          await msg("you suddenly feel weaker");
        }
      }
      break;
    case "F": // Venus Flytrap — hold and digest
      state.player.t_flags |= ISHELD;
      state.vf_hit++;
      if (state.vf_hit >= mp.t_stats.s_dmg.split("/").length) {
        // Already got max hits, digest
        const damage = (state.vf_hit + 1) * 2;
        state.player.t_stats.s_hpt -= damage;
      }
      break;
    case "L": // Leprechaun — steal gold
      if (state.purse > 0) {
        const stolen = rollDice(1, 10) * 50;
        const actualStolen = Math.min(stolen, state.purse);
        state.purse -= actualStolen;
        mp.t_reserved = actualStolen; // store stolen gold for drop on death
        await msg("your purse feels lighter");
      }
      break;
    case "N": // Nymph — steal a random item
      {
        let count = 0;
        let item = state.player.t_pack;
        while (item !== null) {
          count++;
          item = item.l_next;
        }
        if (count > 0) {
          let target = rnd(count);
          item = state.player.t_pack;
          while (item !== null && target > 0) {
            target--;
            item = item.l_next;
          }
          if (item !== null && item._kind === "object") {
            if (item === state.cur_armor) state.cur_armor = null;
            if (item === state.cur_weapon) state.cur_weapon = null;
            if (item === state.cur_ring[0]) state.cur_ring[0] = null;
            if (item === state.cur_ring[1]) state.cur_ring[1] = null;
            const packIdx = item.o_packch.charCodeAt(0) - "a".charCodeAt(0);
            if (packIdx >= 0 && packIdx < 26) state.pack_used[packIdx] = false;
            const packHead = { head: state.player.t_pack as Thing | null };
            _detach(packHead, item);
            state.player.t_pack = packHead.head;
            state.inpack--;
            const { inv_name: invName } = await import("./things.js");
            await msg("she stole %s!", invName(item, false));
          }
        }
      }
      break;
    case "V": // Vampire — drain max HP
      if (!save_throw(VS_MAGIC, state.player)) {
        const playerStats = state.player.t_stats;
        playerStats.s_maxhp -= 1;
        if (playerStats.s_hpt > playerStats.s_maxhp) {
          playerStats.s_hpt = playerStats.s_maxhp;
        }
        if (playerStats.s_maxhp <= 0) {
          const { death } = await import("./rip.js");
          await death("V");
        }
        await msg("you feel weaker");
      }
      break;
  }
}

/**
 * rust_armor: Rust the player's armor (called by Aquator hit and rust trap).
 */
async function rust_armor(mp: Monster | null): Promise<void> {
  if (state.cur_armor === null || state.cur_armor._kind !== "object") return;
  if (ISWEARING(R_SUSTARM)) {
    if (mp !== null) {
      await msg("the %s's hit doesn't affect your armor", monsterTemplates[mp.t_type.charCodeAt(0) - "A".charCodeAt(0)].m_name);
    }
    return;
  }
  if (state.cur_armor.o_flags & ISPROT) return;
  const armor = state.cur_armor;
  armor.o_arm++;
  if (armor.o_arm > 9) armor.o_arm = 9;
  await msg("your armor appears to be weaker");
}

function rollDice(number: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < number; i++) {
    total += rnd(sides) + 1;
  }
  return total;
}
