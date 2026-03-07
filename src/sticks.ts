/**
 * Wand/Staff functions.
 * Ported from sticks.c
 */

import type { Coord, Thing, Monster, GameObj } from "./types.js";
import {
  state,
  STICK, ws_info,
  WS_LIGHT, WS_INVIS, WS_ELECT, WS_FIRE, WS_COLD,
  WS_POLYMORPH, WS_MISSILE, WS_HASTE_M, WS_SLOW_M,
  WS_DRAIN, WS_NOP, WS_TELAWAY, WS_TELTO, WS_CANCEL,
  NUMLINES, NUMCOLS, BOLT_LENGTH,
  ISDARK, ISGONE,
  ISRUN, ISHASTE, ISSLOW, ISINVIS, ISCANC, ISHUH, ISMEAN, ISGREED,
  FLOOR, PASSAGE, DOOR,
  INDEX, chat, setCh, moat, setMoat,
  F_PASS,
  monsters as monsterTemplates,
} from "./globals.js";
import { rnd, roll } from "./util.js";
import { msg, getBackend, step_ok } from "./io.js";
import { get_item } from "./pack.js";
import { get_dir, see_monst, cansee } from "./misc.js";
import { find_floor, roomin, enter_room } from "./rooms.js";
import { new_monster_thing } from "./list.js";
import { new_monster, randmonster, save_throw } from "./monsters.js";
import { inv_name } from "./things.js";

/**
 * do_zap: Zap a wand/staff in a direction.
 */
export async function do_zap(): Promise<void> {
  if (!await get_dir()) return;

  const obj = await get_item("zap", STICK.charCodeAt(0));
  if (obj === null) return;

  if (obj.o_type !== STICK.charCodeAt(0)) {
    await msg("you can't zap with that");
    return;
  }

  if (obj.o_arm <= 0) { // charges
    await msg("nothing happens");
    return;
  }

  obj.o_arm--; // use a charge

  switch (obj.o_which) {
    case WS_LIGHT:
      await ws_light();
      break;

    case WS_INVIS:
      await ws_effect_on_monster(obj, (tp) => {
        tp.t_flags |= ISINVIS;
        if (cansee(tp.t_pos.y, tp.t_pos.x)) {
          const backend = getBackend();
          backend.mvaddch(tp.t_pos.y, tp.t_pos.x, tp.t_oldch.charCodeAt(0));
        }
        return "the monster seems to have disappeared";
      });
      break;

    case WS_ELECT:
    case WS_FIRE:
    case WS_COLD:
      await bolt(obj);
      break;

    case WS_POLYMORPH:
      await ws_effect_on_monster(obj, (tp) => {
        const newType = randmonster(false);
        const monsterIndex = newType.charCodeAt(0) - "A".charCodeAt(0);
        const mp = monsterTemplates[monsterIndex];
        tp.t_type = newType;
        tp.t_disguise = newType;
        tp.t_stats.s_dmg = mp.m_stats.s_dmg;
        tp.t_stats.s_hpt = roll(mp.m_stats.s_lvl, 8);
        tp.t_stats.s_maxhp = tp.t_stats.s_hpt;
        tp.t_stats.s_lvl = mp.m_stats.s_lvl;
        tp.t_stats.s_arm = mp.m_stats.s_arm;
        tp.t_stats.s_exp = mp.m_stats.s_exp;
        // C original: tp->t_flags = mp->m_flags | ISRUN
        tp.t_flags = mp.m_flags | ISRUN;
        if (see_monst(tp)) {
          const backend = getBackend();
          backend.mvaddch(tp.t_pos.y, tp.t_pos.x, newType.charCodeAt(0));
        }
        return null; // no message
      });
      break;

    case WS_MISSILE:
      await missile(obj);
      break;

    case WS_HASTE_M:
      await ws_effect_on_monster(obj, (tp) => {
        tp.t_flags |= ISHASTE;
        return "the monster starts moving faster";
      });
      break;

    case WS_SLOW_M:
      await ws_effect_on_monster(obj, (tp) => {
        if (tp.t_flags & ISHASTE) {
          tp.t_flags &= ~ISHASTE;
        } else {
          tp.t_flags |= ISSLOW;
        }
        tp.t_turn = true;
        return "the monster starts moving slower";
      });
      break;

    case WS_DRAIN:
      // Drain life — C original: halve player HP, then divide among room monsters
      {
        if (state.player.t_stats.s_hpt < 2) {
          await msg("you are too weak to use it");
          break;
        }
        // Count monsters in the same room
        const playerRoom = state.player.t_room;
        let cnt = 0;
        let monsterItem: Thing | null = state.mlist;
        while (monsterItem !== null) {
          if (monsterItem._kind === "monster" && monsterItem.t_room === playerRoom) {
            cnt++;
          }
          monsterItem = monsterItem.l_next;
        }
        if (cnt === 0) {
          await msg("you have a tingling feeling");
          break;
        }
        state.player.t_stats.s_hpt = Math.floor(state.player.t_stats.s_hpt / 2);
        const drain = Math.floor(state.player.t_stats.s_hpt / cnt);
        monsterItem = state.mlist;
        while (monsterItem !== null) {
          const next = monsterItem.l_next;
          if (monsterItem._kind === "monster" && monsterItem.t_room === playerRoom) {
            monsterItem.t_stats.s_hpt -= drain;
            if (monsterItem.t_stats.s_hpt <= 0) {
              const { killed } = await import("./fight.js");
              await killed(monsterItem, true);
            }
          }
          monsterItem = next;
        }
      }
      break;

    case WS_NOP:
      await msg("nothing happens");
      break;

    case WS_TELAWAY:
      await ws_effect_on_monster(obj, (tp) => {
        const newPos: Coord = { y: 0, x: 0 };
        if (find_floor(null, newPos, false, true)) {
          const backend = getBackend();
          if (see_monst(tp)) {
            backend.mvaddch(tp.t_pos.y, tp.t_pos.x, tp.t_oldch.charCodeAt(0));
          }
          setMoat(tp.t_pos.y, tp.t_pos.x, null);
          tp.t_pos.y = newPos.y;
          tp.t_pos.x = newPos.x;
          tp.t_room = roomin(tp.t_pos);
          backend.move(newPos.y, newPos.x);
          tp.t_oldch = String.fromCharCode(backend.inch() & 0xff);
          setMoat(newPos.y, newPos.x, tp);
          if (see_monst(tp)) {
            backend.mvaddch(newPos.y, newPos.x, tp.t_disguise.charCodeAt(0));
          }
        }
        return null;
      });
      break;

    case WS_TELTO:
      // Teleport monster to player
      await ws_effect_on_monster(obj, (tp) => {
        const heroPos = state.player.t_pos;
        // Find an adjacent spot
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ny = heroPos.y + dy;
            const nx = heroPos.x + dx;
            if (ny <= 0 || ny >= NUMLINES - 1 || nx < 0 || nx >= NUMCOLS) continue;
            const ch = chat(ny, nx);
            if ((ch === FLOOR || ch === PASSAGE || ch === DOOR) && moat(ny, nx) === null) {
              const backend = getBackend();
              if (see_monst(tp)) {
                backend.mvaddch(tp.t_pos.y, tp.t_pos.x, tp.t_oldch.charCodeAt(0));
              }
              setMoat(tp.t_pos.y, tp.t_pos.x, null);
              tp.t_pos.y = ny;
              tp.t_pos.x = nx;
              tp.t_room = roomin(tp.t_pos);
              backend.move(ny, nx);
              tp.t_oldch = String.fromCharCode(backend.inch() & 0xff);
              setMoat(ny, nx, tp);
              if (see_monst(tp)) {
                backend.mvaddch(ny, nx, tp.t_disguise.charCodeAt(0));
              }
              return null;
            }
          }
        }
        return null;
      });
      break;

    case WS_CANCEL:
      await ws_effect_on_monster(obj, (tp) => {
        tp.t_flags |= ISCANC;
        tp.t_flags &= ~(ISINVIS | ISHUH);
        tp.t_disguise = tp.t_type;
        if (see_monst(tp)) {
          const backend = getBackend();
          backend.mvaddch(tp.t_pos.y, tp.t_pos.x, tp.t_type.charCodeAt(0));
        }
        return null;
      });
      break;
  }

  ws_info[obj.o_which].oi_know = true;
}

/**
 * ws_light: Light up the room or show passage.
 */
async function ws_light(): Promise<void> {
  const playerRoom = state.player.t_room;
  if (playerRoom === null) {
    await msg("the corridor glows and then fades");
    return;
  }

  if (playerRoom.r_flags & ISGONE) {
    await msg("the corridor glows and then fades");
    return;
  }

  playerRoom.r_flags &= ~ISDARK;
  const backend = getBackend();

  // Light up the room
  for (let y = playerRoom.r_pos.y; y < playerRoom.r_pos.y + playerRoom.r_max.y; y++) {
    for (let x = playerRoom.r_pos.x; x < playerRoom.r_pos.x + playerRoom.r_max.x; x++) {
      if (y < 0 || y >= NUMLINES || x < 0 || x >= NUMCOLS) continue;
      const ch = chat(y, x);
      const mon = moat(y, x);
      if (mon !== null && mon._kind === "monster") {
        if (see_monst(mon)) {
          backend.mvaddch(y, x, mon.t_disguise.charCodeAt(0));
        }
      } else if (ch !== " ") {
        backend.mvaddch(y, x, ch.charCodeAt(0));
      }
    }
  }
  await msg("the room is lit by a shimmering %s light",
    rnd(2) === 0 ? "blue" : "gold");
}

/**
 * ws_effect_on_monster: Find a monster in the zap direction and apply an effect.
 */
async function ws_effect_on_monster(
  obj: GameObj,
  effect: (tp: Monster) => string | null,
): Promise<void> {
  // Trace from hero in the direction
  let y = state.player.t_pos.y;
  let x = state.player.t_pos.x;

  for (;;) {
    y += state.delta.y;
    x += state.delta.x;

    if (y <= 0 || y >= NUMLINES - 1 || x < 0 || x >= NUMCOLS) break;

    const ch = chat(y, x);
    if (ch === " " || ch === "|" || ch === "-") break;

    const tp = moat(y, x);
    if (tp !== null && tp._kind === "monster") {
      const msgText = effect(tp);
      if (msgText !== null) {
        await msg(msgText);
      }
      return;
    }
  }

  await msg("the bolt vanishes with a puff of smoke");
}

/**
 * missile: Fire a magic missile using roll_em for damage.
 * C original: creates a temporary Thing with "1x4" damage and uses fight system.
 */
async function missile(obj: GameObj): Promise<void> {
  let y = state.player.t_pos.y;
  let x = state.player.t_pos.x;

  for (;;) {
    y += state.delta.y;
    x += state.delta.x;

    if (y <= 0 || y >= NUMLINES - 1 || x < 0 || x >= NUMCOLS) break;

    const ch = chat(y, x);
    if (ch === " " || ch === "|" || ch === "-") break;

    const tp = moat(y, x);
    if (tp !== null && tp._kind === "monster") {
      // C original: uses roll_em with "1x4" damage string
      const damage = roll(1, 4);
      if (!save_throw(3, tp)) {
        tp.t_stats.s_hpt -= damage;
        if (tp.t_stats.s_hpt <= 0) {
          const { killed } = await import("./fight.js");
          await killed(tp, true);
        } else {
          await msg("the missile hits the monster");
        }
      } else {
        await msg("the missile misses the monster");
      }
      return;
    }
  }

  await msg("the missile vanishes with a puff of smoke");
}

/**
 * bolt: Fire a bolt (lightning, fire, cold) in a direction.
 * C original: bolt bounces off walls by reversing direction.
 */
async function bolt(obj: GameObj): Promise<void> {
  let y = state.player.t_pos.y;
  let x = state.player.t_pos.x;
  let dirY = state.delta.y;
  let dirX = state.delta.x;
  let bounced = false;

  const boltName = ws_info[obj.o_which]?.oi_name || "bolt";

  for (let i = 0; i < BOLT_LENGTH; i++) {
    y += dirY;
    x += dirX;

    if (y <= 0 || y >= NUMLINES - 1 || x < 0 || x >= NUMCOLS) {
      // Bounce off edge
      if (!bounced) {
        bounced = true;
        dirY = -dirY;
        dirX = -dirX;
        y += dirY;
        x += dirX;
        continue;
      }
      break;
    }

    const ch = chat(y, x);
    if (ch === " " || ch === "|" || ch === "-") {
      // Bounce off wall
      if (!bounced) {
        bounced = true;
        dirY = -dirY;
        dirX = -dirX;
        y += dirY;
        x += dirX;
        continue;
      }
      break;
    }

    // Check if bolt hits the player (bounced bolt)
    if (y === state.player.t_pos.y && x === state.player.t_pos.x) {
      const damage = roll(6, 6);
      if (!save_throw(3, state.player as any)) {
        state.player.t_stats.s_hpt -= damage;
        await msg("your own bolt of %s hits you", boltName);
        if (state.player.t_stats.s_hpt <= 0) {
          const { death } = await import("./rip.js");
          await death("b");
        }
      } else {
        await msg("your bolt of %s whizzes by you", boltName);
      }
      return;
    }

    const tp = moat(y, x);
    if (tp !== null && tp._kind === "monster") {
      const damage = roll(6, 6);

      if (!save_throw(3, tp)) {
        tp.t_stats.s_hpt -= damage;
        if (tp.t_stats.s_hpt <= 0) {
          const { killed } = await import("./fight.js");
          await killed(tp, true);
        } else {
          await msg("the bolt of %s hits the monster", boltName);
        }
      } else {
        await msg("the bolt of %s barely misses the monster", boltName);
      }
      return;
    }
  }

  // Bolt fizzled without hitting anything
  await msg("the bolt of %s bounces off the wall", boltName);
}
