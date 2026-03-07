/**
 * Potion functions.
 * Ported from potions.c
 */

import type { Monster, GameObj, Thing } from "./types.js";
import {
  state,
  POTION, pot_info,
  P_CONFUSE, P_LSD, P_POISON, P_STRENGTH, P_SEEINVIS,
  P_HEALING, P_MFIND, P_TFIND, P_RAISE, P_XHEAL,
  P_HASTE, P_RESTORE, P_BLIND, P_LEVIT,
  ISHUH, ISHASTE, ISBLIND, ISLEVIT, ISINVIS, SEEMONST, ISHALU, CANSEE,
  HUHDURATION, SEEDURATION, AFTER,
  ISWEARING, R_SUSTSTR,
  moat, NUMLINES, NUMCOLS,
  e_levels,
} from "./globals.js";
import { rnd, spread } from "./util.js";
import { msg, getBackend, status } from "./io.js";
import { get_item } from "./pack.js";
import { inv_name } from "./things.js";
import { chg_str, check_level, see_monst } from "./misc.js";
import { start_daemon, fuse, extinguish, lengthen } from "./daemon.js";
import { unconfuse, unsee, sight, nohaste } from "./daemons.js";

/**
 * quaff: Drink a potion.
 */
export async function quaff(): Promise<void> {
  const obj = await get_item("quaff", POTION.charCodeAt(0));
  if (obj === null) return;

  if (obj.o_type !== POTION.charCodeAt(0)) {
    await msg("that's not something you can drink");
    return;
  }

  // Identify the potion type since we're drinking it
  const wasKnown = pot_info[obj.o_which].oi_know;

  switch (obj.o_which) {
    case P_CONFUSE:
      state.player.t_flags |= ISHUH;
      fuse(unconfuse, 0, spread(HUHDURATION), AFTER);
      if (!pot_info[P_CONFUSE].oi_know) {
        await msg("wait, what's going on here. Huh? What? Who?");
      } else {
        await msg("you feel confused");
      }
      break;

    case P_LSD:
      state.player.t_flags |= ISHALU;
      fuse(unsee, 0, spread(SEEDURATION), AFTER);
      if (!pot_info[P_LSD].oi_know) {
        await msg("oh, wow!  Everything seems so cosmic!");
      } else {
        await msg("you start hallucinating");
      }
      break;

    case P_POISON:
      if (!ISWEARING(R_SUSTSTR)) {
        chg_str(-(rnd(3) + 1));
        await msg("you feel very sick now");
      } else {
        await msg("you feel momentarily nauseous");
      }
      break;

    case P_STRENGTH:
      chg_str(1);
      await msg("you feel stronger, now.  What bulging muscles!");
      break;

    case P_SEEINVIS:
      // Set CANSEE flag on the player
      state.player.t_flags |= CANSEE;
      // Show invisible monsters
      if (!(state.player.t_flags & ISBLIND)) {
        let monsterItem: Thing | null = state.mlist;
        const backend = getBackend();
        while (monsterItem !== null) {
          if (monsterItem._kind === "monster" && (monsterItem.t_flags & ISINVIS)) {
            if (see_monst(monsterItem)) {
              backend.mvaddch(monsterItem.t_pos.y, monsterItem.t_pos.x,
                monsterItem.t_type.charCodeAt(0));
            }
          }
          monsterItem = monsterItem.l_next;
        }
      }
      fuse(unsee, 0, spread(SEEDURATION), AFTER);
      await msg("this potion tastes like %s juice", state.fruit);
      break;

    case P_HEALING:
      state.player.t_stats.s_hpt += roll(state.player.t_stats.s_lvl, 4);
      if (state.player.t_stats.s_hpt > state.player.t_stats.s_maxhp) {
        state.player.t_stats.s_hpt = state.player.t_stats.s_maxhp;
      }
      if (state.player.t_flags & ISHUH) {
        state.player.t_flags &= ~ISHUH;
        extinguish(unconfuse);
      }
      await msg("you begin to feel better");
      break;

    case P_MFIND:
      // Detect monsters
      {
        let found = false;
        let monsterItem: Thing | null = state.mlist;
        const backend = getBackend();
        while (monsterItem !== null) {
          if (monsterItem._kind === "monster") {
            backend.mvaddch(monsterItem.t_pos.y, monsterItem.t_pos.x,
              monsterItem.t_type.charCodeAt(0));
            found = true;
          }
          monsterItem = monsterItem.l_next;
        }
        if (found) {
          await msg("you sense the presence of monsters");
          state.player.t_flags |= SEEMONST;
          fuse(unsee, 0, spread(SEEDURATION), AFTER);
        } else {
          await msg("you have a strange feeling for a moment, then it passes");
        }
      }
      break;

    case P_TFIND:
      // Detect magic items
      {
        let found = false;
        let itemObj: Thing | null = state.lvl_obj;
        const backend = getBackend();
        while (itemObj !== null) {
          if (itemObj._kind === "object" && isMagic(itemObj)) {
            backend.mvaddch(itemObj.o_pos.y, itemObj.o_pos.x,
              String.fromCharCode(itemObj.o_type).charCodeAt(0));
            found = true;
          }
          itemObj = itemObj.l_next;
        }
        if (found) {
          await msg("you sense the presence of magic");
        } else {
          await msg("you have a strange feeling for a moment, then it passes");
        }
      }
      break;

    case P_RAISE: {
      await msg("you suddenly feel much more skillful");
      // C original: set exp to current level threshold + 1
      const lvl = state.player.t_stats.s_lvl - 1;
      state.player.t_stats.s_exp = (lvl < e_levels.length && e_levels[lvl] !== 0)
        ? e_levels[lvl] + 1
        : state.player.t_stats.s_exp + 1;
      await raise_level();
      break;
    }

    case P_XHEAL:
      state.player.t_stats.s_hpt += roll(state.player.t_stats.s_lvl, 8);
      if (state.player.t_stats.s_hpt > state.player.t_stats.s_maxhp) {
        // C original: raise maxhp by 1, but clamp hpt to new maxhp
        state.player.t_stats.s_maxhp = ++state.player.t_stats.s_maxhp;
        state.player.t_stats.s_hpt = state.player.t_stats.s_maxhp;
      }
      if (state.player.t_flags & ISHUH) {
        state.player.t_flags &= ~ISHUH;
        extinguish(unconfuse);
      }
      await msg("you begin to feel much better");
      break;

    case P_HASTE:
      if (state.player.t_flags & ISHASTE) {
        await msg("you faint from exhaustion");
        state.no_command += rnd(8);
        state.player.t_flags &= ~ISHASTE;
        extinguish(nohaste);
      } else {
        state.player.t_flags |= ISHASTE;
        fuse(nohaste, 0, rnd(4) + 4, AFTER);
        await msg("you feel yourself moving much faster");
      }
      break;

    case P_RESTORE:
      if (state.player.t_stats.s_str < state.max_stats.s_str) {
        state.player.t_stats.s_str = state.max_stats.s_str;
        await msg("hey, this tastes great.  It makes you feel warm all over");
      } else {
        await msg("hmm, this potion tastes dead boring");
      }
      break;

    case P_BLIND:
      state.player.t_flags |= ISBLIND;
      fuse(sight, 0, spread(SEEDURATION), AFTER);
      await msg("a cloak of darkness falls around you");
      break;

    case P_LEVIT:
      state.player.t_flags |= ISLEVIT;
      fuse(land, 0, spread(SEEDURATION), AFTER);
      await msg("you start to float in the air");
      break;
  }

  pot_info[obj.o_which].oi_know = true;

  // Consume the potion
  obj.o_count--;
  if (obj.o_count < 1) {
    const { _detach, discard } = await import("./list.js");
    const packIdx = obj.o_packch.charCodeAt(0) - "a".charCodeAt(0);
    if (packIdx >= 0 && packIdx < 26) {
      state.pack_used[packIdx] = false;
    }
    const packHead = { head: state.player.t_pack as Thing | null };
    _detach(packHead, obj);
    state.player.t_pack = packHead.head;
    discard(obj);
    state.inpack--;
  }

  await status();
}

/**
 * raise_level: Raise the player's experience level.
 */
async function raise_level(): Promise<void> {
  const playerStats = state.player.t_stats;
  playerStats.s_lvl++;
  const addedHp = roll(1, 10);
  playerStats.s_maxhp += addedHp;
  playerStats.s_hpt += addedHp;
  await msg("Welcome to level %d", playerStats.s_lvl);
}

/**
 * land: Remove levitation from the player (fuse callback).
 */
export async function land(_arg: number): Promise<void> {
  state.player.t_flags &= ~ISLEVIT;
  await msg("you float gently to the ground");
}

/**
 * isMagic: Check if an object is magical.
 */
function isMagic(obj: GameObj): boolean {
  const typeChar = String.fromCharCode(obj.o_type);
  return typeChar === "!" || typeChar === "?" || typeChar === "=" ||
         typeChar === "/" || typeChar === ",";
}

function roll(numDice: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < numDice; i++) {
    total += rnd(sides) + 1;
  }
  return total;
}
