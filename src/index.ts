/**
 * @ticktockbent/rogue-ts — Rogue 5.4.4 ported to TypeScript
 *
 * Public API exports.
 */

export type { CursesBackend, CursesWindow } from "./curses.js";
export {
  A_NORMAL, A_STANDOUT, A_UNDERLINE, A_REVERSE, A_BLINK, A_BOLD,
  A_CHARTEXT, A_COLOR,
  COLOR_BLACK, COLOR_RED, COLOR_GREEN, COLOR_YELLOW,
  COLOR_BLUE, COLOR_MAGENTA, COLOR_CYAN, COLOR_WHITE,
  KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_HOME, KEY_END,
  KEY_F0, KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5,
  KEY_F6, KEY_F7, KEY_F8, KEY_F9, KEY_F10, KEY_F11, KEY_F12,
  ERR, OK,
} from "./curses.js";

export type { RogueOptions, RogueResult, Coord, Stats } from "./types.js";
export { RogueExit } from "./types.js";

export { startRogue } from "./main.js";
