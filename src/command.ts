/**
 * Command dispatcher.
 * Ported from command.c — simplified for Phase 6 milestone.
 *
 * Handles all key input during the main game loop.
 */

import type { Coord } from "./types.js";
import {
  state, ESCAPE, NUMLINES, NUMCOLS,
  STAIRS, AMULET, AMULETLEVEL,
  ISHUH,
  FLOOR, PASSAGE, DOOR,
  chat,
} from "./globals.js";
import { CTRL } from "./util.js";
import { msg, readchar, status, getBackend } from "./io.js";
import { do_move, do_run } from "./move.js";
import { pick_up } from "./pack.js";
import { inventory } from "./pack.js";
import { look } from "./misc.js";
import { quit } from "./rip.js";

// Direction deltas for movement keys
const dirMap: Record<string, [number, number]> = {
  h: [0, -1],
  j: [1, 0],
  k: [-1, 0],
  l: [0, 1],
  y: [-1, -1],
  u: [-1, 1],
  b: [1, -1],
  n: [1, 1],
};

// Uppercase = run in that direction
const runMap: Record<string, string> = {
  H: "h", J: "j", K: "k", L: "l",
  Y: "y", U: "u", B: "b", N: "n",
};

/**
 * command: Read and execute a command.
 * Returns true if the turn should end (monsters move).
 */
export async function command(): Promise<boolean> {
  const backend = getBackend();

  // Handle no_command (paralysis, etc.)
  if (state.no_command > 0) {
    state.no_command--;
    if (state.no_command === 0) {
      await msg("you can move again");
    }
    return true;
  }

  // If counting moves, continue the last direction
  if (state.count > 0) {
    state.count--;
    return await executeDirection(state.last_dir);
  }

  state.after = true;

  // If running, continue the run
  if (state.running) {
    return await executeDirection(state.runch);
  }

  // Draw surrounding area
  await look(true);
  await status();
  backend.move(state.player.t_pos.y, state.player.t_pos.x);
  backend.refresh();

  // Pick up items if auto-pickup is pending
  if (state.take !== "") {
    const takeCh = state.take;
    state.take = "";
    await pick_up(takeCh);
  }

  // Read the command
  const ch = await readchar();

  // Check for movement
  if (dirMap[ch]) {
    const [dy, dx] = dirMap[ch];
    state.last_dir = ch;
    await do_move(dy, dx);
    return state.after;
  }

  // Check for running
  if (runMap[ch]) {
    const dir = runMap[ch];
    do_run(dir);
    state.last_dir = dir;
    const [dy, dx] = dirMap[dir];
    await do_move(dy, dx);
    return state.after;
  }

  // Other commands
  switch (ch) {
    case ".":
      // Rest — do nothing, let monsters move
      break;

    case "s":
      // Search for hidden doors/traps
      await search();
      break;

    case ">":
      // Go down stairs
      await goDownStairs();
      break;

    case "<":
      // Go up stairs (need amulet)
      await goUpStairs();
      break;

    case "i":
      // Inventory
      state.after = false;
      await inventory(state.player.t_pack, 0);
      break;

    case ",":
    case "g":
      // Pick up item
      {
        const pickCh = chat(state.player.t_pos.y, state.player.t_pos.x);
        if (pickCh === FLOOR || pickCh === PASSAGE || pickCh === DOOR || pickCh === " ") {
          await msg("nothing to pick up");
        } else {
          await pick_up(pickCh);
        }
      }
      break;

    case "Q":
      // Quit
      state.after = false;
      await msg("really quit?");
      {
        const answer = await readchar();
        if (answer === "y" || answer === "Y") {
          await quit();
        } else {
          await msg("");
        }
      }
      break;

    case String.fromCharCode(CTRL("R")):
      // Redraw screen
      state.after = false;
      if (state.stdscr !== null) {
        backend.clearok(state.stdscr, true);
      }
      backend.refresh();
      break;

    case "?":
      // Help (stubbed for Phase 6)
      state.after = false;
      await msg("movement: hjklyubn  .: rest  s: search  >: stairs  i: inventory  Q: quit");
      break;

    case "v":
      // Version
      state.after = false;
      await msg("rogue-ts version: 5.4.4-ts (Phase 6)");
      break;

    default:
      // Unknown command
      state.after = false;
      if (state.terse) {
        await msg("illegal cmd '%s'", ch);
      } else {
        await msg("illegal command '%s'", ch);
      }
      state.count = 0;
      break;
  }

  return state.after;
}

/**
 * executeDirection: Execute movement in a saved direction.
 */
async function executeDirection(dir: string): Promise<boolean> {
  if (!dirMap[dir]) return false;
  const [dy, dx] = dirMap[dir];
  await do_move(dy, dx);
  return state.after;
}

/**
 * search: Look for hidden things around the hero.
 */
async function search(): Promise<void> {
  const heroPos = state.player.t_pos;

  // Confused search might not work
  if (state.player.t_flags & ISHUH) {
    return;
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dy === 0 && dx === 0) continue;
      const ny = heroPos.y + dy;
      const nx = heroPos.x + dx;
      if (ny <= 0 || ny >= NUMLINES - 1 || nx < 0 || nx >= NUMCOLS) continue;

      // Simplified search: just notify (full secret door detection in Phase 7+)
    }
  }
}

/**
 * goDownStairs: Descend to the next level.
 */
async function goDownStairs(): Promise<void> {
  if (chat(state.player.t_pos.y, state.player.t_pos.x) !== STAIRS) {
    if (state.terse) {
      await msg("no stairs");
    } else {
      await msg("I see no way down");
    }
    return;
  }

  state.level++;
  state.seenstairs = false;
  // new_level will be called by the game loop
  state._newLevel = true;
}

/**
 * goUpStairs: Ascend (only with the amulet, only at level 1).
 */
async function goUpStairs(): Promise<void> {
  if (chat(state.player.t_pos.y, state.player.t_pos.x) !== STAIRS) {
    if (state.terse) {
      await msg("no stairs");
    } else {
      await msg("I see no way up");
    }
    return;
  }

  if (!state.amulet) {
    await msg("your way is magically blocked");
    return;
  }

  state.level--;
  if (state.level <= 0) {
    const { total_winner } = await import("./rip.js");
    await total_winner();
    return;
  }
  state._newLevel = true;
}
