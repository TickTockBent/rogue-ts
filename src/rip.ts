/**
 * Death and scoring.
 * Ported from rip.c — simplified for Phase 6 milestone.
 */

import type { RogueResult } from "./types.js";
import { state, monsters as monsterTemplates, AMULET } from "./globals.js";

// Kill-name table
const killNames: Record<string, string> = {
  s: "starvation",
  a: "arrow",
  d: "dart",
};

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
 * death: The player has died. Record the result and exit.
 */
export async function death(monType: string): Promise<never> {
  state.playing = false;

  const result: RogueResult = {
    outcome: "death",
    gold: state.purse,
    level: state.level,
    killer: killname(monType),
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
 * total_winner: The player has won — found the amulet and escaped.
 * Stubbed for Phase 6.
 */
export async function total_winner(): Promise<never> {
  state.playing = false;

  const result: RogueResult = {
    outcome: "victory",
    gold: state.purse,
    level: state.level,
  };

  state._result = result;

  const { RogueExit } = await import("./types.js");
  throw new RogueExit(0);
}
