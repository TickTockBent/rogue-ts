/**
 * CursesBackend interface, CursesWindow, and all curses constants.
 *
 * This is the contract between rogue-ts and its display/input consumer.
 * The game calls these methods; consumers implement them.
 */

// Curses attributes (bitmask, matches PDCurses values)
export const A_NORMAL    = 0x00000000;
export const A_STANDOUT  = 0x00010000;
export const A_UNDERLINE = 0x00020000;
export const A_REVERSE   = 0x00040000;
export const A_BLINK     = 0x00080000;
export const A_BOLD      = 0x00100000;
export const A_CHARTEXT  = 0x000000ff;
export const A_COLOR     = 0x0000ff00;

// Curses color constants
export const COLOR_BLACK   = 0;
export const COLOR_RED     = 1;
export const COLOR_GREEN   = 2;
export const COLOR_YELLOW  = 3;
export const COLOR_BLUE    = 4;
export const COLOR_MAGENTA = 5;
export const COLOR_CYAN    = 6;
export const COLOR_WHITE   = 7;

// Special key constants (returned by getch)
export const KEY_DOWN  = 0x102;
export const KEY_UP    = 0x103;
export const KEY_LEFT  = 0x104;
export const KEY_RIGHT = 0x105;
export const KEY_HOME  = 0x106;
export const KEY_END   = 0x168;
export const KEY_F0    = 0x108;
export const KEY_F1    = 0x109;
export const KEY_F2    = 0x10a;
export const KEY_F3    = 0x10b;
export const KEY_F4    = 0x10c;
export const KEY_F5    = 0x10d;
export const KEY_F6    = 0x10e;
export const KEY_F7    = 0x10f;
export const KEY_F8    = 0x110;
export const KEY_F9    = 0x111;
export const KEY_F10   = 0x112;
export const KEY_F11   = 0x113;
export const KEY_F12   = 0x114;

export const ERR = -1;
export const OK  = 0;

/**
 * Opaque window handle. The backend creates and manages these.
 * The game never inspects the internals - it only passes them
 * back to the backend's w* functions.
 */
export interface CursesWindow {
  readonly id: number;
}

export interface CursesBackend {
  // Screen lifecycle
  initscr(): CursesWindow;
  endwin(): void;
  isendwin(): boolean;

  // Screen dimensions (set by initscr, read by the game)
  readonly LINES: number;
  readonly COLS: number;

  // stdscr operations
  move(y: number, x: number): void;
  addch(ch: number): void;
  addstr(str: string): void;
  mvaddch(y: number, x: number, ch: number): void;
  mvaddstr(y: number, x: number, str: string): void;
  printw(fmt: string, ...args: unknown[]): void;
  mvprintw(y: number, x: number, fmt: string, ...args: unknown[]): void;
  inch(): number;
  mvinch(y: number, x: number): number;
  clear(): void;
  clrtoeol(): void;
  refresh(): void;
  standout(): void;
  standend(): void;
  getyx(): [number, number];

  // Window operations
  newwin(nlines: number, ncols: number, begy: number, begx: number): CursesWindow;
  delwin(win: CursesWindow): void;
  wmove(win: CursesWindow, y: number, x: number): void;
  waddch(win: CursesWindow, ch: number): void;
  mvwaddch(win: CursesWindow, y: number, x: number, ch: number): void;
  waddstr(win: CursesWindow, str: string): void;
  mvwaddstr(win: CursesWindow, y: number, x: number, str: string): void;
  wprintw(win: CursesWindow, fmt: string, ...args: unknown[]): void;
  wrefresh(win: CursesWindow): void;
  wclear(win: CursesWindow): void;
  wclrtoeol(win: CursesWindow): void;
  touchwin(win: CursesWindow): void;
  clearok(win: CursesWindow, flag: boolean): void;
  overwrite(src: CursesWindow, dst: CursesWindow): void;

  // Input
  getch(): Promise<number>;

  // Terminal modes
  cbreak(): void;
  nocbreak(): void;
  noecho(): void;
  echo(): void;
  raw(): void;
  noraw(): void;
  keypad(win: CursesWindow, flag: boolean): void;
  typeahead(fd: number): void;

  // Misc
  baudrate(): number;
  mvcur(oldrow: number, oldcol: number, newrow: number, newcol: number): void;
  idlok(win: CursesWindow, flag: boolean): void;

  // Save/Restore
  saveGame(data: Uint8Array): Promise<boolean>;
  restoreGame(): Promise<Uint8Array | null>;
}
