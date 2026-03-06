/**
 * Pack (inventory) management.
 * Ported from pack.c — simplified for Phase 6 milestone.
 */

import type { Thing, GameObj, Coord } from "./types.js";
import {
  state, MAXPACK,
  GOLD, FOOD, POTION, SCROLL, WEAPON, ARMOR, RING, STICK, AMULET,
  ISMANY,
  F_DROPPED,
  INDEX, chat, setCh, flat, setFlat,
} from "./globals.js";
import { msg, getBackend } from "./io.js";
import { _attach, _detach } from "./list.js";
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
