import { charWidth } from './width';
import { Utf8Decoder } from './utf8';

export const A_BOLD = 1, A_DIM = 2, A_ITALIC = 4, A_UNDERLINE = 8, A_BLINK = 16, A_INVERSE = 32, A_HIDDEN = 64, A_STRIKE = 128;
/** kolor: -1 = domyślny, 0..255 = paleta, >= TRUE = truecolor (TRUE + 0xRRGGBB) */
export const TRUE = 0x1000000;
export const DEFAULT = -1;

export interface Cell { ch: string; fg: number; bg: number; attr: number }
export interface Line { cells: Cell[]; wrapped: boolean }
export interface Run { text: string; fg: number; bg: number; attr: number; col: number; /** szerokość w komórkach */ w: number }
/** Wiersz po zejściu do bufora przewijania: tylko serie + znaki per kolumna (oszczędza pamięć). */
export interface Packed { runs: Run[]; chars: string[]; wrapped: boolean }
export type RowView = Packed;

export interface MouseModes { track: 0 | 1000 | 1002 | 1003; sgr: boolean }

const DEC_GRAPHICS: Record<string, string> = {
  '`': '◆', a: '▒', f: '°', g: '±', j: '┘', k: '┐', l: '┌', m: '└', n: '┼', o: '⎺', p: '⎻', q: '─', r: '⎼', s: '⎽',
  t: '├', u: '┤', v: '┴', w: '┬', x: '│', y: '≤', z: '≥', '{': 'π', '|': '≠', '}': '£', '~': '·',
};

const enum S { Ground, Escape, EscInter, Csi, Osc, StringIgnore, OscEsc, StrEsc, Charset }

export class Emulator {
  cols: number;
  rows: number;
  maxScrollback: number;

  grid: Line[] = [];
  scrollback: Packed[] = [];
  private altSaved: { grid: Line[]; cx: number; cy: number } | null = null;
  altScreen = false;

  cx = 0;
  cy = 0;
  private wrapPending = false;
  private saved = { x: 0, y: 0, fg: DEFAULT, bg: DEFAULT, attr: 0, wrap: false, g0: 'B' };
  private top = 0;
  private bottom: number;
  private tabStops: boolean[] = [];

  // atrybuty „pióra”
  private fg = DEFAULT;
  private bg = DEFAULT;
  private attr = 0;

  // tryby
  appCursorKeys = false;
  autoWrap = true;
  insertMode = false;
  cursorVisible = true;
  bracketedPaste = false;
  mouse: MouseModes = { track: 0, sgr: false };
  private originMode = false;
  private g0 = 'B';

  // callbacki
  onResponse: (data: string) => void = () => {};
  onTitle: (title: string) => void = () => {};
  onCwd: (path: string) => void = () => {};
  onBell: () => void = () => {};

  /** liczy zmiany; widok odświeża się, gdy wartość się zmieni */
  version = 0;
  /** przesunięcie widoku w górę (0 = ostatni wiersz na dole) */
  viewOffset = 0;

  private state: S = S.Ground;
  private params: number[] = [];
  private paramStr = '';
  private inter = '';
  private oscBuf = '';
  private decoder = new Utf8Decoder();
  private lastChar = '';

  constructor(cols = 80, rows = 24, scrollback = 5000) {
    this.cols = Math.max(2, cols);
    this.rows = Math.max(1, rows);
    this.maxScrollback = scrollback;
    this.bottom = this.rows - 1;
    this.grid = Array.from({ length: this.rows }, () => this.blankLine());
    this.resetTabs();
  }

  // ───────────────────────── wejście ─────────────────────────

  /** bajty z PTY (strumieniowy dekoder UTF-8: ucięte sekwencje nie psują znaków) */
  write(bytes: Uint8Array): void {
    this.feed(this.decoder.decode(bytes));
  }

  feed(s: string): void {
    for (const ch of s) this.put(ch);
    this.version++;
  }

  // ───────────────────────── pomocnicze ─────────────────────────

  private blankCell(): Cell { return { ch: ' ', fg: DEFAULT, bg: this.bg, attr: 0 }; }
  private blankLine(): Line {
    const cells: Cell[] = new Array(this.cols);
    for (let i = 0; i < this.cols; i++) cells[i] = this.blankCell();
    return { cells, wrapped: false };
  }
  private resetTabs(): void {
    this.tabStops = Array.from({ length: this.cols }, (_, i) => i % 8 === 0 && i > 0);
  }

  private pack(line: Line): Packed {
    return { runs: lineRuns(line.cells), chars: line.cells.map((c) => c.ch), wrapped: line.wrapped };
  }

  private scrollUp(n = 1): void {
    for (let i = 0; i < n; i++) {
      const removed = this.grid.splice(this.top, 1)[0];
      if (!this.altScreen && this.top === 0 && this.maxScrollback > 0) {
        this.scrollback.push(this.pack(removed));
        if (this.scrollback.length > this.maxScrollback) this.scrollback.shift();
        if (this.viewOffset > 0) this.viewOffset = Math.min(this.viewOffset + 1, this.scrollback.length);
      }
      this.grid.splice(this.bottom, 0, this.blankLine());
    }
  }
  private scrollDown(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.grid.splice(this.bottom, 1);
      this.grid.splice(this.top, 0, this.blankLine());
    }
  }

  private lineFeed(): void {
    if (this.cy === this.bottom) this.scrollUp();
    else if (this.cy < this.rows - 1) this.cy++;
  }
  private reverseIndex(): void {
    if (this.cy === this.top) this.scrollDown();
    else if (this.cy > 0) this.cy--;
  }

  // ───────────────────────── automat stanów ─────────────────────────

  private put(ch: string): void {
    const cp = ch.codePointAt(0)!;
    switch (this.state) {
      case S.Ground: return this.ground(ch, cp);
      case S.Escape: return this.escape(ch, cp);
      case S.EscInter:
        if (cp >= 0x20 && cp <= 0x2f) { this.inter += ch; return; }
        this.escDispatch(ch); this.state = S.Ground; return;
      case S.Charset:
        if (this.inter === '(') this.g0 = ch === '0' ? '0' : 'B';
        this.state = S.Ground; return;
      case S.Csi: return this.csi(ch, cp);
      case S.Osc:
        if (cp === 7) { this.oscEnd(); this.state = S.Ground; }
        else if (cp === 0x1b) this.state = S.OscEsc;
        else if (cp === 0x9c) { this.oscEnd(); this.state = S.Ground; }
        else if (cp >= 0x20) this.oscBuf += ch;
        return;
      case S.OscEsc:
        if (ch === '\\') this.oscEnd();
        this.state = S.Ground;
        if (ch !== '\\') this.put(ch);
        return;
      case S.StringIgnore:
        if (cp === 0x1b) this.state = S.StrEsc;
        else if (cp === 7 || cp === 0x9c) this.state = S.Ground;
        return;
      case S.StrEsc:
        this.state = ch === '\\' ? S.Ground : S.StringIgnore;
        return;
    }
  }

  private ground(ch: string, cp: number): void {
    if (cp < 0x20) return this.c0(cp);
    if (cp === 0x7f) return;
    if (cp >= 0x80 && cp < 0xa0) return;
    this.print(ch, cp);
  }

  private c0(cp: number): void {
    switch (cp) {
      case 0x07: this.onBell(); break;
      case 0x08: if (this.cx > 0) this.cx--; this.wrapPending = false; break;
      case 0x09: this.tab(1); break;
      case 0x0a: case 0x0b: case 0x0c: this.lineFeed(); this.wrapPending = false; break;
      case 0x0d: this.cx = 0; this.wrapPending = false; break;
      case 0x1b: this.state = S.Escape; this.inter = ''; break;
      case 0x18: case 0x1a: this.state = S.Ground; break;
    }
  }

  private tab(n: number): void {
    for (let i = 0; i < n; i++) {
      let x = this.cx + 1;
      while (x < this.cols - 1 && !this.tabStops[x]) x++;
      this.cx = Math.min(x, this.cols - 1);
    }
    this.wrapPending = false;
  }
  private backTab(n: number): void {
    for (let i = 0; i < n; i++) {
      let x = this.cx - 1;
      while (x > 0 && !this.tabStops[x]) x--;
      this.cx = Math.max(x, 0);
    }
    this.wrapPending = false;
  }

  private print(ch: string, cp: number): void {
    if (this.g0 === '0' && DEC_GRAPHICS[ch]) { ch = DEC_GRAPHICS[ch]; cp = ch.codePointAt(0)!; }
    const w = charWidth(cp);
    if (w === 0) {
      // znak łączący: dołącz do poprzedniej komórki
      const y = this.cy;
      let x = this.cx - (this.wrapPending ? 0 : 1);
      if (x < 0) return;
      const cells = this.grid[y].cells;
      if (cells[x] && cells[x].ch === '' && x > 0) x--;
      if (cells[x]) cells[x] = { ...cells[x], ch: cells[x].ch + ch };
      return;
    }
    if (this.wrapPending) {
      if (this.autoWrap) {
        this.grid[this.cy].wrapped = true;
        this.cx = 0;
        this.lineFeed();
      }
      this.wrapPending = false;
    }
    if (w === 2 && this.cx === this.cols - 1) {
      if (this.autoWrap) {
        this.grid[this.cy].cells[this.cx] = this.blankCell();
        this.grid[this.cy].wrapped = true;
        this.cx = 0;
        this.lineFeed();
      } else return;
    }
    const cells = this.grid[this.cy].cells;
    if (this.insertMode) {
      cells.splice(this.cx, 0, ...Array.from({ length: w }, () => this.blankCell()));
      cells.length = this.cols;
    }
    // nadpisanie połowy znaku szerokiego czyści drugą połowę
    if (cells[this.cx].ch === '' && this.cx > 0) cells[this.cx - 1] = this.blankCell();
    if (w === 1 && this.cx + 1 < this.cols && cells[this.cx + 1].ch === '' ) cells[this.cx + 1] = this.blankCell();
    cells[this.cx] = { ch, fg: this.fg, bg: this.bg, attr: this.attr };
    if (w === 2) cells[this.cx + 1] = { ch: '', fg: this.fg, bg: this.bg, attr: this.attr };
    this.lastChar = ch;
    this.cx += w;
    if (this.cx >= this.cols) { this.cx = this.cols - 1; this.wrapPending = true; }
  }

  private escape(ch: string, cp: number): void {
    if (cp >= 0x20 && cp <= 0x2f) {
      this.inter = ch;
      this.state = ch === '(' || ch === ')' || ch === '*' || ch === '+' ? S.Charset : S.EscInter;
      return;
    }
    switch (ch) {
      case '[': this.state = S.Csi; this.params = []; this.paramStr = ''; this.inter = ''; return;
      case ']': this.state = S.Osc; this.oscBuf = ''; return;
      case 'P': case '_': case '^': case 'X': this.state = S.StringIgnore; return;
    }
    this.state = S.Ground;
    this.escDispatch(ch);
  }

  private escDispatch(ch: string): void {
    if (this.inter === '#') { if (ch === '8') this.fillScreen('E'); return; }
    switch (ch) {
      case '7': this.saveCursor(); break;
      case '8': this.restoreCursor(); break;
      case 'D': this.lineFeed(); break;
      case 'E': this.cx = 0; this.lineFeed(); break;
      case 'M': this.reverseIndex(); break;
      case 'H': this.tabStops[this.cx] = true; break;
      case 'c': this.reset(); break;
      case '=': case '>': break;
    }
    this.wrapPending = false;
  }

  private fillScreen(c: string): void {
    for (const l of this.grid) for (let i = 0; i < this.cols; i++) l.cells[i] = { ch: c, fg: DEFAULT, bg: DEFAULT, attr: 0 };
  }

  private csi(ch: string, cp: number): void {
    if (cp >= 0x30 && cp <= 0x3b) { this.paramStr += ch; return; }       // cyfry ; :
    if (cp >= 0x3c && cp <= 0x3f) { this.inter += ch; return; }           // ? > < =
    if (cp >= 0x20 && cp <= 0x2f) { this.inter += ch; return; }
    if (cp >= 0x40 && cp <= 0x7e) {
      this.state = S.Ground;
      this.csiDispatch(ch, this.paramStr);
      return;
    }
    if (cp === 0x1b) { this.state = S.Escape; return; }
    if (cp < 0x20) this.c0(cp);   // C0 w środku CSI wykonuje się od razu
  }

  private oscEnd(): void {
    const i = this.oscBuf.indexOf(';');
    const cmd = i < 0 ? this.oscBuf : this.oscBuf.slice(0, i);
    const arg = i < 0 ? '' : this.oscBuf.slice(i + 1);
    if (cmd === '0' || cmd === '2') this.onTitle(arg);
    else if (cmd === '7') {
      const m = /^file:\/\/[^/]*(\/.*)$/.exec(arg);
      if (m) { try { this.onCwd(decodeURIComponent(m[1])); } catch { this.onCwd(m[1]); } }
    }
  }

  // ───────────────────────── CSI ─────────────────────────

  private csiDispatch(final: string, raw: string): void {
    const priv = this.inter.startsWith('?') || this.inter.startsWith('>') || this.inter.startsWith('<') || this.inter.startsWith('=');
    const lead = priv ? this.inter[0] : '';
    const p = raw === '' ? [] : raw.split(';').map((x) => (x === '' ? 0 : parseInt(x, 10) || 0));
    const arg = (i: number, d: number) => (p[i] === undefined || p[i] === 0 ? d : p[i]);
    const n1 = arg(0, 1);
    this.wrapPending = false;
    if (this.inter.endsWith(' ') && final === 'q') return;            // DECSCUSR — styl kursora ustawia konfiguracja
    if (this.inter === '!' && final === 'p') { this.softReset(); return; }
    if (lead === '?' && (final === 'h' || final === 'l')) {
      for (const m of p) this.decMode(m, final === 'h');
      return;
    }
    if (lead === '>' && final === 'c') { this.onResponse('\x1b[>0;276;0c'); return; }
    if (priv) return;
    switch (final) {
      case 'A': this.cy = Math.max(this.cy - n1, this.cy >= this.top ? this.top : 0); break;
      case 'B': this.cy = Math.min(this.cy + n1, this.cy <= this.bottom ? this.bottom : this.rows - 1); break;
      case 'C': case 'a': this.cx = Math.min(this.cx + n1, this.cols - 1); break;
      case 'D': this.cx = Math.max(this.cx - n1, 0); break;
      case 'E': this.cx = 0; this.cy = Math.min(this.cy + n1, this.rows - 1); break;
      case 'F': this.cx = 0; this.cy = Math.max(this.cy - n1, 0); break;
      case 'G': case '`': this.cx = Math.min(arg(0, 1) - 1, this.cols - 1); break;
      case 'H': case 'f': this.moveTo(arg(0, 1) - 1, arg(1, 1) - 1); break;
      case 'd': this.moveTo(arg(0, 1) - 1, this.cx, true); break;
      case 'e': this.cy = Math.min(this.cy + n1, this.rows - 1); break;
      case 'I': this.tab(n1); break;
      case 'Z': this.backTab(n1); break;
      case 'J': this.eraseDisplay(p[0] ?? 0); break;
      case 'K': this.eraseLine(p[0] ?? 0); break;
      case 'L': this.insertLines(n1); break;
      case 'M': this.deleteLines(n1); break;
      case '@': this.insertChars(n1); break;
      case 'P': this.deleteChars(n1); break;
      case 'X': this.eraseChars(n1); break;
      case 'S': this.scrollUp(n1); break;
      case 'T': this.scrollDown(n1); break;
      case 'b': for (let i = 0; i < n1 && this.lastChar; i++) this.print(this.lastChar, this.lastChar.codePointAt(0)!); break;
      case 'g': if ((p[0] ?? 0) === 3) this.tabStops.fill(false); else if ((p[0] ?? 0) === 0) this.tabStops[this.cx] = false; break;
      case 'h': case 'l': for (const m of p) if (m === 4) this.insertMode = final === 'h'; break;
      case 'm': this.sgr(raw); break;
      case 'n':
        if (p[0] === 5) this.onResponse('\x1b[0n');
        else if (p[0] === 6) this.onResponse(`\x1b[${(this.originMode ? this.cy - this.top : this.cy) + 1};${this.cx + 1}R`);
        break;
      case 'c': if ((p[0] ?? 0) === 0) this.onResponse('\x1b[?62;22c'); break;
      case 'r': {
        const t = arg(0, 1) - 1, b = arg(1, this.rows) - 1;
        if (t < b && b < this.rows) { this.top = t; this.bottom = b; this.moveTo(0, 0); }
        break;
      }
      case 's': this.saveCursor(); break;
      case 'u': this.restoreCursor(); break;
      case 't': break;
    }
  }

  private moveTo(row: number, col: number, rowOnly = false): void {
    const base = this.originMode ? this.top : 0;
    const max = this.originMode ? this.bottom : this.rows - 1;
    this.cy = Math.min(Math.max(row + base, base), max);
    if (!rowOnly) this.cx = Math.min(Math.max(col, 0), this.cols - 1);
  }

  private decMode(m: number, on: boolean): void {
    switch (m) {
      case 1: this.appCursorKeys = on; break;
      case 6: this.originMode = on; this.moveTo(0, 0); break;
      case 7: this.autoWrap = on; break;
      case 25: this.cursorVisible = on; break;
      case 47: case 1047: this.setAlt(on, false); break;
      case 1048: if (on) this.saveCursor(); else this.restoreCursor(); break;
      case 1049: this.setAlt(on, true); break;
      case 1000: this.mouse.track = on ? 1000 : 0; break;
      case 1002: this.mouse.track = on ? 1002 : 0; break;
      case 1003: this.mouse.track = on ? 1003 : 0; break;
      case 1006: this.mouse.sgr = on; break;
      case 2004: this.bracketedPaste = on; break;
    }
  }

  private setAlt(on: boolean, saveCursor: boolean): void {
    if (on === this.altScreen) return;
    if (on) {
      this.altSaved = { grid: this.grid, cx: this.cx, cy: this.cy };
      this.grid = Array.from({ length: this.rows }, () => this.blankLine());
      this.altScreen = true;
      if (saveCursor) this.saveCursor();
    } else {
      if (this.altSaved) { this.grid = this.altSaved.grid; if (saveCursor) this.restoreCursor(); else { this.cx = this.altSaved.cx; this.cy = this.altSaved.cy; } }
      this.altSaved = null;
      this.altScreen = false;
    }
    this.top = 0; this.bottom = this.rows - 1;
    this.viewOffset = 0;
  }

  private saveCursor(): void {
    this.saved = { x: this.cx, y: this.cy, fg: this.fg, bg: this.bg, attr: this.attr, wrap: this.wrapPending, g0: this.g0 };
  }
  private restoreCursor(): void {
    this.cx = Math.min(this.saved.x, this.cols - 1);
    this.cy = Math.min(this.saved.y, this.rows - 1);
    this.fg = this.saved.fg; this.bg = this.saved.bg; this.attr = this.saved.attr; this.g0 = this.saved.g0;
    this.wrapPending = false;
  }

  private softReset(): void {
    this.fg = DEFAULT; this.bg = DEFAULT; this.attr = 0;
    this.top = 0; this.bottom = this.rows - 1;
    this.autoWrap = true; this.insertMode = false; this.originMode = false; this.cursorVisible = true; this.appCursorKeys = false;
    this.g0 = 'B';
  }
  reset(): void {
    this.softReset();
    this.bracketedPaste = false;
    this.mouse = { track: 0, sgr: false };
    if (this.altScreen) this.setAlt(false, false);
    this.grid = Array.from({ length: this.rows }, () => this.blankLine());
    this.cx = 0; this.cy = 0; this.resetTabs();
  }

  // ───────────────────────── edycja ─────────────────────────

  private eraseCells(line: Line, from: number, to: number): void {
    for (let i = from; i < to && i < this.cols; i++) line.cells[i] = this.blankCell();
  }
  private eraseDisplay(mode: number): void {
    if (mode === 0) {
      this.eraseCells(this.grid[this.cy], this.cx, this.cols);
      for (let y = this.cy + 1; y < this.rows; y++) this.grid[y] = this.blankLine();
    } else if (mode === 1) {
      for (let y = 0; y < this.cy; y++) this.grid[y] = this.blankLine();
      this.eraseCells(this.grid[this.cy], 0, this.cx + 1);
    } else if (mode === 2) {
      for (let y = 0; y < this.rows; y++) this.grid[y] = this.blankLine();
    } else if (mode === 3) {
      this.scrollback = []; this.viewOffset = 0;
    }
  }
  private eraseLine(mode: number): void {
    const l = this.grid[this.cy];
    if (mode === 0) this.eraseCells(l, this.cx, this.cols);
    else if (mode === 1) this.eraseCells(l, 0, this.cx + 1);
    else this.eraseCells(l, 0, this.cols);
  }
  private insertLines(n: number): void {
    if (this.cy < this.top || this.cy > this.bottom) return;
    const saveTop = this.top; this.top = this.cy;
    this.scrollDown(Math.min(n, this.bottom - this.cy + 1));
    this.top = saveTop; this.cx = 0;
  }
  private deleteLines(n: number): void {
    if (this.cy < this.top || this.cy > this.bottom) return;
    const saveTop = this.top; this.top = this.cy;
    const keepAlt = this.altScreen; this.altScreen = true;      // usunięte wiersze nie trafiają do historii
    this.scrollUp(Math.min(n, this.bottom - this.cy + 1));
    this.altScreen = keepAlt; this.top = saveTop; this.cx = 0;
  }
  private insertChars(n: number): void {
    const c = this.grid[this.cy].cells;
    c.splice(this.cx, 0, ...Array.from({ length: n }, () => this.blankCell()));
    c.length = this.cols;
  }
  private deleteChars(n: number): void {
    const c = this.grid[this.cy].cells;
    c.splice(this.cx, Math.min(n, this.cols - this.cx));
    while (c.length < this.cols) c.push(this.blankCell());
  }
  private eraseChars(n: number): void { this.eraseCells(this.grid[this.cy], this.cx, this.cx + n); }

  // ───────────────────────── SGR ─────────────────────────

  private sgr(raw: string): void {
    // rozdziel po ';' zachowując podparametry z ':' (38:2::r:g:b)
    const parts = raw === '' ? ['0'] : raw.split(';');
    for (let i = 0; i < parts.length; i++) {
      const sub = parts[i].split(':');
      const n = parseInt(sub[0] || '0', 10) || 0;
      if (n === 0) { this.fg = DEFAULT; this.bg = DEFAULT; this.attr = 0; }
      else if (n === 1) this.attr |= A_BOLD;
      else if (n === 2) this.attr |= A_DIM;
      else if (n === 3) this.attr |= A_ITALIC;
      else if (n === 4) this.attr |= A_UNDERLINE;
      else if (n === 5 || n === 6) this.attr |= A_BLINK;
      else if (n === 7) this.attr |= A_INVERSE;
      else if (n === 8) this.attr |= A_HIDDEN;
      else if (n === 9) this.attr |= A_STRIKE;
      else if (n === 21) this.attr |= A_UNDERLINE;
      else if (n === 22) this.attr &= ~(A_BOLD | A_DIM);
      else if (n === 23) this.attr &= ~A_ITALIC;
      else if (n === 24) this.attr &= ~A_UNDERLINE;
      else if (n === 25) this.attr &= ~A_BLINK;
      else if (n === 27) this.attr &= ~A_INVERSE;
      else if (n === 28) this.attr &= ~A_HIDDEN;
      else if (n === 29) this.attr &= ~A_STRIKE;
      else if (n >= 30 && n <= 37) this.fg = n - 30;
      else if (n >= 40 && n <= 47) this.bg = n - 40;
      else if (n >= 90 && n <= 97) this.fg = n - 90 + 8;
      else if (n >= 100 && n <= 107) this.bg = n - 100 + 8;
      else if (n === 39) this.fg = DEFAULT;
      else if (n === 49) this.bg = DEFAULT;
      else if (n === 38 || n === 48) {
        let color = DEFAULT;
        if (sub.length > 1) {                                   // forma z dwukropkami
          const mode = parseInt(sub[1], 10);
          const rest = sub.slice(2).map((x) => parseInt(x || '0', 10) || 0);
          if (mode === 5) color = clamp255(rest[0]);
          else if (mode === 2) { const v = rest.length >= 4 ? rest.slice(1) : rest; color = TRUE + ((clamp255(v[0]) << 16) | (clamp255(v[1]) << 8) | clamp255(v[2])); }
        } else {
          const mode = parseInt(parts[i + 1] ?? '', 10);
          if (mode === 5) { color = clamp255(parseInt(parts[i + 2] ?? '0', 10) || 0); i += 2; }
          else if (mode === 2) {
            const r = parseInt(parts[i + 2] ?? '0', 10) || 0, g = parseInt(parts[i + 3] ?? '0', 10) || 0, b = parseInt(parts[i + 4] ?? '0', 10) || 0;
            color = TRUE + ((clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)); i += 4;
          }
        }
        if (n === 38) this.fg = color; else this.bg = color;
      }
    }
  }

  // ───────────────────────── rozmiar ─────────────────────────

  resize(cols: number, rows: number): void {
    cols = Math.max(2, Math.floor(cols)); rows = Math.max(1, Math.floor(rows));
    if (cols === this.cols && rows === this.rows) return;
    const fix = (g: Line[]) => {
      for (const l of g) {
        if (l.cells.length > cols) l.cells.length = cols;
        while (l.cells.length < cols) l.cells.push({ ch: ' ', fg: DEFAULT, bg: DEFAULT, attr: 0 });
      }
    };
    this.cols = cols;
    // zmniejszanie wysokości: wiersze z góry trafiają do historii, dopóki kursor jest poniżej nowego dołu
    while (this.grid.length > rows) {
      if (this.cy > rows - 1 || this.grid[this.grid.length - 1].cells.every(isBlank) === false) {
        const removed = this.grid.shift()!;
        if (!this.altScreen) { this.scrollback.push(this.pack(removed)); if (this.scrollback.length > this.maxScrollback) this.scrollback.shift(); }
        this.cy = Math.max(0, this.cy - 1);
      } else this.grid.pop();
    }
    fix(this.grid);
    while (this.grid.length < rows) this.grid.push(this.blankLine());
    if (this.altSaved) { fix(this.altSaved.grid); while (this.altSaved.grid.length < rows) this.altSaved.grid.push(this.blankLine()); this.altSaved.grid.length = rows; }
    this.rows = rows;
    this.top = 0; this.bottom = rows - 1;
    this.cx = Math.min(this.cx, cols - 1);
    this.cy = Math.min(this.cy, rows - 1);
    this.wrapPending = false;
    this.resetTabs();
    this.viewOffset = Math.min(this.viewOffset, this.scrollback.length);
    this.version++;
  }

  // ───────────────────────── widok ─────────────────────────

  /** Wiersze widoczne na ekranie (z uwzględnieniem przewinięcia). */
  viewRows(): RowView[] {
    const out: RowView[] = [];
    const off = this.altScreen ? 0 : this.viewOffset;
    const sb = this.scrollback.length;
    for (let i = 0; i < this.rows; i++) {
      const idx = sb - off + i;                // indeks w (scrollback + grid)
      if (idx < sb) out.push(this.scrollback[idx]);
      else {
        const l = this.grid[idx - sb];
        out.push({ runs: lineRuns(l.cells), chars: l.cells.map((c) => c.ch), wrapped: l.wrapped });
      }
    }
    return out;
  }

  /** Cały tekst (historia + ekran) jako wiersze — dla wyszukiwania i kopiowania. */
  allLines(): Array<{ chars: string[]; wrapped: boolean }> {
    const sb = this.altScreen ? [] : this.scrollback.map((l) => ({ chars: l.chars, wrapped: l.wrapped }));
    return sb.concat(this.grid.map((l) => ({ chars: l.cells.map((c) => c.ch), wrapped: l.wrapped })));
  }

  scrollView(delta: number): void {
    if (this.altScreen) return;
    const v = Math.min(Math.max(this.viewOffset + delta, 0), this.scrollback.length);
    if (v !== this.viewOffset) { this.viewOffset = v; this.version++; }
  }
  /** Przewija widok tak, by wiersz `abs` (indeks w allLines()) był widoczny (mniej więcej na środku). */
  revealLine(abs: number): void {
    if (this.altScreen) return;
    const sb = this.scrollback.length;
    const visible = abs >= sb - this.viewOffset && abs < sb - this.viewOffset + this.rows;
    if (visible) return;
    this.viewOffset = Math.min(Math.max(sb - abs + Math.floor(this.rows / 2), 0), sb);
    this.version++;
  }
  scrollToBottom(): void { if (this.viewOffset) { this.viewOffset = 0; this.version++; } }

  /** Tekst ekranu (do testów): wiersze bez końcowych spacji. */
  screenText(): string[] {
    return this.grid.map((l) => l.cells.map((c) => c.ch).join('').replace(/\s+$/, ''));
  }
}

function clamp255(n: number): number { return Math.min(Math.max(n | 0, 0), 255); }
function isBlank(c: Cell): boolean { return c.ch === ' ' && c.bg === DEFAULT; }

/** Seria = kolejne komórki o tym samym stylu; końcowe puste komórki bez tła są pomijane. */
export function lineRuns(cells: Cell[]): Run[] {
  let end = cells.length;
  while (end > 0 && isBlank(cells[end - 1]) && cells[end - 1].attr === 0) end--;
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (let i = 0; i < end; i++) {
    const c = cells[i];
    if (c.ch === '') continue;
    const w = i + 1 < cells.length && cells[i + 1].ch === '' ? 2 : 1;
    if (cur && cur.fg === c.fg && cur.bg === c.bg && cur.attr === c.attr) { cur.text += c.ch; cur.w += w; }
    else { cur = { text: c.ch, fg: c.fg, bg: c.bg, attr: c.attr, col: i, w }; runs.push(cur); }
  }
  return runs;
}
