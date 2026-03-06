/**
 * Main game entry point and loop.
 * Ported from main.c
 */

import type { CursesBackend } from "./curses.js";
import type { RogueOptions, RogueResult } from "./types.js";
import { RogueExit } from "./types.js";
import { state, resetState, NUMLINES, NUMCOLS } from "./globals.js";
import { setRNGSeed, rnd } from "./util.js";
import { setBackend, resetIOState } from "./io.js";
import {
  init_player, init_colors, init_names,
  init_stones, init_materials, init_probs,
} from "./init.js";
import { setNewThingFactory } from "./monsters.js";
import { new_thing } from "./things.js";
import { new_level } from "./new_level.js";
import { command } from "./command.js";
import { runners } from "./chase.js";
import { do_daemons, do_fuses } from "./daemon.js";
import { start_daemon, fuse } from "./daemon.js";
import { doctor, stomach, swander } from "./daemons.js";
import { status } from "./io.js";

const AFTER = 2; // daemon type flag

/**
 * startRogue: Initialize and run a game of Rogue.
 *
 * This is the primary public API. The caller provides a CursesBackend
 * implementation and optional configuration. Returns a RogueResult
 * describing how the game ended.
 */
export async function startRogue(
  backend: CursesBackend,
  options?: RogueOptions,
): Promise<RogueResult> {
  // Reset all mutable state
  resetState();
  resetIOState();

  // Wire the backend
  setBackend(backend);

  // Wire the circular dependency: monsters.ts needs things.ts new_thing
  setNewThingFactory(new_thing);

  // Seed the RNG
  const seed = options?.seed ?? Date.now();
  setRNGSeed(seed);
  state.seed = seed;

  // Player name
  if (options?.playerName) {
    state.whoami = options.playerName;
  }

  // Initialize curses
  const stdscr = backend.initscr();
  state.stdscr = stdscr;
  state.hw = backend.newwin(NUMLINES, NUMCOLS, 0, 0);

  // Initialize data tables and randomize names/colors
  init_probs();
  init_colors();
  init_names();
  init_stones();
  init_materials();

  // Initialize the player
  init_player();

  // Start daemons
  start_daemon(doctor, 0, AFTER);
  start_daemon(stomach, 0, AFTER);
  fuse(swander, 0, rnd(55) + 1, AFTER);

  // Generate the first level
  new_level();
  state._newLevel = false;

  // Run the game loop
  try {
    await playit();
  } catch (err) {
    if (err instanceof RogueExit) {
      // Normal game termination
    } else {
      throw err;
    }
  }

  // Clean up curses
  await backend.endwin();

  return state._result ?? {
    outcome: "quit",
    gold: state.purse,
    level: state.level,
  };
}

/**
 * playit: The main game loop.
 */
async function playit(): Promise<void> {
  while (state.playing) {
    // Check if we need a new level (from stairs or trap)
    if (state._newLevel) {
      state._newLevel = false;
      new_level();
    }

    // Execute a player command
    const monstersTurn = await command();

    // If monsters get a turn
    if (monstersTurn) {
      // Run daemons and fuses
      await do_daemons(AFTER);
      await do_fuses(AFTER);

      // Move monsters
      if (state.playing) {
        await runners();
      }
    }
  }
}
