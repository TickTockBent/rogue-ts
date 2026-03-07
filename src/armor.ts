/**
 * Armor functions.
 * Ported from armor.c
 */

import type { GameObj } from "./types.js";
import {
  state, ARMOR, ISCURSED, ISKNOW,
} from "./globals.js";
import { msg } from "./io.js";
import { get_item } from "./pack.js";
import { inv_name } from "./things.js";

/**
 * wear: The wear command — put on armor.
 */
export async function wear(): Promise<void> {
  if (state.cur_armor !== null) {
    if (!state.terse) {
      await msg("you are already wearing some.  You'll have to take it off first");
    } else {
      await msg("already wearing some");
    }
    state.after = false;
    return;
  }

  const obj = await get_item("wear", ARMOR.charCodeAt(0));
  if (obj === null) return;

  if (obj.o_type !== ARMOR.charCodeAt(0)) {
    await msg("you can't wear that");
    state.after = false;
    return;
  }

  await waste_time();
  obj.o_flags |= ISKNOW;
  state.cur_armor = obj;
  if (!state.terse) {
    await msg("you are now wearing %s", inv_name(obj, true));
  } else {
    await msg("wearing %s", inv_name(obj, true));
  }
}

/**
 * take_off: The take-off command — remove armor.
 */
export async function take_off(): Promise<void> {
  if (state.cur_armor === null) {
    state.after = false;
    if (!state.terse) {
      await msg("you aren't wearing any armor");
    } else {
      await msg("not wearing armor");
    }
    return;
  }

  if (state.cur_armor._kind !== "object") return;

  if (state.cur_armor.o_flags & ISCURSED) {
    await msg("you can't.  It appears to be cursed");
    return;
  }

  await waste_time();
  const armor = state.cur_armor as GameObj;
  state.cur_armor = null;
  await msg("you used to be wearing %s", inv_name(armor, true));
}

/**
 * waste_time: Do nothing but let daemons/fuses advance.
 * Called when putting on or removing armor.
 */
export async function waste_time(): Promise<void> {
  const { do_daemons, do_fuses } = await import("./daemon.js");
  const { look } = await import("./misc.js");
  const { status } = await import("./io.js");
  const { BEFORE: B, AFTER: A } = await import("./globals.js");

  await do_daemons(B);
  await do_fuses(B);
  await do_daemons(A);
  await do_fuses(A);
  if (state.running) state.after = false;
  await look(false);
  await status();
}
