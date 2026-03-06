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
import { doctor, stomach, swander, rollwand, unconfuse, unsee, sight, nohaste } from "./daemons.js";
import { land } from "./potions.js";
import { status } from "./io.js";
import { registerDaemonFunc, saveGame, restoreGame } from "./save.js";

const AFTER = 2; // daemon type flag

/**
 * registerAllDaemons: Register all daemon/fuse callbacks for save/restore.
 */
function registerAllDaemons(): void {
  registerDaemonFunc("doctor", doctor);
  registerDaemonFunc("stomach", stomach);
  registerDaemonFunc("swander", swander);
  registerDaemonFunc("rollwand", rollwand);
  registerDaemonFunc("unconfuse", unconfuse);
  registerDaemonFunc("unsee", unsee);
  registerDaemonFunc("sight", sight);
  registerDaemonFunc("nohaste", nohaste);
  registerDaemonFunc("land", land);
}

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

  // Register daemon functions for save/restore
  registerAllDaemons();

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

  // Check if this was a save
  if (state._saveData !== null) {
    return {
      outcome: "save",
      gold: state.purse,
      level: state.level,
      saveData: state._saveData,
    };
  }

  return state._result ?? {
    outcome: "quit",
    gold: state.purse,
    level: state.level,
  };
}

/**
 * resumeRogue: Resume a saved game from a JSON string.
 *
 * The caller provides the same CursesBackend, plus the save data.
 * Returns a RogueResult when the game ends.
 */
export async function resumeRogue(
  backend: CursesBackend,
  saveData: string,
): Promise<RogueResult> {
  // Reset all mutable state
  resetState();
  resetIOState();

  // Wire the backend
  setBackend(backend);
  setNewThingFactory(new_thing);
  registerAllDaemons();

  // Initialize curses
  const stdscr = backend.initscr();
  state.stdscr = stdscr;
  state.hw = backend.newwin(NUMLINES, NUMCOLS, 0, 0);

  // Restore saved state
  if (!restoreGame(saveData)) {
    await backend.endwin();
    return { outcome: "quit", gold: 0, level: 0 };
  }

  // Restore RNG seed
  setRNGSeed(state.seed);

  // Redraw the level from the places array
  for (let x = 0; x < NUMCOLS; x++) {
    for (let y = 0; y < NUMLINES; y++) {
      const ch = state.places[(x << 5) + y].p_ch;
      const mon = state.places[(x << 5) + y].p_monst;
      if (mon !== null && mon._kind === "monster") {
        backend.mvaddch(y, x, mon.t_disguise.charCodeAt(0));
      } else if (ch !== " ") {
        backend.mvaddch(y, x, ch.charCodeAt(0));
      }
    }
  }
  backend.refresh();

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

  await backend.endwin();

  if (state._saveData !== null) {
    return {
      outcome: "save",
      gold: state.purse,
      level: state.level,
      saveData: state._saveData,
    };
  }

  return state._result ?? {
    outcome: "quit",
    gold: state.purse,
    level: state.level,
  };
}

// Re-export saveGame for the public API
export { saveGame } from "./save.js";

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
