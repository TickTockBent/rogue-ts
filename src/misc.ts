/**
 * Miscellaneous utility functions.
 * Ported from misc.c
 */

import type { Coord, Thing, Room, Monster, GameObj } from "./types.js";
import {
  state, NUMLINES, NUMCOLS, LAMPDIST,
  FLOOR, PASSAGE, DOOR, PLAYER, TRAP, STAIRS, GOLD,
  POTION, SCROLL, FOOD, WEAPON, ARMOR, RING, STICK, AMULET,
  ISDARK, ISGONE, ISMAZE,
  ISBLIND, ISINVIS, ISHALU, ISFOUND, SEEMONST, ISRUN, CANSEE,
  F_PASS, F_SEEN, F_REAL, F_PNUM,
  INDEX, chat, setCh, flat, setFlat, moat, winat,
  e_levels, monsters as monsterTemplates,
} from "./globals.js";
import { rnd, sign, ce } from "./util.js";
import { getBackend, step_ok } from "./io.js";
import { msg } from "./io.js";
import { roomin } from "./rooms.js";
import { dist } from "./monsters.js";

/**
 * look: Examine the surroundings and update the display.
 * C original: scans 3x3 area around hero, handles dark rooms,
 * hallucination, wake_monster, SEEMONST, and lamp area.
 */
export async function look(wakeup: boolean): Promise<void> {
  const backend = getBackend();
  const heroPos = state.player.t_pos;
  const playerRoom = state.player.t_room;

  const isBlind = !!(state.player.t_flags & ISBLIND);
  const isHallucinating = !!(state.player.t_flags & ISHALU);
  const isDarkRoom = playerRoom !== null && !!(playerRoom.r_flags & ISDARK) &&
                     !(playerRoom.r_flags & ISGONE);

  // Erase old lamp area in dark rooms (erase_lamp equivalent)
  // If we moved in a dark room, erase the 3x3 area around our old position
  if (isDarkRoom && !isBlind &&
      (state.oldpos.y !== heroPos.y || state.oldpos.x !== heroPos.x)) {
    for (let ody = -1; ody <= 1; ody++) {
      for (let odx = -1; odx <= 1; odx++) {
        const oy = state.oldpos.y + ody;
        const ox = state.oldpos.x + odx;
        if (oy < 0 || oy >= NUMLINES || ox < 0 || ox >= NUMCOLS) continue;
        const pp = INDEX(oy, ox);
        if (pp.p_ch === FLOOR) {
          // Only erase floor tiles (walls, doors stay visible)
          backend.mvaddch(oy, ox, " ".charCodeAt(0));
        }
      }
    }
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const y = heroPos.y + dy;
      const x = heroPos.x + dx;

      if (y < 0 || y >= NUMLINES || x < 0 || x >= NUMCOLS) continue;

      // Can't see diagonals through walls
      if (dy !== 0 && dx !== 0 && !diag_ok({ y: heroPos.y, x: heroPos.x }, { y, x })) {
        continue;
      }

      if (dy === 0 && dx === 0) continue;

      if (isBlind) continue;

      const pp = INDEX(y, x);
      const ch = pp.p_ch;
      const monster = moat(y, x);

      // Handle floor visibility in dark rooms — only show within lamp distance
      if (isDarkRoom && ch === FLOOR) {
        if (dist(y, x, heroPos.y, heroPos.x) > LAMPDIST) {
          continue;
        }
      }

      // Wake up monsters when the hero steps near them
      if (wakeup && monster !== null && monster._kind === "monster") {
        const { wake_monster } = await import("./monsters.js");
        await wake_monster(y, x);
      }

      // Determine what to show
      let showCh = ch;
      if (monster !== null && monster._kind === "monster") {
        if (see_monst(monster)) {
          showCh = isHallucinating ? pick_color() : monster.t_disguise;
        } else if (state.player.t_flags & SEEMONST) {
          showCh = monster.t_type;
        } else {
          showCh = ch;
        }
      } else if (isHallucinating && isItemChar(ch)) {
        showCh = pick_color();
      }

      // Handle traps: only show if F_REAL
      if (ch === TRAP && !(pp.p_flags & F_REAL)) {
        showCh = FLOOR;
      }

      const oldScreenChar = String.fromCharCode(backend.mvinch(y, x) & 0xff);
      if (oldScreenChar !== showCh) {
        backend.mvaddch(y, x, showCh.charCodeAt(0));
      }
    }
  }

  // C original: draw player at hero position after the 3x3 scan
  if (!state.running || !state.jump) {
    backend.mvaddch(heroPos.y, heroPos.x, PLAYER.charCodeAt(0));
  }
}

/**
 * pick_color: Random character for hallucination display.
 */
const halluChars = "!?])=/,:*ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function pick_color(): string {
  return halluChars[rnd(halluChars.length)];
}

/**
 * isItemChar: Check if a character represents an item on the ground.
 */
function isItemChar(ch: string): boolean {
  return ch === POTION || ch === SCROLL || ch === FOOD ||
         ch === WEAPON || ch === ARMOR || ch === RING ||
         ch === STICK || ch === AMULET || ch === GOLD;
}

/**
 * cansee: Returns true if the hero can see a certain coordinate.
 */
export function cansee(y: number, x: number): boolean {
  if (state.player.t_flags & ISBLIND) return false;

  const playerRoom = state.player.t_room;
  if (playerRoom === null) {
    // In a passage — can only see adjacent (dist < LAMPDIST)
    return dist(y, x, state.player.t_pos.y, state.player.t_pos.x) < LAMPDIST;
  }

  // In a room
  if (
    y >= playerRoom.r_pos.y &&
    y < playerRoom.r_pos.y + playerRoom.r_max.y &&
    x >= playerRoom.r_pos.x &&
    x < playerRoom.r_pos.x + playerRoom.r_max.x
  ) {
    // In same room — lit room: can see everything
    if (!(playerRoom.r_flags & ISDARK)) return true;
    // Dark room — can only see within lamp distance
    return dist(y, x, state.player.t_pos.y, state.player.t_pos.x) < LAMPDIST;
  }

  return dist(y, x, state.player.t_pos.y, state.player.t_pos.x) < LAMPDIST;
}

/**
 * see_monst: Returns true if the hero can see the monster.
 */
export function see_monst(mp: Monster): boolean {
  if (state.player.t_flags & ISBLIND) return false;
  if (mp.t_flags & ISINVIS) {
    if (!(state.player.t_flags & CANSEE)) return false;
  }
  return cansee(mp.t_pos.y, mp.t_pos.x);
}

/**
 * diag_ok: Returns true if it is ok to move diagonally from sp to ep.
 */
export function diag_ok(sp: Coord, ep: Coord): boolean {
  if (ep.x === sp.x || ep.y === sp.y) return true;

  if (!step_ok(chat(sp.y, ep.x))) return false;
  if (!step_ok(chat(ep.y, sp.x))) return false;

  return true;
}

/**
 * find_obj: Find an object at a given position.
 */
export function find_obj(y: number, x: number): Thing | null {
  let obj = state.lvl_obj;
  while (obj !== null) {
    if (obj._kind === "object" && obj.o_pos.y === y && obj.o_pos.x === x) {
      return obj;
    }
    obj = obj.l_next;
  }
  return null;
}

/**
 * floor_at: Get the floor character at the hero's position.
 */
export function floor_at(): string {
  const pp = INDEX(state.player.t_pos.y, state.player.t_pos.x);
  if (pp.p_ch === FLOOR) {
    const playerRoom = state.player.t_room;
    if (playerRoom !== null && (playerRoom.r_flags & ISDARK) && !(state.player.t_flags & ISBLIND)) {
      return " ";
    }
  }
  return pp.p_ch;
}

/**
 * check_level: Check if the player should go up a level of experience.
 */
export async function check_level(): Promise<void> {
  const playerStats = state.player.t_stats;
  let i = 0;
  while (e_levels[i] !== 0 && e_levels[i] <= playerStats.s_exp) {
    i++;
  }
  i++;
  if (i > playerStats.s_lvl) {
    const oldLevel = playerStats.s_lvl;
    playerStats.s_lvl = i;
    const addedHp = roll(i - oldLevel, 10);
    playerStats.s_maxhp += addedHp;
    playerStats.s_hpt += addedHp;
    await msg("Welcome to level %d", i);
  }
}

/**
 * chg_str: Change the hero's strength.
 */
export function chg_str(amt: number): void {
  const playerStats = state.player.t_stats;
  const maxStats = state.max_stats;

  if (amt > 0) {
    // Increase strength
    playerStats.s_str = Math.min(playerStats.s_str + amt, 31);
    if (playerStats.s_str > maxStats.s_str) {
      maxStats.s_str = playerStats.s_str;
    }
  } else {
    // Decrease strength
    playerStats.s_str = Math.max(playerStats.s_str + amt, 3);
  }
}

/**
 * get_dir: Get a direction from the user.
 * Returns true if a valid direction was obtained.
 */
export async function get_dir(): Promise<boolean> {
  const backend = getBackend();
  const { readchar } = await import("./io.js");

  if (!state.terse) {
    await msg("which direction? ");
  } else {
    await msg("direction: ");
  }

  const ch = await readchar();

  switch (ch) {
    case "h": state.delta = { y: 0, x: -1 }; break;
    case "j": state.delta = { y: 1, x: 0 }; break;
    case "k": state.delta = { y: -1, x: 0 }; break;
    case "l": state.delta = { y: 0, x: 1 }; break;
    case "y": state.delta = { y: -1, x: -1 }; break;
    case "u": state.delta = { y: -1, x: 1 }; break;
    case "b": state.delta = { y: 1, x: -1 }; break;
    case "n": state.delta = { y: 1, x: 1 }; break;
    default:
      await msg("illegal direction");
      return false;
  }

  state.dir_ch = ch;
  if (state.player.t_flags & ISBLIND) {
    state.delta = { y: 0, x: 0 };
  }
  return true;
}

/**
 * sign: Return -1, 0, or 1.
 */
export { sign } from "./util.js";

/**
 * set_mname: Get the name of a monster for messages.
 */
export function set_mname(tp: Monster): string {
  if (state.player.t_flags & ISHALU) {
    const m = rnd(26);
    return monsterTemplates[m].m_name;
  }
  if (see_monst(tp)) {
    const monsterIndex = tp.t_type.charCodeAt(0) - "A".charCodeAt(0);
    return "the " + monsterTemplates[monsterIndex].m_name;
  }
  return "it";
}

function roll(number: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < number; i++) {
    total += rnd(sides) + 1;
  }
  return total;
}
