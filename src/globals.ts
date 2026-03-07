/**
 * Global game state and data tables.
 * Faithfully ported from extern.c and rogue.h.
 */

import type { CursesWindow } from "./curses.js";
import type {
  Coord, Stats, Room, Thing, Place, MonsterTemplate,
  ObjInfo, Stone, HelpEntry, DelayedAction,
} from "./types.js";
import { CTRL, rnd as utilRnd } from "./util.js";

// ─── String constants ────────────────────────────────

export const MAXSTR = 1024;
export const MAXLINES = 32;
export const MAXCOLS = 80;

// ─── Game constants from rogue.h ─────────────────────

export const MAXROOMS = 9;
export const MAXTHINGS = 9;
export const MAXOBJ = 9;
export const MAXPACK = 23;
export const MAXTRAPS = 10;
export const AMULETLEVEL = 26;
export const NUMTHINGS = 7;
export const MAXPASS = 13;
export const NUMLINES = 24;
export const NUMCOLS = 80;
export const STATLINE = NUMLINES - 1;
export const BORE_LEVEL = 50;

// Return values for get functions
export const NORM = 0;
export const QUIT = 1;
export const MINUS = 2;

// Inventory types
export const INV_OVER = 0;
export const INV_SLOW = 1;
export const INV_CLEAR = 2;

// ─── Display characters ─────────────────────────────

export const PASSAGE = "#";
export const DOOR = "+";
export const FLOOR = ".";
export const PLAYER = "@";
export const TRAP = "^";
export const STAIRS = "%";
export const GOLD = "*";
export const POTION = "!";
export const SCROLL = "?";
export const MAGIC = "$";
export const FOOD = ":";
export const WEAPON = ")";
export const ARMOR = "]";
export const AMULET = ",";
export const RING = "=";
export const STICK = "/";
export const CALLABLE = -1;
export const R_OR_S = -2;

// Item type numeric constants (for o_type)
export const POTION_TYPE = 0x21;  // '!'
export const SCROLL_TYPE = 0x3f; // '?'
export const FOOD_TYPE = 0x3a;   // ':'
export const WEAPON_TYPE = 0x29; // ')'
export const ARMOR_TYPE = 0x5d;  // ']'
export const RING_TYPE = 0x3d;   // '='
export const STICK_TYPE = 0x2f;  // '/'
export const AMULET_TYPE = 0x2c; // ','
export const GOLD_TYPE = 0x2a;   // '*'

// ─── Timing constants ────────────────────────────────

export const HEALTIME = 30;
export const HUHDURATION = 20;
export const SEEDURATION = 850;
export const HUNGERTIME = 1300;
export const MORETIME = 150;
export const STOMACHSIZE = 2000;
export const STARVETIME = 850;
export const ESCAPE = 27;
export const LEFT = 0;
export const RIGHT = 1;
export const BOLT_LENGTH = 6;
export const LAMPDIST = 3;
export const SLEEPTIME = 4;
export const BEARTIME = 3;

// ─── Save against things ─────────────────────────────

export const VS_POISON = 0;
export const VS_PARALYZATION = 0;
export const VS_DEATH = 0;
export const VS_BREATH = 2;
export const VS_MAGIC = 3;

// ─── Room flags ──────────────────────────────────────

export const ISDARK = 0o1;
export const ISGONE = 0o2;
export const ISMAZE = 0o4;

// ─── Object flags ────────────────────────────────────

export const ISCURSED = 0o1;
export const ISKNOW = 0o2;
export const ISMISL = 0o4;
export const ISMANY = 0o10;
// ISFOUND = 0o20 shared with creatures
export const ISPROT = 0o40;

// ─── Creature flags ──────────────────────────────────

export const CANHUH = 0o1;
export const CANSEE = 0o2;
export const ISBLIND = 0o4;
export const ISCANC = 0o10;
export const ISLEVIT = 0o10;
export const ISFOUND = 0o20;
export const ISGREED = 0o40;
export const ISHASTE = 0o100;
export const ISTARGET = 0o200;
export const ISHELD = 0o400;
export const ISHUH = 0o1000;
export const ISINVIS = 0o2000;
export const ISMEAN = 0o4000;
export const ISHALU = 0o4000;
export const ISREGEN = 0o10000;
export const ISRUN = 0o20000;
export const SEEMONST = 0o40000;
export const ISFLY = 0o40000;
export const ISSLOW = 0o100000;

// ─── Level map flags ─────────────────────────────────

export const F_PASS = 0x80;
export const F_SEEN = 0x40;
export const F_DROPPED = 0x20;
export const F_LOCKED = 0x20;
export const F_REAL = 0x10;
export const F_PNUM = 0x0f;
export const F_TMASK = 0x07;

// ─── Trap types ──────────────────────────────────────

export const T_DOOR = 0;
export const T_ARROW = 1;
export const T_SLEEP = 2;
export const T_BEAR = 3;
export const T_TELEP = 4;
export const T_DART = 5;
export const T_RUST = 6;
export const T_MYST = 7;
export const NTRAPS = 8;

// ─── Potion types ────────────────────────────────────

export const P_CONFUSE = 0;
export const P_LSD = 1;
export const P_POISON = 2;
export const P_STRENGTH = 3;
export const P_SEEINVIS = 4;
export const P_HEALING = 5;
export const P_MFIND = 6;
export const P_TFIND = 7;
export const P_RAISE = 8;
export const P_XHEAL = 9;
export const P_HASTE = 10;
export const P_RESTORE = 11;
export const P_BLIND = 12;
export const P_LEVIT = 13;
export const MAXPOTIONS = 14;

// ─── Scroll types ────────────────────────────────────

export const S_CONFUSE = 0;
export const S_MAP = 1;
export const S_HOLD = 2;
export const S_SLEEP = 3;
export const S_ARMOR = 4;
export const S_ID_POTION = 5;
export const S_ID_SCROLL = 6;
export const S_ID_WEAPON = 7;
export const S_ID_ARMOR = 8;
export const S_ID_R_OR_S = 9;
export const S_SCARE = 10;
export const S_FDET = 11;
export const S_TELEP = 12;
export const S_ENCH = 13;
export const S_CREATE = 14;
export const S_REMOVE = 15;
export const S_AGGR = 16;
export const S_PROTECT = 17;
export const MAXSCROLLS = 18;

// ─── Weapon types ────────────────────────────────────

export const MACE = 0;
export const SWORD = 1;
export const BOW = 2;
export const ARROW = 3;
export const DAGGER = 4;
export const TWOSWORD = 5;
export const DART = 6;
export const SHIRAKEN = 7;
export const SPEAR = 8;
export const FLAME = 9;
export const MAXWEAPONS = 9;

// ─── Armor types ─────────────────────────────────────

export const LEATHER = 0;
export const RING_MAIL = 1;
export const STUDDED_LEATHER = 2;
export const SCALE_MAIL = 3;
export const CHAIN_MAIL = 4;
export const SPLINT_MAIL = 5;
export const BANDED_MAIL = 6;
export const PLATE_MAIL = 7;
export const MAXARMORS = 8;

// ─── Ring types ──────────────────────────────────────

export const R_PROTECT = 0;
export const R_ADDSTR = 1;
export const R_SUSTSTR = 2;
export const R_SEARCH = 3;
export const R_SEEINVIS = 4;
export const R_NOP = 5;
export const R_AGGR = 6;
export const R_ADDHIT = 7;
export const R_ADDDAM = 8;
export const R_REGEN = 9;
export const R_DIGEST = 10;
export const R_TELEPORT = 11;
export const R_STEALTH = 12;
export const R_SUSTARM = 13;
export const MAXRINGS = 14;

// ─── Wand/Staff types ────────────────────────────────

export const WS_LIGHT = 0;
export const WS_INVIS = 1;
export const WS_ELECT = 2;
export const WS_FIRE = 3;
export const WS_COLD = 4;
export const WS_POLYMORPH = 5;
export const WS_MISSILE = 6;
export const WS_HASTE_M = 7;
export const WS_SLOW_M = 8;
export const WS_DRAIN = 9;
export const WS_NOP = 10;
export const WS_TELAWAY = 11;
export const WS_TELTO = 12;
export const WS_CANCEL = 13;
export const MAXSTICKS = 14;

// ─── Daemon system ───────────────────────────────────

export const BEFORE = 1;
export const AFTER = 2;
export const MAXDAEMONS = 20;

// ─── Data Tables ─────────────────────────────────────

/**
 * Monster table: 26 entries, A-Z.
 * Faithfully ported from extern.c monsters[26].
 * Note: ___ was 1 (placeholder HP) and XX was 10 (placeholder str).
 */
export const monsters: MonsterTemplate[] = [
  // A - aquator
  { m_name: "aquator",         m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:   20, s_lvl:  5, s_arm:  2, s_hpt: 1, s_dmg: "0x0/0x0",       s_maxhp: 1 } },
  // B - bat
  { m_name: "bat",             m_carry:   0, m_flags: ISFLY,
    m_stats: { s_str: 10, s_exp:    1, s_lvl:  1, s_arm:  3, s_hpt: 1, s_dmg: "1x2",            s_maxhp: 1 } },
  // C - centaur
  { m_name: "centaur",         m_carry:  15, m_flags: 0,
    m_stats: { s_str: 10, s_exp:   17, s_lvl:  4, s_arm:  4, s_hpt: 1, s_dmg: "1x2/1x5/1x5",   s_maxhp: 1 } },
  // D - dragon
  { m_name: "dragon",          m_carry: 100, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp: 5000, s_lvl: 10, s_arm: -1, s_hpt: 1, s_dmg: "1x8/1x8/3x10",  s_maxhp: 1 } },
  // E - emu
  { m_name: "emu",             m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:    2, s_lvl:  1, s_arm:  7, s_hpt: 1, s_dmg: "1x2",            s_maxhp: 1 } },
  // F - venus flytrap
  { m_name: "venus flytrap",   m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:   80, s_lvl:  8, s_arm:  3, s_hpt: 1, s_dmg: "%%%x0",          s_maxhp: 1 } },
  // G - griffin
  { m_name: "griffin",         m_carry:  20, m_flags: ISMEAN | ISFLY | ISREGEN,
    m_stats: { s_str: 10, s_exp: 2000, s_lvl: 13, s_arm:  2, s_hpt: 1, s_dmg: "4x3/3x5",       s_maxhp: 1 } },
  // H - hobgoblin
  { m_name: "hobgoblin",      m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:    3, s_lvl:  1, s_arm:  5, s_hpt: 1, s_dmg: "1x8",            s_maxhp: 1 } },
  // I - ice monster
  { m_name: "ice monster",    m_carry:   0, m_flags: 0,
    m_stats: { s_str: 10, s_exp:    5, s_lvl:  1, s_arm:  9, s_hpt: 1, s_dmg: "0x0",            s_maxhp: 1 } },
  // J - jabberwock
  { m_name: "jabberwock",     m_carry:  70, m_flags: 0,
    m_stats: { s_str: 10, s_exp: 3000, s_lvl: 15, s_arm:  6, s_hpt: 1, s_dmg: "2x12/2x4",      s_maxhp: 1 } },
  // K - kestrel
  { m_name: "kestrel",        m_carry:   0, m_flags: ISMEAN | ISFLY,
    m_stats: { s_str: 10, s_exp:    1, s_lvl:  1, s_arm:  7, s_hpt: 1, s_dmg: "1x4",            s_maxhp: 1 } },
  // L - leprechaun
  { m_name: "leprechaun",     m_carry:   0, m_flags: 0,
    m_stats: { s_str: 10, s_exp:   10, s_lvl:  3, s_arm:  8, s_hpt: 1, s_dmg: "1x1",            s_maxhp: 1 } },
  // M - medusa
  { m_name: "medusa",         m_carry:  40, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:  200, s_lvl:  8, s_arm:  2, s_hpt: 1, s_dmg: "3x4/3x4/2x5",   s_maxhp: 1 } },
  // N - nymph
  { m_name: "nymph",          m_carry: 100, m_flags: 0,
    m_stats: { s_str: 10, s_exp:   37, s_lvl:  3, s_arm:  9, s_hpt: 1, s_dmg: "0x0",            s_maxhp: 1 } },
  // O - orc
  { m_name: "orc",            m_carry:  15, m_flags: ISGREED,
    m_stats: { s_str: 10, s_exp:    5, s_lvl:  1, s_arm:  6, s_hpt: 1, s_dmg: "1x8",            s_maxhp: 1 } },
  // P - phantom
  { m_name: "phantom",        m_carry:   0, m_flags: ISINVIS,
    m_stats: { s_str: 10, s_exp:  120, s_lvl:  8, s_arm:  3, s_hpt: 1, s_dmg: "4x4",            s_maxhp: 1 } },
  // Q - quagga
  { m_name: "quagga",         m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:   15, s_lvl:  3, s_arm:  3, s_hpt: 1, s_dmg: "1x5/1x5",       s_maxhp: 1 } },
  // R - rattlesnake
  { m_name: "rattlesnake",    m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:    9, s_lvl:  2, s_arm:  3, s_hpt: 1, s_dmg: "1x6",            s_maxhp: 1 } },
  // S - snake
  { m_name: "snake",          m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:    2, s_lvl:  1, s_arm:  5, s_hpt: 1, s_dmg: "1x3",            s_maxhp: 1 } },
  // T - troll
  { m_name: "troll",          m_carry:  50, m_flags: ISREGEN | ISMEAN,
    m_stats: { s_str: 10, s_exp:  120, s_lvl:  6, s_arm:  4, s_hpt: 1, s_dmg: "1x8/1x8/2x6",   s_maxhp: 1 } },
  // U - black unicorn
  { m_name: "black unicorn",  m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:  190, s_lvl:  7, s_arm: -2, s_hpt: 1, s_dmg: "1x9/1x9/2x9",   s_maxhp: 1 } },
  // V - vampire
  { m_name: "vampire",        m_carry:  20, m_flags: ISREGEN | ISMEAN,
    m_stats: { s_str: 10, s_exp:  350, s_lvl:  8, s_arm:  1, s_hpt: 1, s_dmg: "1x10",           s_maxhp: 1 } },
  // W - wraith
  { m_name: "wraith",         m_carry:   0, m_flags: 0,
    m_stats: { s_str: 10, s_exp:   55, s_lvl:  5, s_arm:  4, s_hpt: 1, s_dmg: "1x6",            s_maxhp: 1 } },
  // X - xeroc
  { m_name: "xeroc",          m_carry:  30, m_flags: 0,
    m_stats: { s_str: 10, s_exp:  100, s_lvl:  7, s_arm:  7, s_hpt: 1, s_dmg: "4x4",            s_maxhp: 1 } },
  // Y - yeti
  { m_name: "yeti",           m_carry:  30, m_flags: 0,
    m_stats: { s_str: 10, s_exp:   50, s_lvl:  4, s_arm:  6, s_hpt: 1, s_dmg: "1x6/1x6",       s_maxhp: 1 } },
  // Z - zombie
  { m_name: "zombie",         m_carry:   0, m_flags: ISMEAN,
    m_stats: { s_str: 10, s_exp:    6, s_lvl:  2, s_arm:  8, s_hpt: 1, s_dmg: "1x8",            s_maxhp: 1 } },
];

/**
 * Experience level thresholds.
 * Ported from extern.c e_levels[21].
 */
export const e_levels: number[] = [
  10, 20, 40, 80, 160, 320, 640, 1300, 2600, 5200,
  13000, 26000, 50000, 100000, 200000, 400000, 800000,
  2000000, 4000000, 8000000, 0,
];

/**
 * Item generation probabilities.
 * Ported from extern.c things[NUMTHINGS].
 */
export const things: ObjInfo[] = [
  { oi_name: null, oi_prob: 26, oi_worth: 0, oi_guess: null, oi_know: false }, // potion
  { oi_name: null, oi_prob: 36, oi_worth: 0, oi_guess: null, oi_know: false }, // scroll
  { oi_name: null, oi_prob: 16, oi_worth: 0, oi_guess: null, oi_know: false }, // food
  { oi_name: null, oi_prob:  7, oi_worth: 0, oi_guess: null, oi_know: false }, // weapon
  { oi_name: null, oi_prob:  7, oi_worth: 0, oi_guess: null, oi_know: false }, // armor
  { oi_name: null, oi_prob:  4, oi_worth: 0, oi_guess: null, oi_know: false }, // ring
  { oi_name: null, oi_prob:  4, oi_worth: 0, oi_guess: null, oi_know: false }, // stick
];

/**
 * Armor info table.
 * Ported from extern.c arm_info[MAXARMORS].
 */
export const arm_info: ObjInfo[] = [
  { oi_name: "leather armor",         oi_prob: 20, oi_worth:  20, oi_guess: null, oi_know: false },
  { oi_name: "ring mail",             oi_prob: 15, oi_worth:  25, oi_guess: null, oi_know: false },
  { oi_name: "studded leather armor", oi_prob: 15, oi_worth:  20, oi_guess: null, oi_know: false },
  { oi_name: "scale mail",            oi_prob: 13, oi_worth:  30, oi_guess: null, oi_know: false },
  { oi_name: "chain mail",            oi_prob: 12, oi_worth:  75, oi_guess: null, oi_know: false },
  { oi_name: "splint mail",           oi_prob: 10, oi_worth:  80, oi_guess: null, oi_know: false },
  { oi_name: "banded mail",           oi_prob: 10, oi_worth:  90, oi_guess: null, oi_know: false },
  { oi_name: "plate mail",            oi_prob:  5, oi_worth: 150, oi_guess: null, oi_know: false },
];

/**
 * Potion info table.
 * Ported from extern.c pot_info[MAXPOTIONS].
 */
export const pot_info: ObjInfo[] = [
  { oi_name: "confusion",         oi_prob:  7, oi_worth:   5, oi_guess: null, oi_know: false },
  { oi_name: "hallucination",     oi_prob:  8, oi_worth:   5, oi_guess: null, oi_know: false },
  { oi_name: "poison",            oi_prob:  8, oi_worth:   5, oi_guess: null, oi_know: false },
  { oi_name: "gain strength",     oi_prob: 13, oi_worth: 150, oi_guess: null, oi_know: false },
  { oi_name: "see invisible",     oi_prob:  3, oi_worth: 100, oi_guess: null, oi_know: false },
  { oi_name: "healing",           oi_prob: 13, oi_worth: 130, oi_guess: null, oi_know: false },
  { oi_name: "monster detection",  oi_prob:  6, oi_worth: 130, oi_guess: null, oi_know: false },
  { oi_name: "magic detection",    oi_prob:  6, oi_worth: 105, oi_guess: null, oi_know: false },
  { oi_name: "raise level",       oi_prob:  2, oi_worth: 250, oi_guess: null, oi_know: false },
  { oi_name: "extra healing",     oi_prob:  5, oi_worth: 200, oi_guess: null, oi_know: false },
  { oi_name: "haste self",        oi_prob:  5, oi_worth: 190, oi_guess: null, oi_know: false },
  { oi_name: "restore strength",  oi_prob: 13, oi_worth: 130, oi_guess: null, oi_know: false },
  { oi_name: "blindness",         oi_prob:  5, oi_worth:   5, oi_guess: null, oi_know: false },
  { oi_name: "levitation",        oi_prob:  6, oi_worth:  75, oi_guess: null, oi_know: false },
];

/**
 * Ring info table.
 * Ported from extern.c ring_info[MAXRINGS].
 */
export const ring_info: ObjInfo[] = [
  { oi_name: "protection",        oi_prob:  9, oi_worth: 400, oi_guess: null, oi_know: false },
  { oi_name: "add strength",      oi_prob:  9, oi_worth: 400, oi_guess: null, oi_know: false },
  { oi_name: "sustain strength",   oi_prob:  5, oi_worth: 280, oi_guess: null, oi_know: false },
  { oi_name: "searching",         oi_prob: 10, oi_worth: 420, oi_guess: null, oi_know: false },
  { oi_name: "see invisible",     oi_prob: 10, oi_worth: 310, oi_guess: null, oi_know: false },
  { oi_name: "adornment",         oi_prob:  1, oi_worth:  10, oi_guess: null, oi_know: false },
  { oi_name: "aggravate monster",  oi_prob: 10, oi_worth:  10, oi_guess: null, oi_know: false },
  { oi_name: "dexterity",         oi_prob:  8, oi_worth: 440, oi_guess: null, oi_know: false },
  { oi_name: "increase damage",   oi_prob:  8, oi_worth: 400, oi_guess: null, oi_know: false },
  { oi_name: "regeneration",      oi_prob:  4, oi_worth: 460, oi_guess: null, oi_know: false },
  { oi_name: "slow digestion",    oi_prob:  9, oi_worth: 240, oi_guess: null, oi_know: false },
  { oi_name: "teleportation",     oi_prob:  5, oi_worth:  30, oi_guess: null, oi_know: false },
  { oi_name: "stealth",           oi_prob:  7, oi_worth: 470, oi_guess: null, oi_know: false },
  { oi_name: "maintain armor",    oi_prob:  5, oi_worth: 380, oi_guess: null, oi_know: false },
];

/**
 * Scroll info table.
 * Ported from extern.c scr_info[MAXSCROLLS].
 */
export const scr_info: ObjInfo[] = [
  { oi_name: "monster confusion",              oi_prob:  7, oi_worth: 140, oi_guess: null, oi_know: false },
  { oi_name: "magic mapping",                  oi_prob:  4, oi_worth: 150, oi_guess: null, oi_know: false },
  { oi_name: "hold monster",                   oi_prob:  2, oi_worth: 180, oi_guess: null, oi_know: false },
  { oi_name: "sleep",                          oi_prob:  3, oi_worth:   5, oi_guess: null, oi_know: false },
  { oi_name: "enchant armor",                  oi_prob:  7, oi_worth: 160, oi_guess: null, oi_know: false },
  { oi_name: "identify potion",               oi_prob: 10, oi_worth:  80, oi_guess: null, oi_know: false },
  { oi_name: "identify scroll",               oi_prob: 10, oi_worth:  80, oi_guess: null, oi_know: false },
  { oi_name: "identify weapon",               oi_prob:  6, oi_worth:  80, oi_guess: null, oi_know: false },
  { oi_name: "identify armor",                oi_prob:  7, oi_worth: 100, oi_guess: null, oi_know: false },
  { oi_name: "identify ring, wand or staff",   oi_prob: 10, oi_worth: 115, oi_guess: null, oi_know: false },
  { oi_name: "scare monster",                  oi_prob:  3, oi_worth: 200, oi_guess: null, oi_know: false },
  { oi_name: "food detection",                oi_prob:  2, oi_worth:  60, oi_guess: null, oi_know: false },
  { oi_name: "teleportation",                 oi_prob:  5, oi_worth: 165, oi_guess: null, oi_know: false },
  { oi_name: "enchant weapon",                oi_prob:  8, oi_worth: 150, oi_guess: null, oi_know: false },
  { oi_name: "create monster",                oi_prob:  4, oi_worth:  75, oi_guess: null, oi_know: false },
  { oi_name: "remove curse",                  oi_prob:  7, oi_worth: 105, oi_guess: null, oi_know: false },
  { oi_name: "aggravate monsters",            oi_prob:  3, oi_worth:  20, oi_guess: null, oi_know: false },
  { oi_name: "protect armor",                 oi_prob:  2, oi_worth: 250, oi_guess: null, oi_know: false },
];

/**
 * Weapon info table.
 * Ported from extern.c weap_info[MAXWEAPONS + 1].
 * Last entry is fake (dragon's breath).
 */
export const weap_info: ObjInfo[] = [
  { oi_name: "mace",             oi_prob: 11, oi_worth:  8, oi_guess: null, oi_know: false },
  { oi_name: "long sword",       oi_prob: 11, oi_worth: 15, oi_guess: null, oi_know: false },
  { oi_name: "short bow",        oi_prob: 12, oi_worth: 15, oi_guess: null, oi_know: false },
  { oi_name: "arrow",            oi_prob: 12, oi_worth:  1, oi_guess: null, oi_know: false },
  { oi_name: "dagger",           oi_prob:  8, oi_worth:  3, oi_guess: null, oi_know: false },
  { oi_name: "two handed sword", oi_prob: 10, oi_worth: 75, oi_guess: null, oi_know: false },
  { oi_name: "dart",             oi_prob: 12, oi_worth:  2, oi_guess: null, oi_know: false },
  { oi_name: "shuriken",         oi_prob: 12, oi_worth:  5, oi_guess: null, oi_know: false },
  { oi_name: "spear",            oi_prob: 12, oi_worth:  5, oi_guess: null, oi_know: false },
  { oi_name: null,               oi_prob:  0, oi_worth:  0, oi_guess: null, oi_know: false }, // dragon's breath
];

/**
 * Wand/Staff info table.
 * Ported from extern.c ws_info[MAXSTICKS].
 */
export const ws_info: ObjInfo[] = [
  { oi_name: "light",           oi_prob: 12, oi_worth: 250, oi_guess: null, oi_know: false },
  { oi_name: "invisibility",    oi_prob:  6, oi_worth:   5, oi_guess: null, oi_know: false },
  { oi_name: "lightning",       oi_prob:  3, oi_worth: 330, oi_guess: null, oi_know: false },
  { oi_name: "fire",            oi_prob:  3, oi_worth: 330, oi_guess: null, oi_know: false },
  { oi_name: "cold",            oi_prob:  3, oi_worth: 330, oi_guess: null, oi_know: false },
  { oi_name: "polymorph",       oi_prob: 15, oi_worth: 310, oi_guess: null, oi_know: false },
  { oi_name: "magic missile",   oi_prob: 10, oi_worth: 170, oi_guess: null, oi_know: false },
  { oi_name: "haste monster",   oi_prob: 10, oi_worth:   5, oi_guess: null, oi_know: false },
  { oi_name: "slow monster",    oi_prob: 11, oi_worth: 350, oi_guess: null, oi_know: false },
  { oi_name: "drain life",      oi_prob:  9, oi_worth: 300, oi_guess: null, oi_know: false },
  { oi_name: "nothing",         oi_prob:  1, oi_worth:   5, oi_guess: null, oi_know: false },
  { oi_name: "teleport away",   oi_prob:  6, oi_worth: 340, oi_guess: null, oi_know: false },
  { oi_name: "teleport to",     oi_prob:  6, oi_worth:  50, oi_guess: null, oi_know: false },
  { oi_name: "cancellation",    oi_prob:  5, oi_worth: 280, oi_guess: null, oi_know: false },
];

/**
 * Armor class for each armor type.
 * Ported from extern.c a_class[MAXARMORS].
 */
export const a_class: number[] = [
  8, // LEATHER
  7, // RING_MAIL
  7, // STUDDED_LEATHER
  6, // SCALE_MAIL
  5, // CHAIN_MAIL
  4, // SPLINT_MAIL
  4, // BANDED_MAIL
  3, // PLATE_MAIL
];

/**
 * Trap names.
 * Ported from extern.c tr_name[].
 */
export const tr_name: string[] = [
  "a trapdoor",
  "an arrow trap",
  "a sleeping gas trap",
  "a beartrap",
  "a teleport trap",
  "a poison dart trap",
  "a rust trap",
  "a mysterious trap",
];

/**
 * Inventory type names.
 * Ported from extern.c inv_t_name[].
 */
export const inv_t_name: string[] = [
  "Overwrite",
  "Slow",
  "Clear",
];

/**
 * Help strings.
 * Ported from extern.c helpstr[].
 */
export const helpstr: HelpEntry[] = [
  { h_ch: "?".charCodeAt(0),  h_desc: "\tprints help",                       h_print: true },
  { h_ch: "/".charCodeAt(0),  h_desc: "\tidentify object",                   h_print: true },
  { h_ch: "h".charCodeAt(0),  h_desc: "\tleft",                              h_print: true },
  { h_ch: "j".charCodeAt(0),  h_desc: "\tdown",                              h_print: true },
  { h_ch: "k".charCodeAt(0),  h_desc: "\tup",                                h_print: true },
  { h_ch: "l".charCodeAt(0),  h_desc: "\tright",                             h_print: true },
  { h_ch: "y".charCodeAt(0),  h_desc: "\tup & left",                         h_print: true },
  { h_ch: "u".charCodeAt(0),  h_desc: "\tup & right",                        h_print: true },
  { h_ch: "b".charCodeAt(0),  h_desc: "\tdown & left",                       h_print: true },
  { h_ch: "n".charCodeAt(0),  h_desc: "\tdown & right",                      h_print: true },
  { h_ch: "H".charCodeAt(0),  h_desc: "\trun left",                          h_print: false },
  { h_ch: "J".charCodeAt(0),  h_desc: "\trun down",                          h_print: false },
  { h_ch: "K".charCodeAt(0),  h_desc: "\trun up",                            h_print: false },
  { h_ch: "L".charCodeAt(0),  h_desc: "\trun right",                         h_print: false },
  { h_ch: "Y".charCodeAt(0),  h_desc: "\trun up & left",                     h_print: false },
  { h_ch: "U".charCodeAt(0),  h_desc: "\trun up & right",                    h_print: false },
  { h_ch: "B".charCodeAt(0),  h_desc: "\trun down & left",                   h_print: false },
  { h_ch: "N".charCodeAt(0),  h_desc: "\trun down & right",                  h_print: false },
  { h_ch: CTRL("H"),          h_desc: "\trun left until adjacent",            h_print: false },
  { h_ch: CTRL("J"),          h_desc: "\trun down until adjacent",            h_print: false },
  { h_ch: CTRL("K"),          h_desc: "\trun up until adjacent",              h_print: false },
  { h_ch: CTRL("L"),          h_desc: "\trun right until adjacent",           h_print: false },
  { h_ch: CTRL("Y"),          h_desc: "\trun up & left until adjacent",       h_print: false },
  { h_ch: CTRL("U"),          h_desc: "\trun up & right until adjacent",      h_print: false },
  { h_ch: CTRL("B"),          h_desc: "\trun down & left until adjacent",     h_print: false },
  { h_ch: CTRL("N"),          h_desc: "\trun down & right until adjacent",    h_print: false },
  { h_ch: 0,                  h_desc: "\t<SHIFT><dir>: run that way",         h_print: true },
  { h_ch: 0,                  h_desc: "\t<CTRL><dir>: run till adjacent",     h_print: true },
  { h_ch: "f".charCodeAt(0),  h_desc: "<dir>\tfight till death or near death", h_print: true },
  { h_ch: "t".charCodeAt(0),  h_desc: "<dir>\tthrow something",               h_print: true },
  { h_ch: "m".charCodeAt(0),  h_desc: "<dir>\tmove onto without picking up",  h_print: true },
  { h_ch: "z".charCodeAt(0),  h_desc: "<dir>\tzap a wand in a direction",     h_print: true },
  { h_ch: "^".charCodeAt(0),  h_desc: "<dir>\tidentify trap type",            h_print: true },
  { h_ch: "s".charCodeAt(0),  h_desc: "\tsearch for trap/secret door",        h_print: true },
  { h_ch: ">".charCodeAt(0),  h_desc: "\tgo down a staircase",               h_print: true },
  { h_ch: "<".charCodeAt(0),  h_desc: "\tgo up a staircase",                 h_print: true },
  { h_ch: ".".charCodeAt(0),  h_desc: "\trest for a turn",                   h_print: true },
  { h_ch: ",".charCodeAt(0),  h_desc: "\tpick something up",                 h_print: true },
  { h_ch: "i".charCodeAt(0),  h_desc: "\tinventory",                         h_print: true },
  { h_ch: "I".charCodeAt(0),  h_desc: "\tinventory single item",             h_print: true },
  { h_ch: "q".charCodeAt(0),  h_desc: "\tquaff potion",                      h_print: true },
  { h_ch: "r".charCodeAt(0),  h_desc: "\tread scroll",                       h_print: true },
  { h_ch: "e".charCodeAt(0),  h_desc: "\teat food",                          h_print: true },
  { h_ch: "w".charCodeAt(0),  h_desc: "\twield a weapon",                    h_print: true },
  { h_ch: "W".charCodeAt(0),  h_desc: "\twear armor",                        h_print: true },
  { h_ch: "T".charCodeAt(0),  h_desc: "\ttake armor off",                    h_print: true },
  { h_ch: "P".charCodeAt(0),  h_desc: "\tput on ring",                       h_print: true },
  { h_ch: "R".charCodeAt(0),  h_desc: "\tremove ring",                       h_print: true },
  { h_ch: "d".charCodeAt(0),  h_desc: "\tdrop object",                       h_print: true },
  { h_ch: "c".charCodeAt(0),  h_desc: "\tcall object",                       h_print: true },
  { h_ch: "a".charCodeAt(0),  h_desc: "\trepeat last command",               h_print: true },
  { h_ch: ")".charCodeAt(0),  h_desc: "\tprint current weapon",              h_print: true },
  { h_ch: "]".charCodeAt(0),  h_desc: "\tprint current armor",               h_print: true },
  { h_ch: "=".charCodeAt(0),  h_desc: "\tprint current rings",               h_print: true },
  { h_ch: "@".charCodeAt(0),  h_desc: "\tprint current stats",               h_print: true },
  { h_ch: "D".charCodeAt(0),  h_desc: "\trecall what's been discovered",     h_print: true },
  { h_ch: "o".charCodeAt(0),  h_desc: "\texamine/set options",               h_print: true },
  { h_ch: CTRL("R"),          h_desc: "\tredraw screen",                     h_print: true },
  { h_ch: CTRL("P"),          h_desc: "\trepeat last message",               h_print: true },
  { h_ch: ESCAPE,             h_desc: "\tcancel command",                    h_print: true },
  { h_ch: "S".charCodeAt(0),  h_desc: "\tsave game",                         h_print: true },
  { h_ch: "Q".charCodeAt(0),  h_desc: "\tquit",                              h_print: true },
  { h_ch: "!".charCodeAt(0),  h_desc: "\tshell escape",                      h_print: true },
  { h_ch: "F".charCodeAt(0),  h_desc: "<dir>\tfight till either of you dies", h_print: true },
  { h_ch: "v".charCodeAt(0),  h_desc: "\tprint version number",              h_print: true },
];

// ─── String pools from init.c ────────────────────────

export const rainbow: string[] = [
  "amber", "aquamarine", "black", "blue", "brown", "clear", "crimson",
  "cyan", "ecru", "gold", "green", "grey", "magenta", "orange", "pink",
  "plaid", "purple", "red", "silver", "tan", "tangerine", "topaz",
  "turquoise", "vermilion", "violet", "white", "yellow",
];

export const sylls: string[] = [
  "a", "ab", "ag", "aks", "ala", "an", "app", "arg", "arze", "ash",
  "bek", "bie", "bit", "bjor", "blu", "bot", "bu", "byt", "comp",
  "con", "cos", "cre", "dalf", "dan", "den", "do", "e", "eep", "el",
  "eng", "er", "ere", "erk", "esh", "evs", "fa", "fid", "fri", "fu",
  "gan", "gar", "glen", "gop", "gre", "ha", "hyd", "i", "ing", "ip",
  "ish", "it", "ite", "iv", "jo", "kho", "kli", "klis", "la", "lech",
  "mar", "me", "mi", "mic", "mik", "mon", "mung", "mur", "nej",
  "nelg", "nep", "ner", "nes", "nes", "nih", "nin", "o", "od", "ood",
  "org", "orn", "ox", "oxy", "pay", "ple", "plu", "po", "pot",
  "prok", "re", "rea", "rhov", "ri", "ro", "rog", "rok", "rol", "sa",
  "san", "sat", "sef", "seh", "shu", "ski", "sna", "sne", "snik",
  "sno", "so", "sol", "sri", "sta", "sun", "ta", "tab", "tem",
  "ther", "ti", "tox", "trol", "tue", "turs", "u", "ulk", "um", "un",
  "uni", "ur", "val", "viv", "vly", "vom", "wah", "wed", "werg",
  "wex", "whon", "wun", "xo", "y", "yot", "yu", "zant", "zeb", "zim",
  "zok", "zon", "zum",
];

export const stones: Stone[] = [
  { st_name: "agate",          st_value:  25 },
  { st_name: "alexandrite",    st_value:  40 },
  { st_name: "amethyst",       st_value:  50 },
  { st_name: "carnelian",      st_value:  40 },
  { st_name: "diamond",        st_value: 300 },
  { st_name: "emerald",        st_value: 300 },
  { st_name: "germanium",      st_value: 225 },
  { st_name: "granite",        st_value:   5 },
  { st_name: "garnet",         st_value:  50 },
  { st_name: "jade",           st_value: 150 },
  { st_name: "kryptonite",     st_value: 300 },
  { st_name: "lapis lazuli",   st_value:  50 },
  { st_name: "moonstone",      st_value:  50 },
  { st_name: "obsidian",       st_value:  15 },
  { st_name: "onyx",           st_value:  60 },
  { st_name: "opal",           st_value: 200 },
  { st_name: "pearl",          st_value: 220 },
  { st_name: "peridot",        st_value:  63 },
  { st_name: "ruby",           st_value: 350 },
  { st_name: "sapphire",       st_value: 285 },
  { st_name: "stibotantalite", st_value: 200 },
  { st_name: "tiger eye",      st_value:  50 },
  { st_name: "topaz",          st_value:  60 },
  { st_name: "turquoise",      st_value:  70 },
  { st_name: "taaffeite",      st_value: 300 },
  { st_name: "zircon",         st_value:  80 },
];

export const wood: string[] = [
  "avocado wood", "balsa", "bamboo", "banyan", "birch", "cedar", "cherry",
  "cinnibar", "cypress", "dogwood", "driftwood", "ebony", "elm", "eucalyptus",
  "fall", "hemlock", "holly", "ironwood", "kukui wood", "mahogany", "manzanita",
  "maple", "oaken", "persimmon wood", "pecan", "pine", "poplar", "redwood",
  "rosewood", "spruce", "teak", "walnut", "zebrawood",
];

export const metal: string[] = [
  "aluminum", "beryllium", "bone", "brass", "bronze", "copper", "electrum",
  "gold", "iron", "lead", "magnesium", "mercury", "nickel", "pewter",
  "platinum", "steel", "silver", "silicon", "tin", "titanium", "tungsten",
  "zinc",
];

// ─── Mutable Game State ──────────────────────────────

// Initial stats: { str=16, exp=0, lvl=1, arm=10, hpt=12, dmg="1x4", maxhp=12 }
const INIT_STATS: Stats = {
  s_str: 16, s_exp: 0, s_lvl: 1, s_arm: 10, s_hpt: 12, s_dmg: "1x4", s_maxhp: 12,
};

function createDefaultPlayer(): import("./types.js").Monster {
  return {
    _kind: "monster",
    l_next: null,
    l_prev: null,
    t_pos: { x: 0, y: 0 },
    t_turn: false,
    t_type: "@",
    t_disguise: "@",
    t_oldch: " ",
    t_dest: null,
    t_flags: 0,
    t_stats: { ...INIT_STATS },
    t_room: null,
    t_pack: null,
    t_reserved: 0,
  };
}

function createDefaultRoom(): Room {
  return {
    r_pos: { x: 0, y: 0 },
    r_max: { x: 0, y: 0 },
    r_gold: { x: 0, y: 0 },
    r_goldval: 0,
    r_flags: 0,
    r_nexits: 0,
    r_exit: [],
  };
}

function createPassage(): Room {
  return {
    r_pos: { x: 0, y: 0 },
    r_max: { x: 0, y: 0 },
    r_gold: { x: 0, y: 0 },
    r_goldval: 0,
    r_flags: ISGONE | ISDARK,
    r_nexits: 0,
    r_exit: [],
  };
}

function createPlace(): Place {
  return { p_ch: " ", p_flags: 0, p_monst: null };
}

export const state = {
  // Boolean flags
  after: false,
  again: false,
  noscore: 0,
  seenstairs: false,
  amulet: false,
  door_stop: false,
  fight_flush: false,
  firstmove: false,
  has_hit: false,
  inv_describe: true,
  jump: false,
  kamikaze: false,
  lower_msg: false,
  move_no_pickup: false,
  move_on: false,
  msg_esc: false,
  passgo: false,
  playing: true,
  q_comm: false,
  running: false,
  save_msg: true,
  see_floor: true,
  stat_msg: false,
  terse: false,
  to_death: false,
  tombstone: true,
  wizard: false,

  // Pack tracking
  pack_used: new Array<boolean>(26).fill(false),

  // Character data
  dir_ch: "",
  file_name: "",
  huh: "",
  p_colors: new Array<string>(MAXPOTIONS).fill(""),
  prbuf: "",
  r_stones: new Array<string>(MAXRINGS).fill(""),
  runch: "",
  s_names: new Array<string>(MAXSCROLLS).fill(""),
  take: "",
  whoami: "Rodney",
  ws_made: new Array<string>(MAXSTICKS).fill(""),
  ws_type: new Array<string>(MAXSTICKS).fill(""),
  fruit: "slime-mold",
  home: "",

  l_last_comm: "",
  l_last_dir: "",
  last_comm: "",
  last_dir: "",

  // Numeric state
  n_objs: 0,
  ntraps: 0,
  hungry_state: 0,
  inpack: 0,
  inv_type: 0,
  level: 1,
  max_hit: 0,
  max_level: 0,
  mpos: 0,
  no_food: 0,
  count: 0,
  food_left: 0,
  lastscore: -1,
  no_command: 0,
  no_move: 0,
  purse: 0,
  quiet: 0,
  vf_hit: 0,
  dnum: 0,
  seed: 0,
  total: 0,
  between: 0,
  group: 0,

  // Coordinate state
  delta: { x: 0, y: 0 } as Coord,
  oldpos: { x: 0, y: 0 } as Coord,
  stairs: { x: 0, y: 0 } as Coord,
  nh: { x: 0, y: 0 } as Coord,

  // Level map: MAXLINES * MAXCOLS = 32 * 80 = 2560
  places: Array.from({ length: MAXLINES * MAXCOLS }, createPlace) as Place[],

  // Thing pointers
  cur_armor: null as Thing | null,
  cur_ring: [null, null] as [Thing | null, Thing | null],
  cur_weapon: null as Thing | null,
  l_last_pick: null as Thing | null,
  last_pick: null as Thing | null,
  lvl_obj: null as Thing | null,
  mlist: null as Thing | null,
  player: createDefaultPlayer() as import("./types.js").Monster,

  // Max stats
  max_stats: { ...INIT_STATS } as Stats,

  // Room state
  oldrp: null as Room | null,
  rooms: Array.from({ length: MAXROOMS }, createDefaultRoom) as Room[],
  passages: Array.from({ length: MAXPASS }, createPassage) as Room[],

  // Window handles
  stdscr: null as CursesWindow | null,
  hw: null as CursesWindow | null,

  // Daemon list
  d_list: Array.from({ length: MAXDAEMONS }, (): DelayedAction => ({
    d_type: 0,
    d_func: null,
    d_arg: 0,
    d_time: 0,
  })),

  // Game result (set on death/quit/victory)
  _result: null as import("./types.js").RogueResult | null,

  // Internal game loop flags
  _newLevel: false,
  _saveData: null as string | null,
};

// ─── Place accessor functions (matching C macros) ────

export function INDEX(y: number, x: number): Place {
  return state.places[(x << 5) + y];
}

export function chat(y: number, x: number): string {
  return state.places[(x << 5) + y].p_ch;
}

export function setCh(y: number, x: number, ch: string): void {
  state.places[(x << 5) + y].p_ch = ch;
}

export function flat(y: number, x: number): number {
  return state.places[(x << 5) + y].p_flags;
}

export function setFlat(y: number, x: number, flags: number): void {
  state.places[(x << 5) + y].p_flags = flags;
}

export function moat(y: number, x: number): Thing | null {
  return state.places[(x << 5) + y].p_monst;
}

export function setMoat(y: number, x: number, monst: Thing | null): void {
  state.places[(x << 5) + y].p_monst = monst;
}

// ─── Macro functions ─────────────────────────────────

export function winat(y: number, x: number): string {
  const monster = moat(y, x);
  if (monster !== null && monster._kind === "monster") {
    return monster.t_disguise;
  }
  return chat(y, x);
}

export function GOLDCALC(): number {
  return utilRnd(50 + 10 * state.level) + 2;
}

export function ISRING(hand: number, ringType: number): boolean {
  const ring = state.cur_ring[hand];
  return ring !== null && ring._kind === "object" && ring.o_which === ringType;
}

export function ISWEARING(ringType: number): boolean {
  return ISRING(LEFT, ringType) || ISRING(RIGHT, ringType);
}

export function ISMULT(type: number): boolean {
  return type === POTION.charCodeAt(0) || type === SCROLL.charCodeAt(0) || type === FOOD.charCodeAt(0);
}

// ─── Player accessor macros ──────────────────────────

export function hero(): Coord {
  return state.player.t_pos;
}

export function pstats(): Stats {
  return state.player.t_stats;
}

export function pack(): Thing | null {
  return state.player.t_pack;
}

export function proom(): Room | null {
  return state.player.t_room;
}

// ─── Reset state for new game ────────────────────────

export function resetState(): void {
  state.after = false;
  state.again = false;
  state.noscore = 0;
  state.seenstairs = false;
  state.amulet = false;
  state.door_stop = false;
  state.fight_flush = false;
  state.firstmove = false;
  state.has_hit = false;
  state.inv_describe = true;
  state.jump = false;
  state.kamikaze = false;
  state.lower_msg = false;
  state.move_on = false;
  state.msg_esc = false;
  state.passgo = false;
  state.playing = true;
  state.q_comm = false;
  state.running = false;
  state.save_msg = true;
  state.see_floor = true;
  state.stat_msg = false;
  state.terse = false;
  state.to_death = false;
  state.tombstone = true;
  state.wizard = false;

  state.pack_used.fill(false);
  state.p_colors.fill("");
  state.r_stones.fill("");
  state.s_names.fill("");
  state.ws_made.fill("");
  state.ws_type.fill("");

  state.dir_ch = "";
  state.file_name = "";
  state.huh = "";
  state.runch = "";
  state.take = "";
  state.whoami = "Rodney";
  state.fruit = "slime-mold";
  state.home = "";
  state.l_last_comm = "";
  state.l_last_dir = "";
  state.last_comm = "";
  state.last_dir = "";

  state.n_objs = 0;
  state.ntraps = 0;
  state.hungry_state = 0;
  state.inpack = 0;
  state.inv_type = 0;
  state.level = 1;
  state.max_hit = 0;
  state.max_level = 0;
  state.mpos = 0;
  state.no_food = 0;
  state.count = 0;
  state.food_left = 0;
  state.lastscore = -1;
  state.no_command = 0;
  state.no_move = 0;
  state.purse = 0;
  state.quiet = 0;
  state.vf_hit = 0;
  state.total = 0;
  state.between = 0;
  state.group = 0;

  state.delta = { x: 0, y: 0 };
  state.oldpos = { x: 0, y: 0 };
  state.stairs = { x: 0, y: 0 };
  state.nh = { x: 0, y: 0 };

  for (const place of state.places) {
    place.p_ch = " ";
    place.p_flags = 0;
    place.p_monst = null;
  }

  state.cur_armor = null;
  state.cur_ring = [null, null];
  state.cur_weapon = null;
  state.l_last_pick = null;
  state.last_pick = null;
  state.lvl_obj = null;
  state.mlist = null;
  state.player = createDefaultPlayer();
  state.max_stats = { ...INIT_STATS };

  state.oldrp = null;
  state.rooms = Array.from({ length: MAXROOMS }, createDefaultRoom);
  state.passages = Array.from({ length: MAXPASS }, createPassage);

  state.d_list = Array.from({ length: MAXDAEMONS }, (): DelayedAction => ({
    d_type: 0,
    d_func: null,
    d_arg: 0,
    d_time: 0,
  }));

  state._result = null;
  state._newLevel = false;
  state._saveData = null;
}
