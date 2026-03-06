/**
 * Save and restore game state.
 * JSON-based serialization (not binary-compatible with C Rogue).
 *
 * The main challenges are:
 * 1. Linked lists (mlist, lvl_obj, t_pack) → serialized as arrays
 * 2. Cross-references (cur_armor, cur_weapon, cur_ring → pack items;
 *    Place.p_monst → mlist monsters; t_room → rooms[]) → resolved via IDs
 * 3. Daemon function references → mapped to/from string names
 * 4. CursesWindow handles → not serialized; re-obtained on restore
 */

import type {
  Coord, Stats, Room, Monster, GameObj, Thing, Place, DelayedAction,
  ObjInfo,
} from "./types.js";
import {
  state, MAXLINES, MAXCOLS, MAXROOMS, MAXPASS, MAXDAEMONS,
  MAXPOTIONS, MAXSCROLLS, MAXRINGS, MAXSTICKS,
  pot_info, scr_info, ring_info, ws_info,
} from "./globals.js";

// ─── Daemon function registry ──────────────────────────
// Maps function references ↔ string names for serialization.

type DaemonFunc = (arg: number) => Promise<void>;
const funcRegistry = new Map<string, DaemonFunc>();
const funcNames = new Map<DaemonFunc, string>();

export function registerDaemonFunc(name: string, func: DaemonFunc): void {
  funcRegistry.set(name, func);
  funcNames.set(func, name);
}

// ─── Serialized shape types ────────────────────────────

interface SavedCoord { x: number; y: number }

interface SavedStats {
  s_str: number; s_exp: number; s_lvl: number; s_arm: number;
  s_hpt: number; s_dmg: string; s_maxhp: number;
}

interface SavedMonster {
  id: number;
  t_pos: SavedCoord;
  t_turn: boolean;
  t_type: string;
  t_disguise: string;
  t_oldch: string;
  t_dest: SavedCoord | null;
  t_flags: number;
  t_stats: SavedStats;
  t_room_idx: number; // index into rooms[], -1 for null, -2 for passage
  t_pack: number[];   // IDs of carried objects
  t_reserved: number;
}

interface SavedGameObj {
  id: number;
  o_type: number;
  o_pos: SavedCoord;
  o_text: string | null;
  o_launch: number;
  o_packch: string;
  o_damage: string;
  o_hurldmg: string;
  o_count: number;
  o_which: number;
  o_hplus: number;
  o_dplus: number;
  o_arm: number;
  o_flags: number;
  o_group: number;
  o_label: string | null;
}

interface SavedPlace {
  p_ch: string;
  p_flags: number;
  p_monst_id: number; // monster ID or -1
}

interface SavedRoom {
  r_pos: SavedCoord;
  r_max: SavedCoord;
  r_gold: SavedCoord;
  r_goldval: number;
  r_flags: number;
  r_nexits: number;
  r_exit: SavedCoord[];
}

interface SavedDaemon {
  d_type: number;
  d_func_name: string | null;
  d_arg: number;
  d_time: number;
}

interface SavedObjInfo {
  oi_guess: string | null;
  oi_know: boolean;
}

interface SavedState {
  version: number;

  // Scalar flags and values
  flags: Record<string, boolean | number | string>;
  pack_used: boolean[];
  string_arrays: {
    p_colors: string[];
    r_stones: string[];
    s_names: string[];
    ws_made: string[];
    ws_type: string[];
  };

  // Coordinates
  delta: SavedCoord;
  oldpos: SavedCoord;
  stairs: SavedCoord;
  nh: SavedCoord;

  // Places (map grid)
  places: SavedPlace[];

  // Player
  player: SavedMonster;
  max_stats: SavedStats;

  // Equipment references (IDs into player pack)
  cur_armor_id: number;
  cur_weapon_id: number;
  cur_ring_ids: [number, number];

  // Monster list
  monsters: SavedMonster[];

  // Level objects
  lvl_objs: SavedGameObj[];

  // All game objects (pack items, monster pack items)
  all_objs: SavedGameObj[];

  // Rooms and passages
  rooms: SavedRoom[];
  passages: SavedRoom[];
  oldrp_idx: number;

  // Daemons
  d_list: SavedDaemon[];

  // Item knowledge tables
  pot_info_state: SavedObjInfo[];
  scr_info_state: SavedObjInfo[];
  ring_info_state: SavedObjInfo[];
  ws_info_state: SavedObjInfo[];
}

const SAVE_VERSION = 1;

// ─── Serialize ─────────────────────────────────────────

let nextId = 1;
let objMap: Map<Thing, number>;
let monsterMap: Map<Thing, number>;

function assignId(thing: Thing): number {
  const id = nextId++;
  if (thing._kind === "monster") {
    monsterMap.set(thing, id);
  } else {
    objMap.set(thing, id);
  }
  return id;
}

function getThingId(thing: Thing | null): number {
  if (thing === null) return -1;
  return (thing._kind === "monster" ? monsterMap.get(thing) : objMap.get(thing)) ?? -1;
}

function serializeCoord(c: Coord): SavedCoord {
  return { x: c.x, y: c.y };
}

function serializeStats(s: Stats): SavedStats {
  return {
    s_str: s.s_str, s_exp: s.s_exp, s_lvl: s.s_lvl, s_arm: s.s_arm,
    s_hpt: s.s_hpt, s_dmg: s.s_dmg, s_maxhp: s.s_maxhp,
  };
}

function roomIndex(room: Room | null): number {
  if (room === null) return -1;
  const idx = state.rooms.indexOf(room);
  if (idx >= 0) return idx;
  const pidx = state.passages.indexOf(room);
  if (pidx >= 0) return 100 + pidx; // offset to distinguish from rooms
  return -1;
}

function serializeRoom(r: Room): SavedRoom {
  return {
    r_pos: serializeCoord(r.r_pos),
    r_max: serializeCoord(r.r_max),
    r_gold: serializeCoord(r.r_gold),
    r_goldval: r.r_goldval,
    r_flags: r.r_flags,
    r_nexits: r.r_nexits,
    r_exit: r.r_exit.map(serializeCoord),
  };
}

function serializeObj(obj: GameObj, id: number): SavedGameObj {
  return {
    id,
    o_type: obj.o_type,
    o_pos: serializeCoord(obj.o_pos),
    o_text: obj.o_text,
    o_launch: obj.o_launch,
    o_packch: obj.o_packch,
    o_damage: obj.o_damage,
    o_hurldmg: obj.o_hurldmg,
    o_count: obj.o_count,
    o_which: obj.o_which,
    o_hplus: obj.o_hplus,
    o_dplus: obj.o_dplus,
    o_arm: obj.o_arm,
    o_flags: obj.o_flags,
    o_group: obj.o_group,
    o_label: obj.o_label,
  };
}

function serializeMonster(mon: Monster, id: number): SavedMonster {
  // Collect pack item IDs
  const packIds: number[] = [];
  let item = mon.t_pack;
  while (item !== null) {
    packIds.push(getThingId(item));
    item = item.l_next;
  }

  return {
    id,
    t_pos: serializeCoord(mon.t_pos),
    t_turn: mon.t_turn,
    t_type: mon.t_type,
    t_disguise: mon.t_disguise,
    t_oldch: mon.t_oldch,
    t_dest: mon.t_dest ? serializeCoord(mon.t_dest) : null,
    t_flags: mon.t_flags,
    t_stats: serializeStats(mon.t_stats),
    t_room_idx: roomIndex(mon.t_room),
    t_pack: packIds,
    t_reserved: mon.t_reserved,
  };
}

/**
 * Collect all Things from a linked list into an array.
 */
function collectList(head: Thing | null): Thing[] {
  const result: Thing[] = [];
  let item = head;
  while (item !== null) {
    result.push(item);
    item = item.l_next;
  }
  return result;
}

/**
 * saveGame: Serialize the entire game state to a JSON string.
 */
export function saveGame(): string {
  nextId = 1;
  objMap = new Map();
  monsterMap = new Map();

  // Phase 1: Assign IDs to all things
  // Player
  const playerId = assignId(state.player);

  // Player pack
  const playerPackItems = collectList(state.player.t_pack);
  for (const item of playerPackItems) {
    assignId(item);
  }

  // Monster list
  const monsterList = collectList(state.mlist).filter(
    (t): t is Monster => t._kind === "monster"
  );
  for (const mon of monsterList) {
    assignId(mon);
    // Monster packs
    const monPack = collectList(mon.t_pack);
    for (const item of monPack) {
      assignId(item);
    }
  }

  // Level objects
  const lvlObjList = collectList(state.lvl_obj).filter(
    (t): t is GameObj => t._kind === "object"
  );
  for (const obj of lvlObjList) {
    assignId(obj);
  }

  // Phase 2: Serialize everything
  const allObjs: SavedGameObj[] = [];

  // Serialize player pack objects
  for (const item of playerPackItems) {
    if (item._kind === "object") {
      allObjs.push(serializeObj(item, getThingId(item)));
    }
  }

  // Serialize monster pack objects
  for (const mon of monsterList) {
    const monPack = collectList(mon.t_pack);
    for (const item of monPack) {
      if (item._kind === "object") {
        allObjs.push(serializeObj(item, getThingId(item)));
      }
    }
  }

  // Serialize level objects
  const savedLvlObjs: SavedGameObj[] = [];
  for (const obj of lvlObjList) {
    const saved = serializeObj(obj, getThingId(obj));
    savedLvlObjs.push(saved);
    allObjs.push(saved);
  }

  // Serialize monsters
  const savedMonsters: SavedMonster[] = monsterList.map(
    mon => serializeMonster(mon, getThingId(mon))
  );

  // Serialize player
  const savedPlayer = serializeMonster(state.player, playerId);

  // Serialize places
  const savedPlaces: SavedPlace[] = state.places.map(p => ({
    p_ch: p.p_ch,
    p_flags: p.p_flags,
    p_monst_id: p.p_monst !== null ? getThingId(p.p_monst) : -1,
  }));

  // Serialize daemons
  const savedDaemons: SavedDaemon[] = state.d_list.map(d => ({
    d_type: d.d_type,
    d_func_name: d.d_func !== null ? (funcNames.get(d.d_func) ?? null) : null,
    d_arg: d.d_arg,
    d_time: d.d_time,
  }));

  // Scalar flags
  const flags: Record<string, boolean | number | string> = {
    after: state.after,
    again: state.again,
    noscore: state.noscore,
    seenstairs: state.seenstairs,
    amulet: state.amulet,
    door_stop: state.door_stop,
    fight_flush: state.fight_flush,
    firstmove: state.firstmove,
    has_hit: state.has_hit,
    inv_describe: state.inv_describe,
    jump: state.jump,
    kamikaze: state.kamikaze,
    lower_msg: state.lower_msg,
    move_no_pickup: state.move_no_pickup,
    move_on: state.move_on,
    msg_esc: state.msg_esc,
    passgo: state.passgo,
    playing: state.playing,
    q_comm: state.q_comm,
    running: state.running,
    save_msg: state.save_msg,
    see_floor: state.see_floor,
    stat_msg: state.stat_msg,
    terse: state.terse,
    to_death: state.to_death,
    tombstone: state.tombstone,
    wizard: state.wizard,

    dir_ch: state.dir_ch,
    file_name: state.file_name,
    huh: state.huh,
    runch: state.runch,
    take: state.take,
    whoami: state.whoami,
    fruit: state.fruit,
    home: state.home,
    l_last_comm: state.l_last_comm,
    l_last_dir: state.l_last_dir,
    last_comm: state.last_comm,
    last_dir: state.last_dir,

    n_objs: state.n_objs,
    ntraps: state.ntraps,
    hungry_state: state.hungry_state,
    inpack: state.inpack,
    inv_type: state.inv_type,
    level: state.level,
    max_hit: state.max_hit,
    max_level: state.max_level,
    mpos: state.mpos,
    no_food: state.no_food,
    count: state.count,
    food_left: state.food_left,
    lastscore: state.lastscore,
    no_command: state.no_command,
    no_move: state.no_move,
    purse: state.purse,
    quiet: state.quiet,
    vf_hit: state.vf_hit,
    dnum: state.dnum,
    seed: state.seed,
    total: state.total,
    between: state.between,
    group: state.group,
  };

  // Item knowledge
  const saveObjInfoState = (info: ObjInfo[]): SavedObjInfo[] =>
    info.map(i => ({ oi_guess: i.oi_guess, oi_know: i.oi_know }));

  const saved: SavedState = {
    version: SAVE_VERSION,
    flags,
    pack_used: [...state.pack_used],
    string_arrays: {
      p_colors: [...state.p_colors],
      r_stones: [...state.r_stones],
      s_names: [...state.s_names],
      ws_made: [...state.ws_made],
      ws_type: [...state.ws_type],
    },
    delta: serializeCoord(state.delta),
    oldpos: serializeCoord(state.oldpos),
    stairs: serializeCoord(state.stairs),
    nh: serializeCoord(state.nh),
    places: savedPlaces,
    player: savedPlayer,
    max_stats: serializeStats(state.max_stats),
    cur_armor_id: getThingId(state.cur_armor),
    cur_weapon_id: getThingId(state.cur_weapon),
    cur_ring_ids: [getThingId(state.cur_ring[0]), getThingId(state.cur_ring[1])],
    monsters: savedMonsters,
    lvl_objs: savedLvlObjs.map(o => ({ ...o })),
    all_objs: allObjs,
    rooms: state.rooms.map(serializeRoom),
    passages: state.passages.map(serializeRoom),
    oldrp_idx: roomIndex(state.oldrp),
    d_list: savedDaemons,
    pot_info_state: saveObjInfoState(pot_info),
    scr_info_state: saveObjInfoState(scr_info),
    ring_info_state: saveObjInfoState(ring_info),
    ws_info_state: saveObjInfoState(ws_info),
  };

  return JSON.stringify(saved);
}

// ─── Deserialize ───────────────────────────────────────

function restoreCoord(s: SavedCoord, target: Coord): void {
  target.x = s.x;
  target.y = s.y;
}

function restoreStats(s: SavedStats, target: Stats): void {
  target.s_str = s.s_str;
  target.s_exp = s.s_exp;
  target.s_lvl = s.s_lvl;
  target.s_arm = s.s_arm;
  target.s_hpt = s.s_hpt;
  target.s_dmg = s.s_dmg;
  target.s_maxhp = s.s_maxhp;
}

function restoreRoom(s: SavedRoom, target: Room): void {
  restoreCoord(s.r_pos, target.r_pos);
  restoreCoord(s.r_max, target.r_max);
  restoreCoord(s.r_gold, target.r_gold);
  target.r_goldval = s.r_goldval;
  target.r_flags = s.r_flags;
  target.r_nexits = s.r_nexits;
  target.r_exit = s.r_exit.map(e => ({ x: e.x, y: e.y }));
}

function resolveRoom(idx: number): Room | null {
  if (idx === -1) return null;
  if (idx >= 100) return state.passages[idx - 100] ?? null;
  return state.rooms[idx] ?? null;
}

function createGameObj(s: SavedGameObj): GameObj {
  return {
    _kind: "object",
    l_next: null,
    l_prev: null,
    o_type: s.o_type,
    o_pos: { x: s.o_pos.x, y: s.o_pos.y },
    o_text: s.o_text,
    o_launch: s.o_launch,
    o_packch: s.o_packch,
    o_damage: s.o_damage,
    o_hurldmg: s.o_hurldmg,
    o_count: s.o_count,
    o_which: s.o_which,
    o_hplus: s.o_hplus,
    o_dplus: s.o_dplus,
    o_arm: s.o_arm,
    o_flags: s.o_flags,
    o_group: s.o_group,
    o_label: s.o_label,
  };
}

function createMonster(s: SavedMonster): Monster {
  return {
    _kind: "monster",
    l_next: null,
    l_prev: null,
    t_pos: { x: s.t_pos.x, y: s.t_pos.y },
    t_turn: s.t_turn,
    t_type: s.t_type,
    t_disguise: s.t_disguise,
    t_oldch: s.t_oldch,
    t_dest: s.t_dest ? { x: s.t_dest.x, y: s.t_dest.y } : null,
    t_flags: s.t_flags,
    t_stats: {
      s_str: s.t_stats.s_str, s_exp: s.t_stats.s_exp, s_lvl: s.t_stats.s_lvl,
      s_arm: s.t_stats.s_arm, s_hpt: s.t_stats.s_hpt, s_dmg: s.t_stats.s_dmg,
      s_maxhp: s.t_stats.s_maxhp,
    },
    t_room: null, // resolved later
    t_pack: null, // resolved later
    t_reserved: s.t_reserved,
  };
}

/**
 * Build a linked list from an array of Things, in order.
 */
function buildLinkedList(items: Thing[]): Thing | null {
  if (items.length === 0) return null;
  for (let i = 0; i < items.length; i++) {
    items[i].l_prev = i > 0 ? items[i - 1] : null;
    items[i].l_next = i < items.length - 1 ? items[i + 1] : null;
  }
  return items[0];
}

function restoreObjInfoState(saved: SavedObjInfo[], target: ObjInfo[]): void {
  for (let i = 0; i < saved.length && i < target.length; i++) {
    target[i].oi_guess = saved[i].oi_guess;
    target[i].oi_know = saved[i].oi_know;
  }
}

/**
 * restoreGame: Deserialize a saved game JSON string into the global state.
 * Call this AFTER resetState() and before re-entering the game loop.
 * Returns true on success, false on error.
 */
export function restoreGame(jsonStr: string): boolean {
  let saved: SavedState;
  try {
    saved = JSON.parse(jsonStr) as SavedState;
  } catch {
    return false;
  }

  if (saved.version !== SAVE_VERSION) return false;

  // ─── Restore scalar state ───
  const f = saved.flags;
  state.after = f.after as boolean;
  state.again = f.again as boolean;
  state.noscore = f.noscore as number;
  state.seenstairs = f.seenstairs as boolean;
  state.amulet = f.amulet as boolean;
  state.door_stop = f.door_stop as boolean;
  state.fight_flush = f.fight_flush as boolean;
  state.firstmove = f.firstmove as boolean;
  state.has_hit = f.has_hit as boolean;
  state.inv_describe = f.inv_describe as boolean;
  state.jump = f.jump as boolean;
  state.kamikaze = f.kamikaze as boolean;
  state.lower_msg = f.lower_msg as boolean;
  state.move_no_pickup = f.move_no_pickup as boolean;
  state.move_on = f.move_on as boolean;
  state.msg_esc = f.msg_esc as boolean;
  state.passgo = f.passgo as boolean;
  state.playing = f.playing as boolean;
  state.q_comm = f.q_comm as boolean;
  state.running = f.running as boolean;
  state.save_msg = f.save_msg as boolean;
  state.see_floor = f.see_floor as boolean;
  state.stat_msg = f.stat_msg as boolean;
  state.terse = f.terse as boolean;
  state.to_death = f.to_death as boolean;
  state.tombstone = f.tombstone as boolean;
  state.wizard = f.wizard as boolean;

  state.dir_ch = f.dir_ch as string;
  state.file_name = f.file_name as string;
  state.huh = f.huh as string;
  state.runch = f.runch as string;
  state.take = f.take as string;
  state.whoami = f.whoami as string;
  state.fruit = f.fruit as string;
  state.home = f.home as string;
  state.l_last_comm = f.l_last_comm as string;
  state.l_last_dir = f.l_last_dir as string;
  state.last_comm = f.last_comm as string;
  state.last_dir = f.last_dir as string;

  state.n_objs = f.n_objs as number;
  state.ntraps = f.ntraps as number;
  state.hungry_state = f.hungry_state as number;
  state.inpack = f.inpack as number;
  state.inv_type = f.inv_type as number;
  state.level = f.level as number;
  state.max_hit = f.max_hit as number;
  state.max_level = f.max_level as number;
  state.mpos = f.mpos as number;
  state.no_food = f.no_food as number;
  state.count = f.count as number;
  state.food_left = f.food_left as number;
  state.lastscore = f.lastscore as number;
  state.no_command = f.no_command as number;
  state.no_move = f.no_move as number;
  state.purse = f.purse as number;
  state.quiet = f.quiet as number;
  state.vf_hit = f.vf_hit as number;
  state.dnum = f.dnum as number;
  state.seed = f.seed as number;
  state.total = f.total as number;
  state.between = f.between as number;
  state.group = f.group as number;

  // Pack used
  for (let i = 0; i < saved.pack_used.length && i < state.pack_used.length; i++) {
    state.pack_used[i] = saved.pack_used[i];
  }

  // String arrays
  const sa = saved.string_arrays;
  for (let i = 0; i < sa.p_colors.length; i++) state.p_colors[i] = sa.p_colors[i];
  for (let i = 0; i < sa.r_stones.length; i++) state.r_stones[i] = sa.r_stones[i];
  for (let i = 0; i < sa.s_names.length; i++) state.s_names[i] = sa.s_names[i];
  for (let i = 0; i < sa.ws_made.length; i++) state.ws_made[i] = sa.ws_made[i];
  for (let i = 0; i < sa.ws_type.length; i++) state.ws_type[i] = sa.ws_type[i];

  // Coordinates
  restoreCoord(saved.delta, state.delta);
  restoreCoord(saved.oldpos, state.oldpos);
  restoreCoord(saved.stairs, state.stairs);
  restoreCoord(saved.nh, state.nh);

  // Rooms and passages
  for (let i = 0; i < saved.rooms.length && i < state.rooms.length; i++) {
    restoreRoom(saved.rooms[i], state.rooms[i]);
  }
  for (let i = 0; i < saved.passages.length && i < state.passages.length; i++) {
    restoreRoom(saved.passages[i], state.passages[i]);
  }
  state.oldrp = resolveRoom(saved.oldrp_idx);

  // ─── Reconstruct all Things ───
  // Build ID→Thing maps
  const idToObj = new Map<number, GameObj>();
  const idToMon = new Map<number, Monster>();

  // Create all GameObj instances
  for (const savedObj of saved.all_objs) {
    const obj = createGameObj(savedObj);
    idToObj.set(savedObj.id, obj);
  }

  // Create all Monster instances
  for (const savedMon of saved.monsters) {
    const mon = createMonster(savedMon);
    mon.t_room = resolveRoom(savedMon.t_room_idx);
    // Rebuild monster pack
    const packItems = savedMon.t_pack.map(id => idToObj.get(id)).filter(Boolean) as GameObj[];
    mon.t_pack = buildLinkedList(packItems);
    idToMon.set(savedMon.id, mon);
  }

  // Restore player
  const playerMon = createMonster(saved.player);
  playerMon.t_room = resolveRoom(saved.player.t_room_idx);
  // Player pack
  const playerPackItems = saved.player.t_pack.map(id => idToObj.get(id)).filter(Boolean) as GameObj[];
  playerMon.t_pack = buildLinkedList(playerPackItems);

  // Copy player into state.player (reuse the existing object to preserve references)
  Object.assign(state.player, playerMon);

  // ─── Restore linked lists ───
  // Monster list
  const monsterInstances = saved.monsters.map(sm => idToMon.get(sm.id)!).filter(Boolean);
  state.mlist = buildLinkedList(monsterInstances);

  // Level objects list
  const lvlObjInstances = saved.lvl_objs.map(so => idToObj.get(so.id)!).filter(Boolean);
  state.lvl_obj = buildLinkedList(lvlObjInstances);

  // ─── Restore equipment references ───
  state.cur_armor = saved.cur_armor_id >= 0 ? (idToObj.get(saved.cur_armor_id) ?? null) : null;
  state.cur_weapon = saved.cur_weapon_id >= 0 ? (idToObj.get(saved.cur_weapon_id) ?? null) : null;
  state.cur_ring[0] = saved.cur_ring_ids[0] >= 0 ? (idToObj.get(saved.cur_ring_ids[0]) ?? null) : null;
  state.cur_ring[1] = saved.cur_ring_ids[1] >= 0 ? (idToObj.get(saved.cur_ring_ids[1]) ?? null) : null;

  // Max stats
  restoreStats(saved.max_stats, state.max_stats);

  // ─── Restore places ───
  for (let i = 0; i < saved.places.length && i < state.places.length; i++) {
    const sp = saved.places[i];
    state.places[i].p_ch = sp.p_ch;
    state.places[i].p_flags = sp.p_flags;
    state.places[i].p_monst = sp.p_monst_id >= 0 ? (idToMon.get(sp.p_monst_id) ?? null) : null;
  }

  // ─── Restore daemons ───
  for (let i = 0; i < saved.d_list.length && i < state.d_list.length; i++) {
    const sd = saved.d_list[i];
    state.d_list[i].d_type = sd.d_type;
    state.d_list[i].d_arg = sd.d_arg;
    state.d_list[i].d_time = sd.d_time;
    state.d_list[i].d_func = sd.d_func_name !== null
      ? (funcRegistry.get(sd.d_func_name) ?? null)
      : null;
  }

  // ─── Restore item knowledge ───
  restoreObjInfoState(saved.pot_info_state, pot_info);
  restoreObjInfoState(saved.scr_info_state, scr_info);
  restoreObjInfoState(saved.ring_info_state, ring_info);
  restoreObjInfoState(saved.ws_info_state, ws_info);

  // Internal flags
  state._newLevel = false;
  state._result = null;

  return true;
}
