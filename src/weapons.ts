/**
 * Weapon functions.
 * Ported from weapons.c
 */

import type { Coord, Thing, GameObj } from "./types.js";
import {
  state,
  WEAPON, BOW, MAXWEAPONS,
  ISMISL, ISMANY, ISKNOW, ISCURSED,
  NUMLINES, NUMCOLS,
  FLOOR, PASSAGE,
  weap_info,
  setCh, moat, chat,
  F_DROPPED, flat, setFlat,
} from "./globals.js";
import { msg, getBackend } from "./io.js";
import { _attach } from "./list.js";
import { inv_name } from "./things.js";
import { get_item, leave_pack, dropcheck, fallpos } from "./pack.js";
import { step_ok } from "./io.js";
import { diag_ok } from "./misc.js";
import { get_dir } from "./misc.js";

const NO_WEAPON = -1;

interface InitWeap {
  iw_dam: string;   // Damage when wielded
  iw_hrl: string;   // Damage when thrown
  iw_launch: number; // Launching weapon
  iw_flags: number;  // Miscellaneous flags
}

const init_dam: InitWeap[] = [
  { iw_dam: "2x4", iw_hrl: "1x3", iw_launch: NO_WEAPON, iw_flags: 0 },          // Mace
  { iw_dam: "3x4", iw_hrl: "1x2", iw_launch: NO_WEAPON, iw_flags: 0 },          // Long sword
  { iw_dam: "1x1", iw_hrl: "1x1", iw_launch: NO_WEAPON, iw_flags: 0 },          // Bow
  { iw_dam: "1x1", iw_hrl: "2x3", iw_launch: BOW,       iw_flags: ISMANY | ISMISL }, // Arrow
  { iw_dam: "1x6", iw_hrl: "1x4", iw_launch: NO_WEAPON, iw_flags: ISMISL },     // Dagger
  { iw_dam: "4x4", iw_hrl: "1x2", iw_launch: NO_WEAPON, iw_flags: 0 },          // 2h sword
  { iw_dam: "1x1", iw_hrl: "1x3", iw_launch: NO_WEAPON, iw_flags: ISMANY | ISMISL }, // Dart
  { iw_dam: "1x2", iw_hrl: "2x4", iw_launch: NO_WEAPON, iw_flags: ISMANY | ISMISL }, // Shuriken
  { iw_dam: "2x3", iw_hrl: "1x6", iw_launch: NO_WEAPON, iw_flags: ISMISL },     // Spear
];

let group = 2;

/**
 * init_weapon: Set up the initial attributes of a weapon.
 */
export function init_weapon(weap: GameObj, which: number): void {
  const iwp = init_dam[which];

  weap.o_type = WEAPON.charCodeAt(0);
  weap.o_which = which;
  weap.o_damage = iwp.iw_dam;
  weap.o_hurldmg = iwp.iw_hrl;
  weap.o_launch = iwp.iw_launch;
  weap.o_flags = iwp.iw_flags;

  if (weap.o_flags & ISMANY) {
    weap.o_count = 8;
    weap.o_group = group++;
  } else {
    weap.o_count = 1;
  }

  weap.o_hplus = 0;
  weap.o_dplus = 0;
}

/**
 * num: Format a weapon's +hit/+dam string.
 */
export function num(n1: number, n2: number, type: number): string {
  if (type === WEAPON.charCodeAt(0)) {
    return `${n1 >= 0 ? "+" : ""}${n1},${n2 >= 0 ? "+" : ""}${n2}`;
  } else {
    // Armor: just +n
    return `${n1 >= 0 ? "+" : ""}${n1}`;
  }
}

/**
 * wield: The wield command — equip a weapon.
 */
export async function wield(): Promise<void> {
  if (state.cur_weapon !== null && state.cur_weapon._kind === "object") {
    if (state.cur_weapon.o_flags & ISCURSED) {
      await msg("you can't.  It appears to be cursed");
      return;
    }
  }

  const obj = await get_item("wield", 0);
  if (obj === null) return;

  if (obj.o_type === 0x5d) { // ARMOR type
    await msg("you can't wield armor");
    return;
  }

  if (state.cur_weapon !== null && state.cur_weapon._kind === "object") {
    state.cur_weapon.o_flags &= ~(0); // no flag change needed, just unequip
  }

  state.cur_weapon = obj;
  const weapName = weap_info[obj.o_which]?.oi_name || "weapon";

  if (!state.terse) {
    await msg("you are now wielding %s (%s)", inv_name(obj, false), obj.o_packch);
  } else {
    await msg("wielding %s (%s)", inv_name(obj, false), obj.o_packch);
  }
}

/**
 * missile: The throw command — hurl an object in a direction.
 */
export async function missile(): Promise<void> {
  if (!await get_dir()) return;

  const obj = await get_item("throw", WEAPON.charCodeAt(0));
  if (obj === null) return;

  if (!await dropcheck(obj)) return;

  const thrownObj = leave_pack(obj, true, false);
  do_motion(thrownObj, state.delta.y, state.delta.x);

  // Check if we hit a monster at the final position
  const mp = moat(thrownObj.o_pos.y, thrownObj.o_pos.x);
  if (mp !== null && mp._kind === "monster") {
    const { fight } = await import("./fight.js");
    if (await fight({ y: thrownObj.o_pos.y, x: thrownObj.o_pos.x }, thrownObj, true)) {
      // Hit! If the monster died, the item may still need to be placed
      if (moat(thrownObj.o_pos.y, thrownObj.o_pos.x) === null) {
        // Monster died — try to place item there
        await fall(thrownObj, true);
      }
      return;
    }
  }

  await fall(thrownObj, true);
}

/**
 * do_motion: Animate a thrown object moving across the screen.
 */
function do_motion(obj: GameObj, dy: number, dx: number): void {
  const backend = getBackend();

  obj.o_pos.y = state.player.t_pos.y;
  obj.o_pos.x = state.player.t_pos.x;

  for (;;) {
    const newY = obj.o_pos.y + dy;
    const newX = obj.o_pos.x + dx;

    // Check bounds
    if (newY <= 0 || newY >= NUMLINES - 1 || newX < 0 || newX >= NUMCOLS) break;

    const ch = winatForMissile(newY, newX);

    // Stop on walls, monsters
    if (!step_ok(ch) && ch !== PASSAGE) break;
    if (ch >= "A" && ch <= "Z") {
      obj.o_pos.y = newY;
      obj.o_pos.x = newX;
      break;
    }

    obj.o_pos.y = newY;
    obj.o_pos.x = newX;

    // Check for monster
    if (moat(newY, newX) !== null) break;
  }
}

/**
 * winatForMissile: Get what's at a position for missile checking.
 */
function winatForMissile(y: number, x: number): string {
  const monster = moat(y, x);
  if (monster !== null && monster._kind === "monster") {
    return monster.t_disguise;
  }
  return chat(y, x);
}

/**
 * fall: An item falls to the ground after being thrown.
 * Tries to place it at the landing position or nearby.
 */
async function fall(obj: GameObj, pr: boolean): Promise<void> {
  const backend = getBackend();
  const landPos: Coord = { y: obj.o_pos.y, x: obj.o_pos.x };
  const newPos: Coord = { y: 0, x: 0 };

  const ch = chat(landPos.y, landPos.x);
  if (ch !== FLOOR && ch !== PASSAGE) {
    // Try to find an adjacent spot
    if (!fallpos(landPos, newPos)) {
      if (pr) {
        await msg("the %s vanishes as it hits the ground",
          weap_info[obj.o_which]?.oi_name || "missile");
      }
      return;
    }
    obj.o_pos.y = newPos.y;
    obj.o_pos.x = newPos.x;
  }

  // Place on the floor
  const typeCh = String.fromCharCode(obj.o_type);
  setCh(obj.o_pos.y, obj.o_pos.x, typeCh);
  setFlat(obj.o_pos.y, obj.o_pos.x,
    flat(obj.o_pos.y, obj.o_pos.x) | F_DROPPED);

  const listHead = { head: state.lvl_obj };
  _attach(listHead, obj);
  state.lvl_obj = listHead.head;
}
