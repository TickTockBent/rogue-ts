/**
 * Weapon functions.
 * Ported from weapons.c (init_weapon and weapon data only for now).
 * Full missile/wield functions deferred to Phase 7.
 */

import type { GameObj } from "./types.js";
import {
  WEAPON, BOW, MAXWEAPONS,
  ISMISL, ISMANY,
} from "./globals.js";

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
