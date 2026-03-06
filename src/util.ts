/**
 * Utility functions: RNG, dice, sprintf, and macro functions.
 * Ported from rogue's RNG (mdport.c) and various macros in rogue.h.
 */

import type { Coord, Thing, Stats } from "./types.js";

// --- RNG ---

let seed = 0;

export function setRNGSeed(newSeed: number): void {
  seed = newSeed;
}

export function getRNGSeed(): number {
  return seed;
}

/**
 * Linear congruential RNG matching the original Rogue.
 * Uses Math.imul to avoid JS precision loss on large multiplications.
 */
export function RN(): number {
  seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
  return seed;
}

export function rnd(range: number): number {
  return range === 0 ? 0 : Math.abs(RN()) % range;
}

export function roll(number: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < number; i++) {
    total += rnd(sides) + 1;
  }
  return total;
}

// --- Math utilities ---

export function sign(nm: number): number {
  if (nm < 0) return -1;
  if (nm > 0) return 1;
  return 0;
}

export function spread(nm: number): number {
  return nm - nm + rnd(2 * nm + 1);
}

// --- Macro functions from rogue.h ---

export function ce(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function on(thing: { t_flags?: number; o_flags?: number; flags?: number }, flag: number): boolean {
  const flags = (thing as { t_flags?: number }).t_flags
    ?? (thing as { o_flags?: number }).o_flags
    ?? (thing as { flags?: number }).flags
    ?? 0;
  return (flags & flag) !== 0;
}

export function off(thing: { t_flags?: number; o_flags?: number; flags?: number }, flag: number): boolean {
  return !on(thing, flag);
}

export function isMonster(thing: Thing): thing is import("./types.js").Monster {
  return thing._kind === "monster";
}

export function isObject(thing: Thing): thing is import("./types.js").GameObj {
  return thing._kind === "object";
}

export function CTRL(ch: string): number {
  return ch.charCodeAt(0) & 0o37;
}

// --- sprintf ---

/**
 * C-style sprintf supporting: %d, %s, %c, %ld, %-Nd, %*d, %%, %x, %o
 */
export function sprintf(fmt: string, ...args: unknown[]): string {
  let result = "";
  let argIndex = 0;
  let i = 0;

  while (i < fmt.length) {
    if (fmt[i] !== "%") {
      result += fmt[i];
      i++;
      continue;
    }

    i++; // skip '%'

    if (i >= fmt.length) break;

    // Handle %%
    if (fmt[i] === "%") {
      result += "%";
      i++;
      continue;
    }

    // Parse flags
    let leftJustify = false;
    let zeroPad = false;
    let plusSign = false;

    while (i < fmt.length) {
      if (fmt[i] === "-") {
        leftJustify = true;
        i++;
      } else if (fmt[i] === "0") {
        zeroPad = true;
        i++;
      } else if (fmt[i] === "+") {
        plusSign = true;
        i++;
      } else {
        break;
      }
    }

    // Parse width
    let width = 0;
    let widthFromArg = false;

    if (i < fmt.length && fmt[i] === "*") {
      widthFromArg = true;
      width = Number(args[argIndex++]);
      i++;
    } else {
      while (i < fmt.length && fmt[i] >= "0" && fmt[i] <= "9") {
        width = width * 10 + (fmt.charCodeAt(i) - 48);
        i++;
      }
    }

    // Parse precision (ignored for now but consume it)
    if (i < fmt.length && fmt[i] === ".") {
      i++;
      if (i < fmt.length && fmt[i] === "*") {
        argIndex++;
        i++;
      } else {
        while (i < fmt.length && fmt[i] >= "0" && fmt[i] <= "9") {
          i++;
        }
      }
    }

    // Skip length modifier
    if (i < fmt.length && fmt[i] === "l") {
      i++;
    }

    if (i >= fmt.length) break;

    // Format specifier
    const spec = fmt[i];
    i++;
    let formatted = "";

    switch (spec) {
      case "d":
      case "i": {
        const numValue = Number(args[argIndex++]);
        formatted = String(numValue);
        if (plusSign && numValue >= 0) formatted = "+" + formatted;
        break;
      }
      case "s": {
        formatted = String(args[argIndex++]);
        break;
      }
      case "c": {
        const charArg = args[argIndex++];
        if (typeof charArg === "number") {
          formatted = String.fromCharCode(charArg);
        } else {
          formatted = String(charArg).charAt(0);
        }
        break;
      }
      case "x": {
        formatted = (Number(args[argIndex++]) >>> 0).toString(16);
        break;
      }
      case "o": {
        formatted = (Number(args[argIndex++]) >>> 0).toString(8);
        break;
      }
      default: {
        formatted = "%" + spec;
        break;
      }
    }

    // Apply width padding
    if (width > 0 && formatted.length < width) {
      const padChar = zeroPad && !leftJustify ? "0" : " ";
      const padding = padChar.repeat(width - formatted.length);
      if (leftJustify) {
        formatted = formatted + padding;
      } else {
        formatted = padding + formatted;
      }
    }

    result += formatted;
  }

  return result;
}
