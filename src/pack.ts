/**
 * Pack (inventory) management.
 * Ported from pack.c — simplified for Phase 6 milestone.
 */

import type { Thing, GameObj, Coord } from "./types.js";
import {
  state, MAXPACK,
  GOLD, FOOD, POTION, SCROLL, WEAPON, ARMOR, RING, STICK, AMULET,
  ISMANY, ISCURSED,
  F_DROPPED,
  ESCAPE, FLOOR, PASSAGE, CALLABLE, R_OR_S,
  HUNGERTIME, STOMACHSIZE,
  LEFT, RIGHT, NUMLINES, NUMCOLS,
  INDEX, chat, setCh, flat, setFlat, moat,
} from "./globals.js";
import { rnd } from "./util.js";
import { msg, readchar, getBackend } from "./io.js";
import { _attach, _detach, new_item, discard } from "./list.js";
import { inv_name } from "./things.js";
import { find_obj } from "./misc.js";

/**
 * add_pack: Add an item to the hero's pack.
 */
export async function add_pack(obj: GameObj, silent: boolean): Promise<void> {
  // Assign a pack letter
  if (obj.o_packch === "") {
    for (let i = 0; i < 26; i++) {
      if (!state.pack_used[i]) {
        obj.o_packch = String.fromCharCode("a".charCodeAt(0) + i);
        state.pack_used[i] = true;
        break;
      }
    }
  }

  // Check if we can merge with existing items
  if (obj.o_flags & ISMANY) {
    let existing = state.player.t_pack;
    while (existing !== null) {
      if (existing._kind === "object" && existing.o_type === obj.o_type &&
          existing.o_which === obj.o_which && existing.o_group === obj.o_group) {
        existing.o_count += obj.o_count;
        if (!silent) {
          await msg("%s (%s)", inv_name(existing, false), existing.o_packch);
        }
        return;
      }
      existing = existing.l_next;
    }
  }

  if (state.inpack >= MAXPACK) {
    await msg("you can't carry anything else");
    return;
  }

  // Add to pack
  obj.l_next = state.player.t_pack;
  if (state.player.t_pack !== null) {
    state.player.t_pack.l_prev = obj;
  }
  obj.l_prev = null;
  state.player.t_pack = obj;
  state.inpack++;

  if (!silent) {
    await msg("%s (%s)", inv_name(obj, false), obj.o_packch);
  }
}

/**
 * pick_up: Pick up an object at the hero's location.
 */
export async function pick_up(ch: string): Promise<void> {
  const heroPos = state.player.t_pos;

  if (ch === GOLD) {
    await money();
    return;
  }

  const obj = find_obj(heroPos.y, heroPos.x);
  if (obj === null || obj._kind !== "object") {
    await msg("that's funny, it seems to have disappeared");
    return;
  }

  // Detach from level
  const lvlHead = { head: state.lvl_obj };
  _detach(lvlHead, obj);
  state.lvl_obj = lvlHead.head;

  // Clear the item from the floor
  setCh(heroPos.y, heroPos.x, (flat(heroPos.y, heroPos.x) & F_DROPPED) ? " " : ".");

  await add_pack(obj, false);
}

/**
 * money: Handle picking up gold.
 */
export async function money(): Promise<void> {
  const heroPos = state.player.t_pos;

  // Find the gold object
  const obj = find_obj(heroPos.y, heroPos.x);
  if (obj === null || obj._kind !== "object") return;

  const value = obj.o_arm; // o_goldval alias

  // Detach from level
  const lvlHead = { head: state.lvl_obj };
  _detach(lvlHead, obj);
  state.lvl_obj = lvlHead.head;

  // Clear from floor
  setCh(heroPos.y, heroPos.x, ".");

  state.purse += value;
  await msg("%d gold pieces", value);

  // Also clear gold from room
  const playerRoom = state.player.t_room;
  if (playerRoom !== null) {
    playerRoom.r_goldval = 0;
  }
}

/**
 * inventory: Display the player's inventory.
 */
export async function inventory(list: Thing | null, type: number): Promise<boolean> {
  if (list === null) {
    await msg("you are empty handed");
    return false;
  }

  let count = 0;
  let item: Thing | null = list;
  while (item !== null) {
    if (item._kind === "object") {
      if (type === 0 || item.o_type === type) {
        const name = inv_name(item, false);
        await msg("%s) %s", item.o_packch, name);
        count++;
      }
    }
    item = item.l_next;
  }

  if (count === 0) {
    await msg("you don't have anything appropriate");
    return false;
  }

  return true;
}

/**
 * get_item: Get an item from the pack by letter.
 */
export async function get_item(purpose: string, type: number): Promise<GameObj | null> {
  if (state.player.t_pack === null) {
    await msg("you aren't carrying anything");
    return null;
  }

  if (!state.terse) {
    await msg("which object do you want to %s?", purpose);
  } else {
    await msg("%s what?", purpose);
  }

  const ch = await readchar();
  state.mpos = 0;

  if (ch.charCodeAt(0) === ESCAPE) {
    state.after = false;
    await msg("");
    return null;
  }

  let item: Thing | null = state.player.t_pack;
  while (item !== null) {
    if (item._kind === "object" && item.o_packch === ch) {
      if (type !== 0 && type !== CALLABLE && type !== R_OR_S &&
          item.o_type !== type) {
        await msg("that's not a valid %s", purpose);
        return null;
      }
      return item;
    }
    item = item.l_next;
  }

  await msg("'%s' is not a valid pack character", ch);
  return null;
}

/**
 * leave_pack: Take an item out of the pack.
 * If count > 1 and !all, splits off one copy.
 */
export function leave_pack(obj: GameObj, newpack: boolean, all: boolean): GameObj {
  if (obj.o_count > 1 && !all) {
    state.last_pick = obj;
    obj.o_count--;
    if (obj.o_group === 0) {
      state.inpack--;
    }
    const nobj = new_item();
    nobj.o_type = obj.o_type;
    nobj.o_which = obj.o_which;
    nobj.o_hplus = obj.o_hplus;
    nobj.o_dplus = obj.o_dplus;
    nobj.o_arm = obj.o_arm;
    nobj.o_damage = obj.o_damage;
    nobj.o_hurldmg = obj.o_hurldmg;
    nobj.o_launch = obj.o_launch;
    nobj.o_flags = obj.o_flags;
    nobj.o_group = obj.o_group;
    nobj.o_count = 1;
    nobj.o_packch = obj.o_packch;
    nobj.o_text = obj.o_text;
    nobj.o_label = obj.o_label;
    return nobj;
  } else {
    state.last_pick = null;
    const packIdx = obj.o_packch.charCodeAt(0) - "a".charCodeAt(0);
    if (packIdx >= 0 && packIdx < 26) {
      state.pack_used[packIdx] = false;
    }
    const packHead = { head: state.player.t_pack as Thing | null };
    _detach(packHead, obj);
    state.player.t_pack = packHead.head;
    state.inpack--;
    return obj;
  }
}

/**
 * dropcheck: Check if an item can be dropped/thrown. Unequips if needed.
 */
export async function dropcheck(obj: GameObj): Promise<boolean> {
  if (obj !== state.cur_armor && obj !== state.cur_weapon &&
      obj !== state.cur_ring[LEFT] && obj !== state.cur_ring[RIGHT]) {
    return true;
  }

  if (obj.o_flags & ISCURSED) {
    await msg("you can't.  It appears to be cursed");
    return false;
  }

  if (obj === state.cur_weapon) {
    state.cur_weapon = null;
  } else if (obj === state.cur_armor) {
    const { waste_time } = await import("./armor.js");
    await waste_time();
    state.cur_armor = null;
  } else {
    const hand = obj === state.cur_ring[LEFT] ? LEFT : RIGHT;
    state.cur_ring[hand] = null;
  }

  return true;
}

/**
 * fallpos: Find an adjacent empty position for a dropped/thrown item.
 */
export function fallpos(pos: Coord, newpos: Coord): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ny = pos.y + dy;
      const nx = pos.x + dx;
      if (ny <= 0 || ny >= NUMLINES - 1 || nx < 0 || nx >= NUMCOLS) continue;
      if (ny === state.player.t_pos.y && nx === state.player.t_pos.x) continue;
      const ch = chat(ny, nx);
      if ((ch === FLOOR || ch === PASSAGE) && moat(ny, nx) === null) {
        newpos.y = ny;
        newpos.x = nx;
        return true;
      }
    }
  }
  return false;
}

/**
 * drop: The drop command — drop an item from the pack.
 */
export async function drop(): Promise<void> {
  const heroPos = state.player.t_pos;
  const ch = chat(heroPos.y, heroPos.x);

  if (ch !== FLOOR && ch !== PASSAGE) {
    state.after = false;
    await msg("there is something there already");
    return;
  }

  const obj = await get_item("drop", 0);
  if (obj === null) return;

  if (!await dropcheck(obj)) return;

  const droppedObj = leave_pack(obj, true, false);
  droppedObj.o_pos.y = heroPos.y;
  droppedObj.o_pos.x = heroPos.x;

  const typeCh = String.fromCharCode(droppedObj.o_type);
  setCh(heroPos.y, heroPos.x, typeCh);
  setFlat(heroPos.y, heroPos.x, flat(heroPos.y, heroPos.x) | F_DROPPED);

  if (droppedObj.o_type === AMULET.charCodeAt(0)) {
    state.amulet = false;
  }

  const listHead = { head: state.lvl_obj };
  _attach(listHead, droppedObj);
  state.lvl_obj = listHead.head;

  await msg("dropped %s", inv_name(droppedObj, true));
}

/**
 * eat: Eat food from the pack.
 */
export async function eat(): Promise<void> {
  const obj = await get_item("eat", FOOD.charCodeAt(0));
  if (obj === null) return;

  if (obj.o_type !== FOOD.charCodeAt(0)) {
    if (!state.terse) {
      await msg("ugh, that tastes terrible");
    } else {
      await msg("yuk");
    }
    return;
  }

  if (obj.o_which === 1) {
    await msg("my, that was a yummy %s", state.fruit);
  } else if (rnd(100) > 70) {
    await msg("yuk, this food tastes awful");
  } else {
    await msg("yum, that tasted good");
  }

  state.food_left += HUNGERTIME - 200 + rnd(400);
  if (state.food_left > STOMACHSIZE) {
    state.food_left = STOMACHSIZE;
  }
  state.hungry_state = 0;

  if (obj === state.cur_weapon) {
    state.cur_weapon = null;
  }

  obj.o_count--;
  if (obj.o_count < 1) {
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
}
