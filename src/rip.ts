/**
 * Death and scoring.
 * Ported from rip.c
 */

import type { RogueResult, Thing, GameObj } from "./types.js";
import {
  state,
  monsters as monsterTemplates, AMULET,
  NUMLINES, NUMCOLS,
  POTION, SCROLL, WEAPON, ARMOR, RING, STICK, FOOD, GOLD,
  pot_info, scr_info, weap_info, arm_info, ring_info, ws_info,
  MAXPOTIONS, MAXSCROLLS, MAXWEAPONS, MAXARMORS, MAXRINGS, MAXSTICKS,
} from "./globals.js";
import { getBackend, wait_for } from "./io.js";
import { inv_name } from "./things.js";

// Kill-name table
const killNames: Record<string, string> = {
  s: "starvation",
  a: "arrow",
  d: "dart",
};

// ASCII tombstone art — ported from rip.c
const tombstone = [
  "                       __________",
  "                      /          \\",
  "                     /    REST    \\",
  "                    /      IN      \\",
  "                   /     PEACE      \\",
  "                  /                  \\",
  "                  |                  |",
  "                  |                  |",
  "                  |                  |",
  "                  |                  |",
  "                  |                  |",
  "                  |                  |",
  "                 *|     *     *      |*",
  "         ________)|//\\//\\///\\//\\//\\//|(________",
];

/**
 * killname: Get the name of the thing that killed the player.
 */
export function killname(monType: string): string {
  if (killNames[monType]) {
    return killNames[monType];
  }
  const idx = monType.charCodeAt(0) - "A".charCodeAt(0);
  if (idx >= 0 && idx < 26) {
    return monsterTemplates[idx].m_name;
  }
  return "mysterious force";
}

/**
 * center: Center a string in a field of given width.
 */
function center(str: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - str.length) / 2));
  return " ".repeat(padding) + str;
}

/**
 * draw_tombstone: Draw the ASCII tombstone on the screen.
 */
async function draw_tombstone(killer: string): Promise<void> {
  const backend = getBackend();
  backend.clear();

  // Draw the tombstone art
  for (let row = 0; row < tombstone.length; row++) {
    backend.mvaddstr(row, 0, tombstone[row]);
  }

  // Fill in player details on the tombstone
  // Name (row 6), killed by (row 7), gold (row 8), level (row 9)
  const nameStr = center(state.whoami, 20);
  backend.mvaddstr(6, 18, nameStr);

  const goldStr = center(`${state.purse} Au`, 20);
  backend.mvaddstr(7, 18, goldStr);

  const killedStr = center(`killed by`, 20);
  backend.mvaddstr(8, 18, killedStr);

  const killerStr = center(killer, 20);
  backend.mvaddstr(9, 18, killerStr);

  const levelStr = center(`on level ${state.level}`, 20);
  backend.mvaddstr(10, 18, levelStr);

  backend.refresh();
  await wait_for(" ");
}

/**
 * death: The player has died. Record the result and exit.
 */
export async function death(monType: string): Promise<never> {
  state.playing = false;

  const killer = killname(monType);

  if (state.tombstone) {
    await draw_tombstone(killer);
  }

  const result: RogueResult = {
    outcome: "death",
    gold: state.purse,
    level: state.level,
    killer,
  };

  // Store result so main loop can return it
  state._result = result;

  // Throw to unwind the call stack back to the game loop
  const { RogueExit } = await import("./types.js");
  throw new RogueExit(0);
}

/**
 * quit: The player wants to quit.
 */
export async function quit(): Promise<never> {
  state.playing = false;

  const result: RogueResult = {
    outcome: "quit",
    gold: state.purse,
    level: state.level,
  };

  state._result = result;

  const { RogueExit } = await import("./types.js");
  throw new RogueExit(0);
}

/**
 * item_worth: Calculate the value of an item.
 */
function item_worth(obj: GameObj): number {
  const typeChar = String.fromCharCode(obj.o_type);
  let worth = 0;

  switch (typeChar) {
    case POTION:
      worth = pot_info[obj.o_which]?.oi_worth || 0;
      break;
    case SCROLL:
      worth = scr_info[obj.o_which]?.oi_worth || 0;
      break;
    case FOOD:
      worth = 2;
      break;
    case WEAPON:
      worth = (weap_info[obj.o_which]?.oi_worth || 0);
      worth += (obj.o_hplus + obj.o_dplus) * 100;
      break;
    case ARMOR:
      worth = (arm_info[obj.o_which]?.oi_worth || 0);
      break;
    case RING:
      worth = (ring_info[obj.o_which]?.oi_worth || 0);
      if (obj.o_arm > 0) worth += obj.o_arm * 100;
      break;
    case STICK:
      worth = (ws_info[obj.o_which]?.oi_worth || 0);
      worth += 20 * obj.o_arm; // remaining charges
      break;
    case GOLD:
      worth = obj.o_arm;
      break;
    case AMULET:
      worth = 1000;
      break;
  }

  if (worth < 0) worth = 0;
  return worth * obj.o_count;
}

/**
 * total_winner: The player has won — found the amulet and escaped.
 * Display inventory with item values.
 */
export async function total_winner(): Promise<never> {
  state.playing = false;

  const backend = getBackend();
  backend.clear();
  backend.mvaddstr(0, 0, "                           @ @ @ @ @ @ @ @");
  backend.mvaddstr(1, 0, "                         @ @ @ @ @ @ @ @ @ @");
  backend.mvaddstr(2, 0, "                       @   Langstrumpf 3   @");
  backend.mvaddstr(3, 0, "                         The Strider of the");
  backend.mvaddstr(4, 0, "                            Dungeons of Doom");
  backend.mvaddstr(5, 0, "                         @ @ @ @ @ @ @ @ @ @");
  backend.mvaddstr(6, 0, "                           @ @ @ @ @ @ @ @");

  backend.mvaddstr(8, 0, `   You made it out of the Dungeons of Doom with the Amulet of Yendor!`);

  // Calculate inventory worth
  let totalWorth = state.purse;
  let row = 10;
  let item = state.player.t_pack;

  backend.mvaddstr(row++, 0, "   Pack contents:");
  while (item !== null) {
    if (item._kind === "object") {
      const worth = item_worth(item);
      totalWorth += worth;
      const line = `   ${inv_name(item, false)}  (${worth} gold)`;
      if (row < NUMLINES - 2) {
        backend.mvaddstr(row, 0, line);
        row++;
      }
    }
    item = item.l_next;
  }

  if (row < NUMLINES - 2) {
    row++;
    backend.mvaddstr(row, 0, `   Total value: ${totalWorth} gold pieces`);
  }

  backend.mvaddstr(NUMLINES - 1, 0, "--Press space to continue--");
  backend.refresh();
  await wait_for(" ");

  const result: RogueResult = {
    outcome: "victory",
    gold: totalWorth,
    level: state.level,
  };

  state._result = result;

  const { RogueExit } = await import("./types.js");
  throw new RogueExit(0);
}
