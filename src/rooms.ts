/**
 * Room creation and layout.
 * Ported from rooms.c
 */

import type { Coord, Room, Place, Thing } from "./types.js";
import type { CursesBackend } from "./curses.js";
import {
  state, MAXROOMS, NUMLINES, NUMCOLS, ISDARK, ISGONE, ISMAZE,
  FLOOR, PASSAGE, DOOR, GOLD, PLAYER,
  F_PASS, F_REAL, F_SEEN, F_PNUM,
  ISBLIND, SEEMONST, ISMANY,
  INDEX, chat, setCh, flat, setFlat, moat,
  GOLDCALC,
} from "./globals.js";
import { rnd } from "./util.js";
import { step_ok, getBackend } from "./io.js";
import { new_item } from "./list.js";
import { _attach } from "./list.js";

const GOLDGRP = 1;

// Maze state (matching rooms.c statics)
interface MazeSpot {
  nexits: number;
  exits: Coord[];
  used: boolean;
}

let mazeMaxY = 0;
let mazeMaxX = 0;
let mazeStartY = 0;
let mazeStartX = 0;
const maze: MazeSpot[][] = [];

function initMaze(): void {
  const rows = Math.floor(NUMLINES / 3) + 1;
  const cols = Math.floor(NUMCOLS / 3) + 1;
  maze.length = 0;
  for (let y = 0; y <= rows; y++) {
    maze[y] = [];
    for (let x = 0; x <= cols; x++) {
      maze[y][x] = { nexits: 0, exits: [], used: false };
    }
  }
}

/**
 * rnd_room: Pick a random room that isn't gone.
 */
export function rnd_room(): number {
  let rm: number;
  do {
    rm = rnd(MAXROOMS);
  } while (state.rooms[rm].r_flags & ISGONE);
  return rm;
}

/**
 * do_rooms: Create rooms and corridors with a connectivity graph.
 * Monster/item placement is stubbed — filled in by later phases.
 */
export function do_rooms(): void {
  const bsze: Coord = {
    x: Math.floor(NUMCOLS / 3),
    y: Math.floor(NUMLINES / 3),
  };
  const top: Coord = { x: 0, y: 0 };

  // Clear things for a new level
  for (const rp of state.rooms) {
    rp.r_goldval = 0;
    rp.r_nexits = 0;
    rp.r_flags = 0;
    rp.r_exit = [];
  }

  // Put the gone rooms, if any, on the level
  const leftOut = rnd(4);
  for (let i = 0; i < leftOut; i++) {
    state.rooms[rnd_room()].r_flags |= ISGONE;
  }

  // Dig and populate all the rooms on the level
  for (let i = 0; i < MAXROOMS; i++) {
    const rp = state.rooms[i];

    // Find upper left corner of box that this room goes in
    top.x = (i % 3) * bsze.x + 1;
    top.y = Math.floor(i / 3) * bsze.y;

    if (rp.r_flags & ISGONE) {
      // Place a gone room
      do {
        rp.r_pos.x = top.x + rnd(bsze.x - 2) + 1;
        rp.r_pos.y = top.y + rnd(bsze.y - 2) + 1;
        rp.r_max.x = -NUMCOLS;
        rp.r_max.y = -NUMLINES;
      } while (!(rp.r_pos.y > 0 && rp.r_pos.y < NUMLINES - 1));
      continue;
    }

    // Set room type
    if (rnd(10) < state.level - 1) {
      rp.r_flags |= ISDARK;
      if (rnd(15) === 0) {
        rp.r_flags = ISMAZE;
      }
    }

    // Find a place and size for a random room
    if (rp.r_flags & ISMAZE) {
      rp.r_max.x = bsze.x - 1;
      rp.r_max.y = bsze.y - 1;
      rp.r_pos.x = top.x;
      if (rp.r_pos.x === 1) {
        rp.r_pos.x = 0;
      }
      rp.r_pos.y = top.y;
      if (rp.r_pos.y === 0) {
        rp.r_pos.y++;
        rp.r_max.y--;
      }
    } else {
      let roomSizeAttempts = 0;
      do {
        rp.r_max.x = rnd(bsze.x - 4) + 4;
        rp.r_max.y = rnd(bsze.y - 4) + 4;
        rp.r_pos.x = top.x + rnd(bsze.x - rp.r_max.x);
        rp.r_pos.y = top.y + rnd(bsze.y - rp.r_max.y);
        // Guard against infinite loop: when the room is too tall for
        // its grid cell, rnd(bsze.y - r_max.y) can only produce 0,
        // making r_pos.y permanently stuck at 0. Force y=1 as fallback.
        if (++roomSizeAttempts > 100 && rp.r_pos.y === 0) {
          rp.r_pos.y = 1;
        }
      } while (rp.r_pos.y === 0);
    }

    draw_room(rp);

    // Put the gold in
    if (rnd(2) === 0 && (!state.amulet || state.level >= state.max_level)) {
      const goldItem = new_item();
      goldItem.o_arm = rp.r_goldval = GOLDCALC();
      find_floor(rp, rp.r_gold, false, false);
      goldItem.o_pos.x = rp.r_gold.x;
      goldItem.o_pos.y = rp.r_gold.y;
      setCh(rp.r_gold.y, rp.r_gold.x, GOLD);
      goldItem.o_flags = ISMANY;
      goldItem.o_group = GOLDGRP;
      goldItem.o_type = GOLD.charCodeAt(0);
      // attach to lvl_obj list
      const listHead = { head: state.lvl_obj };
      _attach(listHead, goldItem);
      state.lvl_obj = listHead.head;
    }

    // Monster placement is deferred to Phase 4+
    // In the original: if (rnd(100) < (rp.r_goldval > 0 ? 80 : 25)) ...
  }
}

/**
 * draw_room: Draw a box around a room and lay down the floor.
 * For maze rooms, draw the maze.
 */
export function draw_room(rp: Room): void {
  if (rp.r_flags & ISMAZE) {
    do_maze(rp);
  } else {
    vert(rp, rp.r_pos.x);                         // left side
    vert(rp, rp.r_pos.x + rp.r_max.x - 1);       // right side
    horiz(rp, rp.r_pos.y);                         // top
    horiz(rp, rp.r_pos.y + rp.r_max.y - 1);       // bottom

    // Put the floor down
    for (let y = rp.r_pos.y + 1; y < rp.r_pos.y + rp.r_max.y - 1; y++) {
      for (let x = rp.r_pos.x + 1; x < rp.r_pos.x + rp.r_max.x - 1; x++) {
        setCh(y, x, FLOOR);
      }
    }
  }
}

/**
 * vert: Draw a vertical line (wall).
 */
export function vert(rp: Room, startx: number): void {
  for (let y = rp.r_pos.y + 1; y <= rp.r_max.y + rp.r_pos.y - 1; y++) {
    setCh(y, startx, "|");
  }
}

/**
 * horiz: Draw a horizontal line (wall).
 */
export function horiz(rp: Room, starty: number): void {
  for (let x = rp.r_pos.x; x <= rp.r_pos.x + rp.r_max.x - 1; x++) {
    setCh(starty, x, "-");
  }
}

/**
 * do_maze: Dig a maze in a room.
 */
export function do_maze(rp: Room): void {
  initMaze();

  mazeMaxY = rp.r_max.y;
  mazeMaxX = rp.r_max.x;
  mazeStartY = rp.r_pos.y;
  mazeStartX = rp.r_pos.x;

  const startY = Math.floor(rnd(rp.r_max.y) / 2) * 2;
  const startX = Math.floor(rnd(rp.r_max.x) / 2) * 2;

  const pos: Coord = { y: startY + mazeStartY, x: startX + mazeStartX };
  putpass(pos);
  dig(startY, startX);
}

/**
 * dig: Dig out from current position in the maze.
 */
function dig(y: number, x: number): void {
  const del: Coord[] = [
    { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
  ];

  for (;;) {
    let count = 0;
    let nextY = 0;
    let nextX = 0;

    for (const cp of del) {
      const newY = y + cp.y;
      const newX = x + cp.x;

      if (newY < 0 || newY > mazeMaxY || newX < 0 || newX > mazeMaxX) {
        continue;
      }
      if (flat(newY + mazeStartY, newX + mazeStartX) & F_PASS) {
        continue;
      }
      count++;
      if (rnd(count) === 0) {
        nextY = newY;
        nextX = newX;
      }
    }

    if (count === 0) return;

    accnt_maze(y, x, nextY, nextX);
    accnt_maze(nextY, nextX, y, x);

    const pos: Coord = { x: 0, y: 0 };
    if (nextY === y) {
      pos.y = y + mazeStartY;
      pos.x = (nextX - x < 0) ? nextX + mazeStartX + 1 : nextX + mazeStartX - 1;
    } else {
      pos.x = x + mazeStartX;
      pos.y = (nextY - y < 0) ? nextY + mazeStartY + 1 : nextY + mazeStartY - 1;
    }
    putpass(pos);

    pos.y = nextY + mazeStartY;
    pos.x = nextX + mazeStartX;
    putpass(pos);

    dig(nextY, nextX);
  }
}

/**
 * accnt_maze: Account for maze exits.
 */
function accnt_maze(y: number, x: number, ny: number, nx: number): void {
  if (!maze[y] || !maze[y][x]) return;
  const sp = maze[y][x];

  for (const cp of sp.exits) {
    if (cp.y === ny && cp.x === nx) return;
  }
  sp.exits.push({ y: ny, x: nx });
  sp.nexits = sp.exits.length;
}

/**
 * putpass: Add a passage character at coordinates.
 */
export function putpass(cp: Coord): void {
  const pp = INDEX(cp.y, cp.x);
  pp.p_flags |= F_PASS;
  if (rnd(10) + 1 < state.level && rnd(40) === 0) {
    pp.p_flags &= ~F_REAL;
  } else {
    pp.p_ch = PASSAGE;
  }
}

/**
 * rnd_pos: Pick a random spot in a room.
 */
export function rnd_pos(rp: Room, cp: Coord): void {
  cp.x = rp.r_pos.x + rnd(rp.r_max.x - 2) + 1;
  cp.y = rp.r_pos.y + rnd(rp.r_max.y - 2) + 1;
}

/**
 * find_floor: Find a valid floor spot in a room.
 * If rp is null, pick a new room each iteration.
 */
export function find_floor(
  rpIn: Room | null,
  cp: Coord,
  limit: number | boolean,
  monst: boolean,
): boolean {
  let rp = rpIn;
  const pickroom = rp === null;
  let compchar = "";
  const limitNum = typeof limit === "number" ? limit : (limit ? 1 : 0);
  let count = limitNum;

  if (!pickroom && rp !== null) {
    compchar = (rp.r_flags & ISMAZE) ? PASSAGE : FLOOR;
  }

  for (;;) {
    if (limitNum > 0 && count-- === 0) return false;

    if (pickroom) {
      rp = state.rooms[rnd_room()];
      compchar = (rp.r_flags & ISMAZE) ? PASSAGE : FLOOR;
    }

    if (rp === null) continue;
    rnd_pos(rp, cp);

    const pp = INDEX(cp.y, cp.x);
    if (monst) {
      if (pp.p_monst === null && step_ok(pp.p_ch)) {
        return true;
      }
    } else if (pp.p_ch === compchar) {
      return true;
    }
  }
}

/**
 * enter_room: Code executed when you appear in a room.
 * Full implementation requires Phase 4+ dependencies (see_monst, etc.)
 */
export function enter_room(cp: Coord): void {
  const backend = getBackend();
  const rp = roomin(cp);
  if (rp === null) return;

  state.player.t_room = rp;
  door_open(rp);

  if (!(rp.r_flags & ISDARK) && !(state.player.t_flags & ISBLIND)) {
    for (let y = rp.r_pos.y; y < rp.r_max.y + rp.r_pos.y; y++) {
      backend.move(y, rp.r_pos.x);
      for (let x = rp.r_pos.x; x < rp.r_max.x + rp.r_pos.x; x++) {
        const tp = moat(y, x);
        const ch = chat(y, x);
        if (tp === null) {
          const screenCh = String.fromCharCode(backend.inch() & 0xff);
          if (screenCh !== ch) {
            backend.addch(ch.charCodeAt(0));
          } else {
            backend.move(y, x + 1);
          }
        } else if (tp._kind === "monster") {
          tp.t_oldch = ch;
          // Simplified: just show the character or disguise
          backend.addch(tp.t_disguise.charCodeAt(0));
        }
      }
    }
  }
}

/**
 * leave_room: Code for when we exit a room.
 */
export function leave_room(cp: Coord): void {
  const backend = getBackend();
  const rp = state.player.t_room;
  if (rp === null) return;

  if (rp.r_flags & ISMAZE) return;

  let floorCh: string;
  if (rp.r_flags & ISGONE) {
    floorCh = PASSAGE;
  } else if (!(rp.r_flags & ISDARK) || (state.player.t_flags & ISBLIND)) {
    floorCh = FLOOR;
  } else {
    floorCh = " ";
  }

  state.player.t_room = state.passages[flat(cp.y, cp.x) & F_PNUM] || null;

  for (let y = rp.r_pos.y; y < rp.r_max.y + rp.r_pos.y; y++) {
    for (let x = rp.r_pos.x; x < rp.r_max.x + rp.r_pos.x; x++) {
      backend.move(y, x);
      const ch = String.fromCharCode(backend.inch() & 0xff);

      if (ch === FLOOR) {
        if (floorCh === " ") {
          backend.addch(" ".charCodeAt(0));
        }
      } else if (ch >= "A" && ch <= "Z") {
        // Monster on screen — replace with floor or door
        const pp = INDEX(y, x);
        backend.addch((pp.p_ch === DOOR ? DOOR : floorCh).charCodeAt(0));
      }
    }
  }
  door_open(rp);
}

/**
 * door_open: Open all the doors in a room.
 */
export function door_open(rp: Room): void {
  const backend = getBackend();
  for (let i = 0; i < rp.r_nexits; i++) {
    const exit = rp.r_exit[i];
    if (!exit) continue;
    const pp = INDEX(exit.y, exit.x);
    if (pp.p_ch === DOOR || !(pp.p_flags & F_REAL)) {
      backend.move(exit.y, exit.x);
      if (pp.p_flags & F_REAL) {
        backend.addch(DOOR.charCodeAt(0));
      } else {
        // Secret door — show as wall
        if (exit.y === rp.r_pos.y || exit.y === rp.r_pos.y + rp.r_max.y - 1) {
          backend.addch("-".charCodeAt(0));
        } else {
          backend.addch("|".charCodeAt(0));
        }
      }
    }
  }
}

/**
 * roomin: Find what room a coordinate is in.
 */
export function roomin(cp: Coord): Room | null {
  for (const rp of state.rooms) {
    if (
      cp.x >= rp.r_pos.x &&
      cp.x < rp.r_pos.x + rp.r_max.x &&
      cp.y >= rp.r_pos.y &&
      cp.y < rp.r_pos.y + rp.r_max.y
    ) {
      return rp;
    }
  }

  // Check passages
  const flags = flat(cp.y, cp.x);
  if (flags & F_PASS) {
    const passNum = flags & F_PNUM;
    if (passNum < state.passages.length) {
      return state.passages[passNum];
    }
  }

  return null;
}
