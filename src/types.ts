/**
 * Core game data structures.
 * Faithfully ported from rogue.h structs and unions.
 */

export interface Coord {
  x: number;
  y: number;
}

export interface Stats {
  s_str: number;    // Strength
  s_exp: number;    // Experience
  s_lvl: number;    // Level of mastery
  s_arm: number;    // Armor class
  s_hpt: number;    // Hit points
  s_dmg: string;    // Damage string (e.g. "1x4", "2x6/1x8")
  s_maxhp: number;  // Max hit points
}

export interface Room {
  r_pos: Coord;     // Upper left corner
  r_max: Coord;     // Size of room
  r_gold: Coord;    // Where the gold is
  r_goldval: number; // How much the gold is worth
  r_flags: number;  // Info about the room
  r_nexits: number; // Number of exits
  r_exit: Coord[];  // Where the exits are (up to 12)
}

// Base fields shared by monsters and objects (the linked list pointers)
interface ThingBase {
  l_next: Thing | null;
  l_prev: Thing | null;
}

export interface Monster extends ThingBase {
  _kind: "monster";
  t_pos: Coord;
  t_turn: boolean;
  t_type: string;       // The monster letter (A-Z) or @ for player
  t_disguise: string;   // What mimic looks like
  t_oldch: string;      // Character that was where it was
  t_dest: Coord | null; // Where it is running to
  t_flags: number;      // State word
  t_stats: Stats;       // Physical description
  t_room: Room | null;  // Current room for thing
  t_pack: Thing | null;  // What the thing is carrying (linked list head)
  t_reserved: number;
}

export interface GameObj extends ThingBase {
  _kind: "object";
  o_type: number;       // What kind of object (POTION, SCROLL, etc.)
  o_pos: Coord;         // Where it lives on the screen
  o_text: string | null; // What it says if you read it
  o_launch: number;     // What you need to launch it
  o_packch: string;     // What character it is in the pack
  o_damage: string;     // Damage if used like sword
  o_hurldmg: string;    // Damage if thrown
  o_count: number;      // Count for plural objects
  o_which: number;      // Which object of a type it is
  o_hplus: number;      // Plusses to hit
  o_dplus: number;      // Plusses to damage
  o_arm: number;        // Armor protection (also o_charges, o_goldval)
  o_flags: number;      // Information about objects
  o_group: number;      // Group number for this object
  o_label: string | null; // Label for object
}

export type Thing = Monster | GameObj;

export interface Place {
  p_ch: string;           // What's at this position
  p_flags: number;        // F_PASS, F_SEEN, etc.
  p_monst: Thing | null;  // Monster at this position
}

export interface MonsterTemplate {
  m_name: string;        // What to call the monster
  m_carry: number;       // Probability of carrying something
  m_flags: number;       // Things about the monster
  m_stats: Stats;        // Initial stats
}

export interface ObjInfo {
  oi_name: string | null; // Name of the item type
  oi_prob: number;        // Probability of appearing
  oi_worth: number;       // Base gold value
  oi_guess: string | null; // Player's guess at what it is
  oi_know: boolean;       // Player knows what it is
}

export interface Stone {
  st_name: string;
  st_value: number;
}

export interface HelpEntry {
  h_ch: number;          // Key character (char code)
  h_desc: string;        // Description
  h_print: boolean;      // Whether to print in help
}

export interface DelayedAction {
  d_type: number;
  d_func: ((arg: number) => Promise<void>) | null;
  d_arg: number;
  d_time: number;
}

export class RogueExit {
  constructor(public code: number) {}
}

export interface RogueOptions {
  playerName?: string;
  seed?: number;
}

export interface RogueResult {
  outcome: "death" | "quit" | "victory";
  gold: number;
  level: number;
  killer?: string;
}
