/**
 * Linked list operations.
 * Ported from list.c
 */

import type { Thing, Monster, GameObj } from "./types.js";

/**
 * _detach: Takes an item out of whatever linked list it might be in.
 * The listHead object holds { head: Thing | null } — we mutate head if needed.
 */
export function _detach(listHead: { head: Thing | null }, item: Thing): void {
  if (listHead.head === item) {
    listHead.head = item.l_next;
  }
  if (item.l_prev !== null) {
    item.l_prev.l_next = item.l_next;
  }
  if (item.l_next !== null) {
    item.l_next.l_prev = item.l_prev;
  }
  item.l_next = null;
  item.l_prev = null;
}

/**
 * _attach: Add an item to the head of a list.
 */
export function _attach(listHead: { head: Thing | null }, item: Thing): void {
  if (listHead.head !== null) {
    item.l_next = listHead.head;
    listHead.head.l_prev = item;
    item.l_prev = null;
  } else {
    item.l_next = null;
    item.l_prev = null;
  }
  listHead.head = item;
}

/**
 * _free_list: Throw the whole list away.
 */
export function _free_list(listHead: { head: Thing | null }): void {
  while (listHead.head !== null) {
    const item = listHead.head;
    listHead.head = item.l_next;
    discard(item);
  }
}

/**
 * discard: Free up an item (in JS, just unlink it).
 */
export function discard(_item: Thing): void {
  // In JS, garbage collection handles freeing.
  // We just need to make sure the item is detached from any list,
  // which _detach already does.
}

/**
 * new_item: Create a new GameObj (the common case for items).
 */
export function new_item(): GameObj {
  return {
    _kind: "object",
    l_next: null,
    l_prev: null,
    o_type: 0,
    o_pos: { x: 0, y: 0 },
    o_text: null,
    o_launch: 0,
    o_packch: "",
    o_damage: "0x0",
    o_hurldmg: "0x0",
    o_count: 1,
    o_which: 0,
    o_hplus: 0,
    o_dplus: 0,
    o_arm: 0,
    o_flags: 0,
    o_group: 0,
    o_label: null,
  };
}

/**
 * new_monster_thing: Create a new Monster thing.
 */
export function new_monster_thing(): Monster {
  return {
    _kind: "monster",
    l_next: null,
    l_prev: null,
    t_pos: { x: 0, y: 0 },
    t_turn: false,
    t_type: "A",
    t_disguise: "A",
    t_oldch: " ",
    t_dest: null,
    t_flags: 0,
    t_stats: {
      s_str: 0,
      s_exp: 0,
      s_lvl: 0,
      s_arm: 0,
      s_hpt: 0,
      s_dmg: "0x0",
      s_maxhp: 0,
    },
    t_room: null,
    t_pack: null,
    t_reserved: 0,
  };
}
