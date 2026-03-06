/**
 * Level generation.
 * Ported from new_level.c
 */

import type { Coord, Thing, Monster, GameObj } from "./types.js";
import {
  state, MAXCOLS, MAXLINES, MAXOBJ, MAXTRAPS, MAXROOMS, AMULETLEVEL,
  NTRAPS, ISHELD, ISMEAN, SEEMONST, ISHALU,
  FLOOR, PASSAGE, STAIRS, AMULET, PLAYER,
  ISGONE,
  F_REAL, F_PNUM,
  INDEX, chat, setCh, flat, setFlat,
} from "./globals.js";
import { rnd } from "./util.js";
import { _attach, _free_list, new_item } from "./list.js";
import { do_rooms, find_floor, rnd_room, enter_room, putpass } from "./rooms.js";
import { do_passages } from "./passages.js";
import { new_thing } from "./things.js";
import { new_monster_thing } from "./list.js";
import { new_monster, randmonster, give_pack } from "./monsters.js";
import { roomin } from "./rooms.js";
import { getBackend } from "./io.js";

const TREAS_ROOM = 20;
const MAXTREAS = 10;
const MINTREAS = 2;
const MAXTRIES = 10;

/**
 * new_level: Dig and draw a new level.
 */
export function new_level(): void {
  const backend = getBackend();

  // Unhold when you go down
  state.player.t_flags &= ~ISHELD;

  if (state.level > state.max_level) {
    state.max_level = state.level;
  }

  // Clear places for a new level
  for (const pp of state.places) {
    pp.p_ch = " ";
    pp.p_flags = F_REAL;
    pp.p_monst = null;
  }

  backend.clear();

  // Free up monsters from last level
  let tp = state.mlist;
  while (tp !== null) {
    if (tp._kind === "monster" && tp.t_pack !== null) {
      const packHead = { head: tp.t_pack };
      _free_list(packHead);
      tp.t_pack = packHead.head;
    }
    tp = tp.l_next;
  }
  const mlistHead = { head: state.mlist };
  _free_list(mlistHead);
  state.mlist = mlistHead.head;

  // Throw away stuff left on previous level
  const lvlObjHead = { head: state.lvl_obj };
  _free_list(lvlObjHead);
  state.lvl_obj = lvlObjHead.head;

  do_rooms();
  do_passages();
  state.no_food++;
  put_things();

  // Place the traps
  if (rnd(10) < state.level) {
    state.ntraps = rnd(Math.floor(state.level / 4)) + 1;
    if (state.ntraps > MAXTRAPS) {
      state.ntraps = MAXTRAPS;
    }
    let trapCount = state.ntraps;
    while (trapCount-- > 0) {
      // Don't place traps in mazes
      do {
        find_floor(null, state.stairs, false, false);
      } while (chat(state.stairs.y, state.stairs.x) !== FLOOR);

      const pp = INDEX(state.stairs.y, state.stairs.x);
      pp.p_flags &= ~F_REAL;
      pp.p_flags |= rnd(NTRAPS);
    }
  }

  // Place the staircase
  find_floor(null, state.stairs, false, false);
  setCh(state.stairs.y, state.stairs.x, STAIRS);
  state.seenstairs = false;

  // Assign rooms to all monsters
  tp = state.mlist;
  while (tp !== null) {
    if (tp._kind === "monster") {
      tp.t_room = roomin(tp.t_pos);
    }
    tp = tp.l_next;
  }

  // Place the hero
  find_floor(null, state.player.t_pos, false, true);
  enter_room(state.player.t_pos);
  backend.mvaddch(state.player.t_pos.y, state.player.t_pos.x, PLAYER.charCodeAt(0));
}

/**
 * put_things: Put potions, scrolls, and other items on this level.
 */
export function put_things(): void {
  // If the amulet has been found and we're above max level, no new stuff
  if (state.amulet && state.level < state.max_level) {
    return;
  }

  // Check for treasure rooms
  if (rnd(TREAS_ROOM) === 0) {
    treas_room();
  }

  // Do MAXOBJ attempts to put things on a level
  for (let i = 0; i < MAXOBJ; i++) {
    if (rnd(100) < 36) {
      const obj = new_thing();
      const listHead = { head: state.lvl_obj };
      _attach(listHead, obj);
      state.lvl_obj = listHead.head;

      find_floor(null, obj.o_pos, false, false);
      setCh(obj.o_pos.y, obj.o_pos.x, String.fromCharCode(obj.o_type));
    }
  }

  // If deep enough and no amulet yet, place it
  if (state.level >= AMULETLEVEL && !state.amulet) {
    const obj = new_item();
    const listHead = { head: state.lvl_obj };
    _attach(listHead, obj);
    state.lvl_obj = listHead.head;

    obj.o_hplus = 0;
    obj.o_dplus = 0;
    obj.o_damage = "0x0";
    obj.o_hurldmg = "0x0";
    obj.o_arm = 11;
    obj.o_type = AMULET.charCodeAt(0);

    find_floor(null, obj.o_pos, false, false);
    setCh(obj.o_pos.y, obj.o_pos.x, AMULET);
  }
}

/**
 * treas_room: Add a treasure room.
 */
export function treas_room(): void {
  const rp = state.rooms[rnd_room()];
  let spots = (rp.r_max.y - 2) * (rp.r_max.x - 2) - MINTREAS;
  if (spots > MAXTREAS - MINTREAS) {
    spots = MAXTREAS - MINTREAS;
  }

  const numMonst = rnd(spots) + MINTREAS;
  let nm = numMonst;

  const mp: Coord = { x: 0, y: 0 };

  // Place treasures
  while (nm-- > 0) {
    find_floor(rp, mp, 2 * MAXTRIES, false);
    const obj = new_thing();
    obj.o_pos = { x: mp.x, y: mp.y };
    const listHead = { head: state.lvl_obj };
    _attach(listHead, obj);
    state.lvl_obj = listHead.head;
    setCh(mp.y, mp.x, String.fromCharCode(obj.o_type));
  }

  // Fill room with monsters from the next level down
  nm = rnd(spots) + MINTREAS;
  if (nm < numMonst + 2) {
    nm = numMonst + 2;
  }
  spots = (rp.r_max.y - 2) * (rp.r_max.x - 2);
  if (nm > spots) {
    nm = spots;
  }

  state.level++;
  while (nm-- > 0) {
    if (find_floor(rp, mp, MAXTRIES, true)) {
      const monsterThing = new_monster_thing();
      new_monster(monsterThing, randmonster(false), mp);
      monsterThing.t_flags |= ISMEAN;
      give_pack(monsterThing);
    }
  }
  state.level--;
}
