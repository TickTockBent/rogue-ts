/**
 * Daemon and fuse system.
 * Ported from daemon.c
 *
 * Daemons run every turn. Fuses run after N turns.
 * Both use the d_list array in state.
 */

import type { DelayedAction } from "./types.js";
import { state, MAXDAEMONS } from "./globals.js";

const EMPTY = 0;
const DAEMON = -1;

/**
 * d_slot: Find an empty slot in the daemon/fuse list.
 */
function d_slot(): DelayedAction | null {
  for (const dev of state.d_list) {
    if (dev.d_type === EMPTY) {
      return dev;
    }
  }
  return null;
}

/**
 * find_slot: Find a slot by its function reference.
 */
export function find_slot(func: ((arg: number) => Promise<void>) | null): DelayedAction | null {
  if (func === null) return null;
  for (const dev of state.d_list) {
    if (dev.d_type !== EMPTY && dev.d_func === func) {
      return dev;
    }
  }
  return null;
}

/**
 * start_daemon: Start a daemon that runs every turn.
 */
export function start_daemon(func: (arg: number) => Promise<void>, arg: number, type: number): void {
  const dev = d_slot();
  if (dev === null) return;
  dev.d_type = type;
  dev.d_func = func;
  dev.d_arg = arg;
  dev.d_time = DAEMON;
}

/**
 * kill_daemon: Remove a daemon from the list.
 */
export function kill_daemon(func: (arg: number) => Promise<void>): void {
  const dev = find_slot(func);
  if (dev === null) return;
  dev.d_type = EMPTY;
  dev.d_func = null;
}

/**
 * do_daemons: Run all active daemons with the given flag.
 * Must be async because daemon callbacks can call msg() → getch().
 */
export async function do_daemons(flag: number): Promise<void> {
  for (const dev of state.d_list) {
    if (dev.d_type === flag && dev.d_time === DAEMON && dev.d_func !== null) {
      await dev.d_func(dev.d_arg);
    }
  }
}

/**
 * fuse: Start a fuse to go off in a certain number of turns.
 */
export function fuse(func: (arg: number) => Promise<void>, arg: number, time: number, type: number): void {
  const wire = d_slot();
  if (wire === null) return;
  wire.d_type = type;
  wire.d_func = func;
  wire.d_arg = arg;
  wire.d_time = time;
}

/**
 * lengthen: Increase the time until a fuse goes off.
 */
export function lengthen(func: (arg: number) => Promise<void>, xtime: number): void {
  const wire = find_slot(func);
  if (wire === null) return;
  wire.d_time += xtime;
}

/**
 * extinguish: Put out a fuse.
 */
export function extinguish(func: (arg: number) => Promise<void>): void {
  const wire = find_slot(func);
  if (wire === null) return;
  wire.d_type = EMPTY;
  wire.d_func = null;
}

/**
 * do_fuses: Decrement counters and fire expired fuses.
 * Must be async because fuse callbacks can call msg() → getch().
 */
export async function do_fuses(flag: number): Promise<void> {
  for (const wire of state.d_list) {
    if (flag === wire.d_type && wire.d_time > 0) {
      wire.d_time--;
      if (wire.d_time === 0 && wire.d_func !== null) {
        wire.d_type = EMPTY;
        const func = wire.d_func;
        wire.d_func = null;
        await func(wire.d_arg);
      }
    }
  }
}
