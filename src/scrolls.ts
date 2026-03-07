/**
 * Scroll functions.
 * Ported from scrolls.c
 */

import type { Coord, Thing, Monster, GameObj } from "./types.js";
import {
  state,
  SCROLL, scr_info,
  S_CONFUSE, S_MAP, S_HOLD, S_SLEEP, S_ARMOR, S_ID_POTION,
  S_ID_SCROLL, S_ID_WEAPON, S_ID_ARMOR, S_ID_R_OR_S, S_SCARE,
  S_FDET, S_TELEP, S_ENCH, S_CREATE, S_REMOVE, S_AGGR, S_PROTECT,
  POTION, WEAPON, ARMOR, RING, STICK, FOOD, AMULET, GOLD,
  MAXROOMS, NUMLINES, NUMCOLS,
  CANHUH, ISHELD, ISRUN, ISFOUND, ISKNOW, ISCURSED, ISPROT,
  ISGONE, ISDARK, ISMAZE,
  FLOOR, PASSAGE, DOOR, STAIRS, TRAP,
  CALLABLE, R_OR_S,
  INDEX, chat, setCh, flat, setFlat, moat,
  F_REAL, F_PASS, F_SEEN,
  pot_info, arm_info, weap_info, ring_info, ws_info, a_class,
  MAXPOTIONS, MAXSCROLLS, MAXARMORS, MAXWEAPONS, MAXRINGS, MAXSTICKS,
} from "./globals.js";
import { rnd } from "./util.js";
import { msg, readchar, getBackend, status } from "./io.js";
import { get_item, add_pack } from "./pack.js";
import { inv_name } from "./things.js";
import { new_monster_thing } from "./list.js";
import { new_monster, randmonster } from "./monsters.js";
import { find_floor, roomin } from "./rooms.js";
import { num } from "./weapons.js";

/**
 * read_scroll: Read a scroll.
 */
export async function read_scroll(): Promise<void> {
  const obj = await get_item("read", SCROLL.charCodeAt(0));
  if (obj === null) return;

  if (obj.o_type !== SCROLL.charCodeAt(0)) {
    await msg("there is nothing on it to read");
    return;
  }

  // Identify the scroll since we're reading it
  const which = obj.o_which;

  switch (which) {
    case S_CONFUSE:
      // Next hit confuses monster
      state.player.t_flags |= CANHUH;
      await msg("your hands begin to glow %s",
        state.player.t_flags & CANHUH ? "red" : "blue");
      break;

    case S_MAP:
      // Magic mapping — reveal the whole level
      scr_info[S_MAP].oi_know = true;
      {
        const backend = getBackend();
        // Reveal all places on the map
        for (let y = 1; y < NUMLINES - 1; y++) {
          for (let x = 0; x < NUMCOLS; x++) {
            const pp = INDEX(y, x);
            // Reveal secret doors and hidden traps
            if (!(pp.p_flags & F_REAL)) {
              pp.p_flags |= F_REAL;
              if (pp.p_flags & F_PASS) {
                pp.p_ch = PASSAGE;
              } else {
                pp.p_ch = DOOR;
              }
            }
            // Reveal traps
            if (pp.p_ch === FLOOR && !(pp.p_flags & F_REAL)) {
              pp.p_ch = TRAP;
              pp.p_flags |= F_REAL;
            }
            // Show everything except space
            const ch = pp.p_ch;
            if (ch !== " ") {
              backend.mvaddch(y, x, ch.charCodeAt(0));
            }
          }
        }
      }
      await msg("oh, now this scroll has a map on it");
      break;

    case S_HOLD:
      // Hold monsters — freeze only monsters in the same room
      {
        const playerRoom = state.player.t_room;
        let monsterItem: Thing | null = state.mlist;
        let held = false;
        while (monsterItem !== null) {
          if (monsterItem._kind === "monster") {
            // Only affect monsters in the same room
            if (playerRoom !== null && monsterItem.t_room === playerRoom) {
              monsterItem.t_flags &= ~ISRUN;
              monsterItem.t_flags |= ISHELD;
              held = true;
            }
          }
          monsterItem = monsterItem.l_next;
        }
        if (!held) {
          await msg("you feel a strange sense of loss");
        }
      }
      break;

    case S_SLEEP:
      scr_info[S_SLEEP].oi_know = true;
      state.no_command += rnd(5) + 4;
      await msg("you fall asleep");
      break;

    case S_ARMOR:
      // Enchant armor
      if (state.cur_armor !== null && state.cur_armor._kind === "object") {
        state.cur_armor.o_arm--;
        state.cur_armor.o_flags &= ~ISCURSED;
        await msg("your armor glows faintly for a moment");
      } else {
        await msg("you feel a strange sense of loss");
      }
      break;

    case S_ID_POTION:
      scr_info[S_ID_POTION].oi_know = true;
      await identify_item("potion", POTION.charCodeAt(0));
      break;

    case S_ID_SCROLL:
      scr_info[S_ID_SCROLL].oi_know = true;
      await identify_item("scroll", SCROLL.charCodeAt(0));
      break;

    case S_ID_WEAPON:
      scr_info[S_ID_WEAPON].oi_know = true;
      await identify_item("weapon", WEAPON.charCodeAt(0));
      break;

    case S_ID_ARMOR:
      scr_info[S_ID_ARMOR].oi_know = true;
      await identify_item("armor", ARMOR.charCodeAt(0));
      break;

    case S_ID_R_OR_S:
      scr_info[S_ID_R_OR_S].oi_know = true;
      await identify_item("ring, wand, or staff", R_OR_S);
      break;

    case S_SCARE:
      // Scare monster — the scroll scares monsters if on the ground
      await msg("you hear maniacal laughter in the distance");
      break;

    case S_FDET:
      // Food detection
      {
        let found = false;
        let itemObj: Thing | null = state.lvl_obj;
        const backend = getBackend();
        while (itemObj !== null) {
          if (itemObj._kind === "object" &&
              itemObj.o_type === FOOD.charCodeAt(0)) {
            backend.mvaddch(itemObj.o_pos.y, itemObj.o_pos.x,
              FOOD.charCodeAt(0));
            found = true;
          }
          itemObj = itemObj.l_next;
        }
        if (found) {
          await msg("you sense the presence of food");
        } else {
          await msg("you have a strange feeling for a moment, then it passes");
        }
      }
      break;

    case S_TELEP:
      // Teleport
      {
        const heroPos = state.player.t_pos;
        const newPos: Coord = { y: 0, x: 0 };
        const oldRoom = state.player.t_room;
        find_floor(null, newPos, false, true);

        const backend = getBackend();
        // Erase hero from old position
        const { floor_at } = await import("./misc.js");
        backend.mvaddch(heroPos.y, heroPos.x, floor_at().charCodeAt(0));

        heroPos.y = newPos.y;
        heroPos.x = newPos.x;
        state.player.t_room = roomin(heroPos);

        const { enter_room } = await import("./rooms.js");
        if (state.player.t_room !== oldRoom) {
          enter_room(heroPos);
        }

        await msg("you find yourself in unfamiliar surroundings");
      }
      break;

    case S_ENCH:
      // Enchant weapon
      if (state.cur_weapon !== null && state.cur_weapon._kind === "object") {
        state.cur_weapon.o_flags &= ~ISCURSED;
        if (rnd(2) === 0) {
          state.cur_weapon.o_hplus++;
        } else {
          state.cur_weapon.o_dplus++;
        }
        await msg("your %s glows %s for a moment",
          weap_info[state.cur_weapon.o_which]?.oi_name || "weapon",
          rnd(2) === 0 ? "blue" : "gold");
      } else {
        await msg("you feel a strange sense of loss");
      }
      break;

    case S_CREATE:
      // Create monster
      {
        const heroPos = state.player.t_pos;
        let placed = false;
        for (let dy = -1; dy <= 1 && !placed; dy++) {
          for (let dx = -1; dx <= 1 && !placed; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ny = heroPos.y + dy;
            const nx = heroPos.x + dx;
            if (ny <= 0 || ny >= NUMLINES - 1 || nx < 0 || nx >= NUMCOLS) continue;
            const ch = chat(ny, nx);
            if ((ch === FLOOR || ch === PASSAGE) && moat(ny, nx) === null) {
              const monsterThing = new_monster_thing();
              new_monster(monsterThing, randmonster(false), { y: ny, x: nx });
              placed = true;
            }
          }
        }
        if (!placed) {
          await msg("you hear a faint cry of anguish in the distance");
        }
      }
      break;

    case S_REMOVE:
      // Remove curse
      if (state.cur_armor !== null && state.cur_armor._kind === "object") {
        state.cur_armor.o_flags &= ~ISCURSED;
      }
      if (state.cur_weapon !== null && state.cur_weapon._kind === "object") {
        state.cur_weapon.o_flags &= ~ISCURSED;
      }
      if (state.cur_ring[0] !== null && state.cur_ring[0]._kind === "object") {
        state.cur_ring[0].o_flags &= ~ISCURSED;
      }
      if (state.cur_ring[1] !== null && state.cur_ring[1]._kind === "object") {
        state.cur_ring[1].o_flags &= ~ISCURSED;
      }
      await msg("you feel as if somebody is watching over you");
      break;

    case S_AGGR:
      // Aggravate monsters
      scr_info[S_AGGR].oi_know = true;
      aggravate();
      await msg("you hear a high pitched humming noise");
      break;

    case S_PROTECT:
      // Protect armor
      if (state.cur_armor !== null && state.cur_armor._kind === "object") {
        state.cur_armor.o_flags |= ISPROT;
        await msg("your armor is bathed in a shimmering gold aura");
      } else {
        await msg("you feel a strange sense of loss");
      }
      break;
  }

  // Consume the scroll
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
 * identify_item: Let the player identify an item from their pack.
 */
async function identify_item(purpose: string, type: number): Promise<void> {
  await msg("this scroll is an identify scroll");
  const obj = await get_item("identify", type);
  if (obj === null) return;

  obj.o_flags |= ISKNOW;

  // Reveal the item's true nature based on type
  switch (String.fromCharCode(obj.o_type)) {
    case "!": // POTION
      pot_info[obj.o_which].oi_know = true;
      break;
    case "?": // SCROLL
      scr_info[obj.o_which].oi_know = true;
      break;
    case ")": // WEAPON
      break; // ISKNOW flag is enough
    case "]": // ARMOR
      break; // ISKNOW flag is enough
    case "=": // RING
      ring_info[obj.o_which].oi_know = true;
      break;
    case "/": // STICK
      ws_info[obj.o_which].oi_know = true;
      break;
  }

  await msg("%s (%s)", inv_name(obj, false), obj.o_packch);
}

/**
 * aggravate: Aggravate all the monsters on this level.
 */
export function aggravate(): void {
  let monsterItem: Thing | null = state.mlist;
  while (monsterItem !== null) {
    if (monsterItem._kind === "monster") {
      monsterItem.t_flags |= ISRUN;
      monsterItem.t_dest = state.player.t_pos;
    }
    monsterItem = monsterItem.l_next;
  }
}
