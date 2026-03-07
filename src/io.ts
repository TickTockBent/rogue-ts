/**
 * Input/output functions.
 * Ported from io.c
 *
 * msg(), addmsg(), endmsg(), readchar(), wait_for(), status(), step_ok()
 */

import type { CursesBackend } from "./curses.js";
import { state, NUMCOLS, STATLINE, ESCAPE } from "./globals.js";
import { sprintf } from "./util.js";

// Module-level reference to the curses backend, set during init
let backend: CursesBackend = null as unknown as CursesBackend;

export function setBackend(newBackend: CursesBackend): void {
  backend = newBackend;
}

export function getBackend(): CursesBackend {
  return backend;
}

// Message buffer state (matches static vars in io.c)
const MAXMSG = NUMCOLS - 8; // sizeof("--More--") = 8
let msgbuf = "";
let newpos = 0;

/**
 * msg: Display a message at the top of the screen.
 * Returns ~ESCAPE normally, ESCAPE if user pressed escape during --More--.
 */
export async function msg(fmt: string, ...args: unknown[]): Promise<number> {
  if (fmt === "") {
    backend.move(0, 0);
    backend.clrtoeol();
    state.mpos = 0;
    return ~ESCAPE;
  }
  // If previous doadd set overflow flag, flush first
  if (needFlush) {
    needFlush = false;
    await endmsg();
  }
  doadd(fmt, args);
  return await endmsg();
}

/**
 * addmsg: Add to the current message buffer without displaying.
 */
export function addmsg(fmt: string, ...args: unknown[]): void {
  doadd(fmt, args);
}

/**
 * endmsg: Display the message buffer, handling --More-- if needed.
 */
export async function endmsg(): Promise<number> {
  if (state.save_msg) {
    state.huh = msgbuf;
  }

  if (state.mpos > 0) {
    // There's already a message on screen — show --More-- and wait
    // Call look(FALSE) before showing --More-- per C original
    try {
      const { look } = await import("./misc.js");
      await look(false);
    } catch {
      // During init, misc.js may not be ready yet — skip
    }
    backend.mvaddstr(0, state.mpos, "--More--");
    backend.refresh();

    if (!state.msg_esc) {
      await wait_for(" ");
    } else {
      let ch: string;
      while (true) {
        ch = await readchar();
        if (ch === " ") break;
        if (ch.charCodeAt(0) === ESCAPE) {
          msgbuf = "";
          state.mpos = 0;
          newpos = 0;
          return ESCAPE;
        }
      }
    }
  }

  // Capitalize first letter unless it's a pack letter like "a)"
  if (msgbuf.length > 0 && msgbuf[0] >= "a" && msgbuf[0] <= "z"
    && !state.lower_msg && msgbuf[1] !== ")") {
    msgbuf = msgbuf[0].toUpperCase() + msgbuf.slice(1);
  }

  backend.mvaddstr(0, 0, msgbuf);
  backend.clrtoeol();
  state.mpos = newpos;
  newpos = 0;
  msgbuf = "";
  backend.refresh();
  return ~ESCAPE;
}

/**
 * doadd: Perform a sprintf and append to message buffer.
 * In the C original, if the buffer would overflow the screen width,
 * endmsg() is called to flush with --More--. Since endmsg is async
 * and doadd is sync, we set a flag for msg() to handle the flush.
 */
let needFlush = false;

function doadd(fmt: string, args: unknown[]): void {
  const buf = sprintf(fmt, ...args);
  if (buf.length + newpos >= MAXMSG) {
    needFlush = true;
  }
  msgbuf += buf;
  newpos = msgbuf.length;
}

/**
 * step_ok: Returns true if it is ok to step on the given character.
 */
export function step_ok(ch: string): boolean {
  switch (ch) {
    case " ":
    case "|":
    case "-":
      return false;
    default:
      // Not ok if it's an uppercase or lowercase letter (a monster)
      return !(ch >= "A" && ch <= "Z") && !(ch >= "a" && ch <= "z");
  }
}

/**
 * readchar: Read and return a character from input.
 * This is the primary async bridge to getch().
 */
export async function readchar(): Promise<string> {
  const charCode = await backend.getch();

  // Ctrl-C = quit (char code 3)
  if (charCode === 3) {
    // In the original, this calls quit(0).
    // For now, treat as escape.
    return String.fromCharCode(ESCAPE);
  }

  return String.fromCharCode(charCode);
}

/**
 * wait_for: Sit around until the user types the specified character.
 */
export async function wait_for(ch: string): Promise<void> {
  if (ch === "\n") {
    let c: string;
    do {
      c = await readchar();
    } while (c !== "\n" && c !== "\r");
  } else {
    while ((await readchar()) !== ch) {
      // keep reading
    }
  }
}

// Status line static state (matching io.c statics)
let statusHpWidth = 0;
let statusHungry = 0;
let statusLevel = 0;
let statusPurse = -1;
let statusHp = 0;
let statusArm = 0;
let statusStr = 0;
let statusExp = 0;

const stateName = ["", "Hungry", "Weak", "Faint"];

/**
 * status: Display the important stats line. Keep the cursor where it was.
 */
export async function status(): Promise<void> {
  const playerStats = state.player.t_stats;
  const currentArmor = state.cur_armor;
  const temp = currentArmor !== null && currentArmor._kind === "object"
    ? currentArmor.o_arm
    : playerStats.s_arm;

  // If nothing changed, don't bother
  if (
    statusHp === playerStats.s_hpt &&
    statusExp === playerStats.s_exp &&
    statusPurse === state.purse &&
    statusArm === temp &&
    statusStr === playerStats.s_str &&
    statusLevel === state.level &&
    statusHungry === state.hungry_state &&
    !state.stat_msg
  ) {
    return;
  }

  const [savedY, savedX] = backend.getyx();

  if (statusHp !== playerStats.s_maxhp) {
    let hpTemp = playerStats.s_maxhp;
    statusHp = playerStats.s_maxhp;
    statusHpWidth = 0;
    while (hpTemp > 0) {
      statusHpWidth++;
      hpTemp = Math.floor(hpTemp / 10);
    }
    if (statusHpWidth === 0) statusHpWidth = 1;
  }

  statusLevel = state.level;
  statusPurse = state.purse;
  statusHp = playerStats.s_hpt;
  statusStr = playerStats.s_str;
  statusExp = playerStats.s_exp;
  statusHungry = state.hungry_state;
  statusArm = temp;

  const line = sprintf(
    "Level: %d  Gold: %-5d  Hp: %*d(%*d)  Str: %2d(%d)  Arm: %-2d  Exp: %d/%d  %s",
    state.level, state.purse,
    statusHpWidth, playerStats.s_hpt,
    statusHpWidth, playerStats.s_maxhp,
    playerStats.s_str, state.max_stats.s_str,
    10 - statusArm,
    playerStats.s_lvl, playerStats.s_exp,
    stateName[state.hungry_state] || ""
  );

  if (state.stat_msg) {
    backend.move(0, 0);
    await msg(line);
  } else {
    backend.move(STATLINE, 0);
    backend.addstr(line);
  }

  backend.clrtoeol();
  backend.move(savedY, savedX);
}

/**
 * show_win: Display a window and wait before returning.
 */
export async function show_win(message: string): Promise<void> {
  const win = state.hw;
  if (win === null) return;

  backend.wmove(win, 0, 0);
  backend.waddstr(win, message);
  backend.touchwin(win);
  backend.wmove(win, state.player.t_pos.y, state.player.t_pos.x);
  backend.wrefresh(win);
  await wait_for(" ");
  if (state.stdscr !== null) {
    backend.touchwin(state.stdscr);
  }
}

/**
 * Reset static status line state (for new game).
 */
export function resetIOState(): void {
  msgbuf = "";
  newpos = 0;
  statusHpWidth = 0;
  statusHungry = 0;
  statusLevel = 0;
  statusPurse = -1;
  statusHp = 0;
  statusArm = 0;
  statusStr = 0;
  statusExp = 0;
}
