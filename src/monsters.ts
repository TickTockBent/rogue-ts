/**
 * Monster functions.
 * Ported from monsters.c
 */

import type { Coord, Thing, Monster } from "./types.js";
import {
  state, monsters as monsterTemplates, AMULETLEVEL,
  ISHASTE, ISRUN, ISMEAN, ISGREED, ISFOUND, ISCANC, ISBLIND, ISHUH, ISHELD,
  ISWEARING, R_STEALTH, ISLEVIT, R_AGGR, R_PROTECT,
  LAMPDIST, ISDARK,
  POTION, SCROLL, RING, STICK, FOOD, WEAPON, ARMOR, STAIRS, GOLD, AMULET,
  VS_MAGIC,
  moat, setMoat, INDEX,
} from "./globals.js";
import { rnd, roll } from "./util.js";
import { new_monster_thing } from "./list.js";
import { _attach } from "./list.js";
import { roomin } from "./rooms.js";
import { getBackend } from "./io.js";

// Monster vorpalness order
const lvl_mons = "KEBSHIROZLCQANYFTWPXUMVGJD";
const wand_mons = "KEBSH\0ROZL\0CQA\0Y\0TWP\0UMVGJ\0";

/**
 * randmonster: Pick a monster to show up.
 */
export function randmonster(wander: boolean): string {
  const mons = wander ? wand_mons : lvl_mons;
  let d: number;
  do {
    d = state.level + (rnd(10) - 6);
    if (d < 0) d = rnd(5);
    if (d > 25) d = rnd(5) + 21;
  } while (mons[d] === "\0");
  return mons[d];
}

/**
 * new_monster: Pick a new monster and add it to the list.
 */
export function new_monster(tp: Monster, type: string, cp: Coord): void {
  const backend = getBackend();
  let levAdd = state.level - AMULETLEVEL;
  if (levAdd < 0) levAdd = 0;

  // Attach to mlist
  const listHead = { head: state.mlist };
  _attach(listHead, tp);
  state.mlist = listHead.head;

  tp.t_type = type;
  tp.t_disguise = type;
  tp.t_pos = { x: cp.x, y: cp.y };

  backend.move(cp.y, cp.x);
  tp.t_oldch = String.fromCharCode(backend.inch() & 0xff);
  tp.t_room = roomin(cp);
  setMoat(cp.y, cp.x, tp);

  const monsterIndex = type.charCodeAt(0) - "A".charCodeAt(0);
  const mp = monsterTemplates[monsterIndex];

  tp.t_stats.s_lvl = mp.m_stats.s_lvl + levAdd;
  tp.t_stats.s_maxhp = tp.t_stats.s_hpt = roll(tp.t_stats.s_lvl, 8);
  tp.t_stats.s_arm = mp.m_stats.s_arm - levAdd;
  tp.t_stats.s_dmg = mp.m_stats.s_dmg;
  tp.t_stats.s_str = mp.m_stats.s_str;
  tp.t_stats.s_exp = mp.m_stats.s_exp + levAdd * 10 + exp_add(tp);
  tp.t_flags = mp.m_flags;

  if (state.level > 29) {
    tp.t_flags |= ISHASTE;
  }
  tp.t_turn = true;
  tp.t_pack = null;

  if (ISWEARING(R_AGGR)) {
    runto(cp);
  }
  if (type === "X") {
    tp.t_disguise = rnd_thing();
  }
}

/**
 * exp_add: Experience to add for this monster's level/hit points.
 */
export function exp_add(tp: Monster): number {
  let mod: number;
  if (tp.t_stats.s_lvl === 1) {
    mod = Math.floor(tp.t_stats.s_maxhp / 8);
  } else {
    mod = Math.floor(tp.t_stats.s_maxhp / 6);
  }
  if (tp.t_stats.s_lvl > 9) {
    mod *= 20;
  } else if (tp.t_stats.s_lvl > 6) {
    mod *= 4;
  }
  return mod;
}

/**
 * rnd_thing: Pick a random thing appropriate for this level.
 */
export function rnd_thing(): string {
  const thingList = [POTION, SCROLL, RING, STICK, FOOD, WEAPON, ARMOR, STAIRS, GOLD, AMULET];
  let count: number;
  if (state.level >= AMULETLEVEL) {
    count = thingList.length;
  } else {
    count = thingList.length - 1;
  }
  return thingList[rnd(count)];
}

/**
 * give_pack: Give a pack to a monster if it deserves one.
 * Requires new_thing() from things.ts (will be wired later to avoid circular dep).
 */
export let newThingFactory: (() => Thing) | null = null;

export function setNewThingFactory(factory: () => Thing): void {
  newThingFactory = factory;
}

export function give_pack(tp: Monster): void {
  const monsterIndex = tp.t_type.charCodeAt(0) - "A".charCodeAt(0);
  if (
    state.level >= state.max_level &&
    rnd(100) < monsterTemplates[monsterIndex].m_carry &&
    newThingFactory !== null
  ) {
    const newThing = newThingFactory();
    const listHead = { head: tp.t_pack };
    _attach(listHead, newThing);
    tp.t_pack = listHead.head;
  }
}

/**
 * save_throw: See if a creature saves against something.
 */
export function save_throw(which: number, tp: Monster): boolean {
  const need = 14 + which - Math.floor(tp.t_stats.s_lvl / 2);
  return roll(1, 20) >= need;
}

/**
 * save: See if the player saves against various nasty things.
 */
export function save(which: number): boolean {
  let adjustedWhich = which;
  if (which === VS_MAGIC) {
    if (state.cur_ring[0] !== null && state.cur_ring[0]._kind === "object" &&
        state.cur_ring[0].o_which === R_PROTECT) {
      adjustedWhich -= state.cur_ring[0].o_arm;
    }
    if (state.cur_ring[1] !== null && state.cur_ring[1]._kind === "object" &&
        state.cur_ring[1].o_which === R_PROTECT) {
      adjustedWhich -= state.cur_ring[1].o_arm;
    }
  }
  return save_throw(adjustedWhich, state.player);
}

/**
 * runto: Set a monster running toward the hero.
 */
export function runto(runner: Coord): void {
  const tp = moat(runner.y, runner.x);
  if (tp !== null && tp._kind === "monster") {
    tp.t_flags |= ISRUN;
    tp.t_dest = state.player.t_pos;
  }
}

/**
 * wake_monster: What to do when the hero steps next to a monster.
 * Simplified for Phase 4 — full implementation in Phase 6.
 */
export function wake_monster(y: number, x: number): Thing | null {
  const tp = moat(y, x);
  if (tp === null || tp._kind !== "monster") return null;

  // Mean monsters might start chasing
  if (
    !(tp.t_flags & ISRUN) &&
    rnd(3) !== 0 &&
    (tp.t_flags & ISMEAN) &&
    !(tp.t_flags & ISHELD) &&
    !ISWEARING(R_STEALTH) &&
    !(state.player.t_flags & ISLEVIT)
  ) {
    tp.t_dest = state.player.t_pos;
    tp.t_flags |= ISRUN;
  }

  // Greedy ones guard gold
  if ((tp.t_flags & ISGREED) && !(tp.t_flags & ISRUN)) {
    tp.t_flags |= ISRUN;
    const playerRoom = state.player.t_room;
    if (playerRoom !== null && playerRoom.r_goldval > 0) {
      tp.t_dest = playerRoom.r_gold;
    } else {
      tp.t_dest = state.player.t_pos;
    }
  }

  return tp;
}

/**
 * wanderer: Create a new wandering monster and aim it at the player.
 * Requires find_floor from rooms.ts.
 */
export function wanderer(): void {
  // Deferred to Phase 5/6 when the full game loop is ready
}

/**
 * dist: Distance between two points (squared).
 */
export function dist(y1: number, x1: number, y2: number, x2: number): number {
  return (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
}
