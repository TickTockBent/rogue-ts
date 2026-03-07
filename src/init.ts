/**
 * Initialization functions.
 * Ported from init.c
 */

import type { ObjInfo } from "./types.js";
import {
  state,
  MAXPOTIONS, MAXSCROLLS, MAXRINGS, MAXSTICKS, MAXWEAPONS, MAXARMORS,
  NUMTHINGS, HUNGERTIME,
  FOOD, ARMOR, RING_MAIL, MACE, BOW, ARROW, ISKNOW,
  things, pot_info, scr_info, ring_info, ws_info, weap_info, arm_info,
  a_class, rainbow, sylls, stones, wood, metal,
} from "./globals.js";
import { rnd } from "./util.js";
import { new_item } from "./list.js";
import { init_weapon } from "./weapons.js";
import { add_pack } from "./pack.js";

/**
 * init_player: Roll up the player with starting equipment.
 */
export async function init_player(): Promise<void> {
  // Set starting stats (already initialized in state.player via INIT_STATS)
  state.player.t_stats = { ...state.max_stats };
  state.food_left = HUNGERTIME;

  // Give some food
  const foodObj = new_item();
  foodObj.o_type = FOOD.charCodeAt(0);
  foodObj.o_count = 1;
  await add_pack(foodObj, true);

  // Give ring mail armor
  const armorObj = new_item();
  armorObj.o_type = ARMOR.charCodeAt(0);
  armorObj.o_which = RING_MAIL;
  armorObj.o_arm = a_class[RING_MAIL] - 1;
  armorObj.o_flags |= ISKNOW;
  armorObj.o_count = 1;
  state.cur_armor = armorObj;
  await add_pack(armorObj, true);

  // Give a +1,+1 mace
  const maceObj = new_item();
  init_weapon(maceObj, MACE);
  maceObj.o_hplus = 1;
  maceObj.o_dplus = 1;
  maceObj.o_flags |= ISKNOW;
  await add_pack(maceObj, true);
  state.cur_weapon = maceObj;

  // Give a +1 bow
  const bowObj = new_item();
  init_weapon(bowObj, BOW);
  bowObj.o_hplus = 1;
  bowObj.o_flags |= ISKNOW;
  await add_pack(bowObj, true);

  // Give 25-40 arrows
  const arrowObj = new_item();
  init_weapon(arrowObj, ARROW);
  arrowObj.o_count = rnd(15) + 25;
  arrowObj.o_flags |= ISKNOW;
  await add_pack(arrowObj, true);
}


/**
 * pick_color: Return a random displayable character for hallucination.
 * C original: picks from a set of item/monster display chars.
 */
const halluChars = "!?])=/,:*" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function pick_color(): string {
  return halluChars[rnd(halluChars.length)];
}

/**
 * init_colors: Initialize the potion color scheme.
 */
export function init_colors(): void {
  const used = new Array(rainbow.length).fill(false);
  for (let i = 0; i < MAXPOTIONS; i++) {
    let j: number;
    do {
      j = rnd(rainbow.length);
    } while (used[j]);
    used[j] = true;
    state.p_colors[i] = rainbow[j];
  }
}

/**
 * init_names: Generate scroll names from syllables.
 */
export function init_names(): void {
  const MAXNAME = 40;
  for (let i = 0; i < MAXSCROLLS; i++) {
    let name = "";
    let nwords = rnd(3) + 2;
    while (nwords-- > 0) {
      let nsyl = rnd(3) + 1;
      while (nsyl-- > 0) {
        const syl = sylls[rnd(sylls.length)];
        if (name.length + syl.length > MAXNAME) break;
        name += syl;
      }
      name += " ";
    }
    state.s_names[i] = name.trimEnd();
  }
}

/**
 * init_stones: Initialize ring stone settings.
 */
export function init_stones(): void {
  const used = new Array(stones.length).fill(false);
  for (let i = 0; i < MAXRINGS; i++) {
    let j: number;
    do {
      j = rnd(stones.length);
    } while (used[j]);
    used[j] = true;
    state.r_stones[i] = stones[j].st_name;
    ring_info[i].oi_worth += stones[j].st_value;
  }
}

/**
 * init_materials: Initialize wand/staff construction materials.
 */
export function init_materials(): void {
  const woodUsed = new Array(wood.length).fill(false);
  const metalUsed = new Array(metal.length).fill(false);

  for (let i = 0; i < MAXSTICKS; i++) {
    for (;;) {
      if (rnd(2) === 0) {
        const j = rnd(metal.length);
        if (!metalUsed[j]) {
          state.ws_type[i] = "wand";
          state.ws_made[i] = metal[j];
          metalUsed[j] = true;
          break;
        }
      } else {
        const j = rnd(wood.length);
        if (!woodUsed[j]) {
          state.ws_type[i] = "staff";
          state.ws_made[i] = wood[j];
          woodUsed[j] = true;
          break;
        }
      }
    }
  }
}

/**
 * sumprobs: Sum up cumulative probabilities for items appearing.
 */
function sumprobs(info: ObjInfo[], bound: number): void {
  for (let i = 1; i < bound; i++) {
    info[i].oi_prob += info[i - 1].oi_prob;
  }
}

/**
 * init_probs: Initialize the probabilities for the various items.
 */
export function init_probs(): void {
  sumprobs(things, NUMTHINGS);
  sumprobs(pot_info, MAXPOTIONS);
  sumprobs(scr_info, MAXSCROLLS);
  sumprobs(ring_info, MAXRINGS);
  sumprobs(ws_info, MAXSTICKS);
  sumprobs(weap_info, MAXWEAPONS);
  sumprobs(arm_info, MAXARMORS);
}
