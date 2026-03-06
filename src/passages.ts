/**
 * Passage drawing and connectivity.
 * Ported from passages.c
 */

import type { Coord, Room } from "./types.js";
import {
  state, MAXROOMS, MAXPASS, NUMLINES, NUMCOLS,
  ISGONE, ISMAZE, DOOR, PASSAGE,
  F_PASS, F_REAL, F_PNUM,
  INDEX, chat, flat, setCh,
} from "./globals.js";
import { rnd } from "./util.js";
import { ce } from "./util.js";
import { putpass } from "./rooms.js";

// Room connectivity descriptor
interface RoomDes {
  conn: boolean[];     // possible to connect to room i?
  isconn: boolean[];   // connection been made to room i?
  ingraph: boolean;    // this room in graph already?
}

// Adjacency matrix for 3x3 room grid
//  0 1 2
//  3 4 5
//  6 7 8
const connMatrix: boolean[][] = [
  [false, true,  false, true,  false, false, false, false, false], // 0
  [true,  false, true,  false, true,  false, false, false, false], // 1
  [false, true,  false, false, false, true,  false, false, false], // 2
  [true,  false, false, false, true,  false, true,  false, false], // 3
  [false, true,  false, true,  false, true,  false, true,  false], // 4
  [false, false, true,  false, true,  false, false, false, true ], // 5
  [false, false, false, true,  false, false, false, true,  false], // 6
  [false, false, false, false, true,  false, true,  false, true ], // 7
  [false, false, false, false, false, true,  false, true,  false], // 8
];

/**
 * do_passages: Draw all the passages on a level.
 */
export function do_passages(): void {
  // Initialize room descriptors
  const rdes: RoomDes[] = [];
  for (let i = 0; i < MAXROOMS; i++) {
    rdes.push({
      conn: [...connMatrix[i]],
      isconn: new Array(MAXROOMS).fill(false),
      ingraph: false,
    });
  }

  // Starting with one room, connect it to a random adjacent room
  let roomcount = 1;
  let r1 = rdes[rnd(MAXROOMS)];
  r1.ingraph = true;

  let r2: RoomDes | null = null;

  do {
    // Find a room to connect with
    let candidateCount = 0;
    for (let i = 0; i < MAXROOMS; i++) {
      if (r1.conn[i] && !rdes[i].ingraph && rnd(++candidateCount) === 0) {
        r2 = rdes[i];
      }
    }

    if (candidateCount === 0) {
      // No adjacent rooms outside graph, pick a new starting room
      do {
        r1 = rdes[rnd(MAXROOMS)];
      } while (!r1.ingraph);
    } else if (r2 !== null) {
      // Connect new room to graph and draw tunnel
      r2.ingraph = true;
      const r1idx = rdes.indexOf(r1);
      const r2idx = rdes.indexOf(r2);
      conn(r1idx, r2idx);
      r1.isconn[r2idx] = true;
      r2.isconn[r1idx] = true;
      roomcount++;
    }
  } while (roomcount < MAXROOMS);

  // Add extra passages for variety
  for (let extraCount = rnd(5); extraCount > 0; extraCount--) {
    r1 = rdes[rnd(MAXROOMS)];

    let candidateCount = 0;
    r2 = null;
    for (let i = 0; i < MAXROOMS; i++) {
      if (r1.conn[i] && !r1.isconn[i] && rnd(++candidateCount) === 0) {
        r2 = rdes[i];
      }
    }

    if (candidateCount !== 0 && r2 !== null) {
      const r1idx = rdes.indexOf(r1);
      const r2idx = rdes.indexOf(r2);
      conn(r1idx, r2idx);
      r1.isconn[r2idx] = true;
      r2.isconn[r1idx] = true;
    }
  }

  passnum();
}

/**
 * conn: Draw a corridor between two rooms.
 */
export function conn(r1: number, r2: number): void {
  let rm: number;
  let direc: string;
  let rmt: number;

  if (r1 < r2) {
    rm = r1;
    direc = (r1 + 1 === r2) ? "r" : "d";
  } else {
    rm = r2;
    direc = (r2 + 1 === r1) ? "r" : "d";
  }

  const rpf = state.rooms[rm];
  let rpt: Room;

  const del: Coord = { x: 0, y: 0 };
  const spos: Coord = { x: 0, y: 0 };
  const epos: Coord = { x: 0, y: 0 };
  const turnDelta: Coord = { x: 0, y: 0 };
  let distance = 0;
  let turnDistance = 0;

  if (direc === "d") {
    rmt = rm + 3;
    rpt = state.rooms[rmt];
    del.x = 0;
    del.y = 1;
    spos.x = rpf.r_pos.x;
    spos.y = rpf.r_pos.y;
    epos.x = rpt.r_pos.x;
    epos.y = rpt.r_pos.y;

    if (!(rpf.r_flags & ISGONE)) {
      do {
        spos.x = rpf.r_pos.x + rnd(rpf.r_max.x - 2) + 1;
        spos.y = rpf.r_pos.y + rpf.r_max.y - 1;
      } while ((rpf.r_flags & ISMAZE) && !(flat(spos.y, spos.x) & F_PASS));
    }
    if (!(rpt.r_flags & ISGONE)) {
      do {
        epos.x = rpt.r_pos.x + rnd(rpt.r_max.x - 2) + 1;
      } while ((rpt.r_flags & ISMAZE) && !(flat(epos.y, epos.x) & F_PASS));
    }

    distance = Math.abs(spos.y - epos.y) - 1;
    turnDelta.y = 0;
    turnDelta.x = spos.x < epos.x ? 1 : -1;
    turnDistance = Math.abs(spos.x - epos.x);
  } else if (direc === "r") {
    rmt = rm + 1;
    rpt = state.rooms[rmt];
    del.x = 1;
    del.y = 0;
    spos.x = rpf.r_pos.x;
    spos.y = rpf.r_pos.y;
    epos.x = rpt.r_pos.x;
    epos.y = rpt.r_pos.y;

    if (!(rpf.r_flags & ISGONE)) {
      do {
        spos.x = rpf.r_pos.x + rpf.r_max.x - 1;
        spos.y = rpf.r_pos.y + rnd(rpf.r_max.y - 2) + 1;
      } while ((rpf.r_flags & ISMAZE) && !(flat(spos.y, spos.x) & F_PASS));
    }
    if (!(rpt.r_flags & ISGONE)) {
      do {
        epos.y = rpt.r_pos.y + rnd(rpt.r_max.y - 2) + 1;
      } while ((rpt.r_flags & ISMAZE) && !(flat(epos.y, epos.x) & F_PASS));
    }

    distance = Math.abs(spos.x - epos.x) - 1;
    turnDelta.y = spos.y < epos.y ? 1 : -1;
    turnDelta.x = 0;
    turnDistance = Math.abs(spos.y - epos.y);
  } else {
    return;
  }

  const turnSpot = rnd(distance - 1) + 1;

  // Draw doors or passage markers at endpoints
  if (!(rpf.r_flags & ISGONE)) {
    door(rpf, spos);
  } else {
    putpass(spos);
  }
  if (!(rpt.r_flags & ISGONE)) {
    door(rpt, epos);
  } else {
    putpass(epos);
  }

  // Draw the corridor
  const curr: Coord = { x: spos.x, y: spos.y };
  while (distance > 0) {
    curr.x += del.x;
    curr.y += del.y;

    if (distance === turnSpot) {
      while (turnDistance-- > 0) {
        putpass(curr);
        curr.x += turnDelta.x;
        curr.y += turnDelta.y;
      }
    }

    putpass(curr);
    distance--;
  }

  curr.x += del.x;
  curr.y += del.y;
  // In original: if (!ce(curr, epos)) msg("warning, connectivity problem");
}

/**
 * door: Add a door or possibly a secret door. Also enters the door
 * in the exits array of the room.
 */
export function door(rm: Room, cp: Coord): void {
  if (!rm.r_exit) rm.r_exit = [];
  rm.r_exit[rm.r_nexits++] = { x: cp.x, y: cp.y };

  if (rm.r_flags & ISMAZE) return;

  const pp = INDEX(cp.y, cp.x);
  if (rnd(10) + 1 < state.level && rnd(5) === 0) {
    // Secret door — looks like a wall
    if (cp.y === rm.r_pos.y || cp.y === rm.r_pos.y + rm.r_max.y - 1) {
      pp.p_ch = "-";
    } else {
      pp.p_ch = "|";
    }
    pp.p_flags &= ~F_REAL;
  } else {
    pp.p_ch = DOOR;
  }
}

// Passage numbering statics (matching passages.c)
let pnum = 0;
let newPnum = false;

/**
 * passnum: Assign a number to each passageway.
 */
export function passnum(): void {
  pnum = 0;
  newPnum = false;

  for (const rp of state.passages) {
    rp.r_nexits = 0;
    rp.r_exit = [];
  }

  for (const rp of state.rooms) {
    for (let i = 0; i < rp.r_nexits; i++) {
      newPnum = true;
      const exit = rp.r_exit[i];
      if (exit) {
        numpass(exit.y, exit.x);
      }
    }
  }
}

/**
 * numpass: Number a passageway square and its neighbors.
 */
function numpass(y: number, x: number): void {
  if (x >= NUMCOLS || x < 0 || y >= NUMLINES || y <= 0) return;

  const pp = INDEX(y, x);
  if (pp.p_flags & F_PNUM) return;

  if (newPnum) {
    pnum++;
    newPnum = false;
  }

  const ch = pp.p_ch;
  if (ch === DOOR || (!(pp.p_flags & F_REAL) && (ch === "|" || ch === "-"))) {
    // It's a door — register as passage exit
    if (pnum < state.passages.length) {
      const rp = state.passages[pnum];
      if (!rp.r_exit) rp.r_exit = [];
      rp.r_exit[rp.r_nexits] = { y, x };
      rp.r_nexits++;
    }
  } else if (!(pp.p_flags & F_PASS)) {
    return;
  }

  pp.p_flags |= pnum;

  // Recurse on surrounding places
  numpass(y + 1, x);
  numpass(y - 1, x);
  numpass(y, x + 1);
  numpass(y, x - 1);
}
