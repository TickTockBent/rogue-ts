/**
 * Item creation and naming.
 * Ported from things.c
 */

import type { GameObj, ObjInfo, Thing } from "./types.js";
import {
  state, NUMTHINGS,
  POTION, SCROLL, FOOD, WEAPON, ARMOR, RING, STICK, AMULET, GOLD,
  MAXPOTIONS, MAXSCROLLS, MAXWEAPONS, MAXARMORS, MAXRINGS, MAXSTICKS,
  ISCURSED, ISKNOW,
  R_ADDSTR, R_PROTECT, R_ADDHIT, R_ADDDAM, R_AGGR, R_TELEPORT,
  things, pot_info, scr_info, weap_info, arm_info, ring_info, ws_info,
  a_class, LEFT, RIGHT,
} from "./globals.js";
import { rnd, sprintf } from "./util.js";
import { new_item } from "./list.js";
import { init_weapon, num } from "./weapons.js";

/**
 * pick_one: Pick an item out of a list of nitems possible objects.
 * Uses cumulative probability (after init_probs has been called).
 */
export function pick_one(info: ObjInfo[], nitems: number): number {
  const randomValue = rnd(100);
  for (let idx = 0; idx < nitems; idx++) {
    if (randomValue < info[idx].oi_prob) {
      return idx;
    }
  }
  // Fallback to first item
  return 0;
}

/**
 * new_thing: Return a new thing.
 */
export function new_thing(): GameObj {
  const cur = new_item();
  cur.o_hplus = 0;
  cur.o_dplus = 0;
  cur.o_damage = "0x0";
  cur.o_hurldmg = "0x0";
  cur.o_arm = 11;
  cur.o_count = 1;
  cur.o_group = 0;
  cur.o_flags = 0;

  // If no food for a while, force food
  const choice = state.no_food > 3 ? 2 : pick_one(things, NUMTHINGS);

  switch (choice) {
    case 0: // Potion
      cur.o_type = POTION.charCodeAt(0);
      cur.o_which = pick_one(pot_info, MAXPOTIONS);
      break;
    case 1: // Scroll
      cur.o_type = SCROLL.charCodeAt(0);
      cur.o_which = pick_one(scr_info, MAXSCROLLS);
      break;
    case 2: // Food
      cur.o_type = FOOD.charCodeAt(0);
      state.no_food = 0;
      cur.o_which = rnd(10) !== 0 ? 0 : 1;
      break;
    case 3: { // Weapon
      init_weapon(cur, pick_one(weap_info, MAXWEAPONS));
      const weaponRoll = rnd(100);
      if (weaponRoll < 10) {
        cur.o_flags |= ISCURSED;
        cur.o_hplus -= rnd(3) + 1;
      } else if (weaponRoll < 15) {
        cur.o_hplus += rnd(3) + 1;
      }
      break;
    }
    case 4: { // Armor
      cur.o_type = ARMOR.charCodeAt(0);
      cur.o_which = pick_one(arm_info, MAXARMORS);
      cur.o_arm = a_class[cur.o_which];
      const armorRoll = rnd(100);
      if (armorRoll < 20) {
        cur.o_flags |= ISCURSED;
        cur.o_arm += rnd(3) + 1;
      } else if (armorRoll < 28) {
        cur.o_arm -= rnd(3) + 1;
      }
      break;
    }
    case 5: // Ring
      cur.o_type = RING.charCodeAt(0);
      cur.o_which = pick_one(ring_info, MAXRINGS);
      switch (cur.o_which) {
        case R_ADDSTR:
        case R_PROTECT:
        case R_ADDHIT:
        case R_ADDDAM:
          cur.o_arm = rnd(3);
          if (cur.o_arm === 0) {
            cur.o_arm = -1;
            cur.o_flags |= ISCURSED;
          }
          break;
        case R_AGGR:
        case R_TELEPORT:
          cur.o_flags |= ISCURSED;
          break;
      }
      break;
    case 6: // Stick
      cur.o_type = STICK.charCodeAt(0);
      cur.o_which = pick_one(ws_info, MAXSTICKS);
      fix_stick(cur);
      break;
  }

  return cur;
}

/**
 * fix_stick: Set up stick charges.
 */
export function fix_stick(cur: GameObj): void {
  cur.o_type = STICK.charCodeAt(0);
  // Differentiate wand (1x1) vs staff (2x3) damage
  if (state.ws_type[cur.o_which] === "staff") {
    cur.o_damage = "2x3";
    cur.o_hurldmg = "1x1";
  } else {
    cur.o_damage = "1x1";
    cur.o_hurldmg = "1x1";
  }
  // WS_LIGHT gets 10-19 charges; others get 3-7
  if (cur.o_which === 0) { // WS_LIGHT
    cur.o_arm = rnd(10) + 10;
  } else {
    cur.o_arm = rnd(5) + 3;
  }
  cur.o_flags = 0;
}

/**
 * inv_name: Return the name of something as it would appear in inventory.
 * Simplified for now — full implementation in Phase 7.
 */
export function inv_name(obj: GameObj, drop: boolean): string {
  let result = "";
  const which = obj.o_which;

  switch (String.fromCharCode(obj.o_type)) {
    case POTION: {
      const info = pot_info[which];
      if (obj.o_count === 1) {
        if (info.oi_know) {
          result = `A potion of ${info.oi_name}`;
        } else if (info.oi_guess) {
          result = `A ${state.p_colors[which]} potion called ${info.oi_guess}`;
        } else {
          result = `A ${state.p_colors[which]} potion`;
        }
      } else {
        if (info.oi_know) {
          result = `${obj.o_count} potions of ${info.oi_name}`;
        } else if (info.oi_guess) {
          result = `${obj.o_count} ${state.p_colors[which]} potions called ${info.oi_guess}`;
        } else {
          result = `${obj.o_count} ${state.p_colors[which]} potions`;
        }
      }
      break;
    }
    case SCROLL: {
      const info = scr_info[which];
      if (obj.o_count === 1) {
        if (info.oi_know) {
          result = `A scroll of ${info.oi_name}`;
        } else if (info.oi_guess) {
          result = `A scroll called ${info.oi_guess}`;
        } else {
          result = `A scroll titled '${state.s_names[which]}'`;
        }
      } else {
        if (info.oi_know) {
          result = `${obj.o_count} scrolls of ${info.oi_name}`;
        } else {
          result = `${obj.o_count} scrolls titled '${state.s_names[which]}'`;
        }
      }
      break;
    }
    case FOOD:
      if (which === 1) {
        result = obj.o_count === 1 ? `A ${state.fruit}` : `${obj.o_count} ${state.fruit}s`;
      } else {
        result = obj.o_count === 1 ? "Some food" : `${obj.o_count} rations of food`;
      }
      break;
    case WEAPON: {
      const weapName = weap_info[which].oi_name || "weapon";
      if (obj.o_count > 1) {
        result = `${obj.o_count} `;
      } else {
        result = vowelstr(weapName) + " ";
      }
      if (obj.o_flags & ISKNOW) {
        result += `${num(obj.o_hplus, obj.o_dplus, obj.o_type)} ${weapName}`;
      } else {
        result += weapName;
      }
      if (obj.o_count > 1) result += "s";
      if (obj.o_label !== null) result += ` called ${obj.o_label}`;
      break;
    }
    case ARMOR: {
      const armName = arm_info[which].oi_name || "armor";
      if (obj.o_flags & ISKNOW) {
        const protection = a_class[which] - obj.o_arm;
        result = `${num(protection, 0, obj.o_type)} ${armName} [protection ${10 - obj.o_arm}]`;
      } else {
        result = armName;
      }
      if (obj.o_label !== null) result += ` called ${obj.o_label}`;
      break;
    }
    case RING: {
      const info = ring_info[which];
      if (info.oi_know) {
        // Show ring bonus for rings that have a numeric value
        const hasNum = which === R_PROTECT || which === R_ADDSTR ||
                       which === R_ADDHIT || which === R_ADDDAM;
        if (hasNum && (obj.o_flags & ISKNOW)) {
          const sign = obj.o_arm >= 0 ? "+" : "";
          result = `A ${sign}${obj.o_arm} ring of ${info.oi_name}`;
        } else {
          result = `A ring of ${info.oi_name}`;
        }
      } else if (info.oi_guess) {
        result = `A ${state.r_stones[which]} ring called ${info.oi_guess}`;
      } else {
        result = `A ${state.r_stones[which]} ring`;
      }
      break;
    }
    case STICK: {
      const info = ws_info[which];
      const stickType = state.ws_type[which] || "staff";
      const stickMade = state.ws_made[which] || "wooden";
      if (info.oi_know) {
        result = `A ${stickType} of ${info.oi_name}`;
        if (obj.o_flags & ISKNOW) {
          result += ` [${obj.o_arm} charges]`;
        }
      } else if (info.oi_guess) {
        result = `A ${stickMade} ${stickType} called ${info.oi_guess}`;
      } else {
        result = `A ${stickMade} ${stickType}`;
      }
      break;
    }
    case AMULET:
      result = "The Amulet of Yendor";
      break;
    case GOLD:
      result = `${obj.o_arm} Gold pieces`;
      break;
    default:
      result = "Something bizarre";
      break;
  }

  // Add equipment status
  if (state.inv_describe) {
    if (obj === state.cur_armor) result += " (being worn)";
    if (obj === state.cur_weapon) result += " (weapon in hand)";
    if (obj === state.cur_ring[LEFT]) result += " (on left hand)";
    else if (obj === state.cur_ring[RIGHT]) result += " (on right hand)";
  }

  // Adjust case
  if (drop && result.length > 0 && result[0] >= "A" && result[0] <= "Z") {
    result = result[0].toLowerCase() + result.slice(1);
  } else if (!drop && result.length > 0 && result[0] >= "a" && result[0] <= "z") {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

/**
 * vowelstr: Return "An" or "A" depending on whether the string starts with a vowel.
 */
export function vowelstr(str: string): string {
  const vowels = "aeiouAEIOU";
  if (str.length > 0 && vowels.includes(str[0])) {
    return "An " + str;
  }
  return "A " + str;
}
