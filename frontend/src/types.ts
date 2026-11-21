export type CursorStyle = 'block' | 'underline' | 'bar';

export interface TerminalTheme {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  black: string; red: string; green: string; yellow: string; blue: string; magenta: string; cyan: string; white: string;
  brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string; brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string;
}

export interface AppSettings {
  language: string;
  themeName: string;
  opacity: number;          // 0.3 – 1
  blur: number;             // 0 – 40
  fontSize: number;         // 10 – 32
  fontFamily: string;
  padding: number;          // 0 – 50
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  shell: string;
  scrollback: number;
  restoreSession: boolean;
  shortcuts: Record<ShortcutAction, string>;
  customTheme: TerminalTheme | null;
}

export type ShortcutAction =
  | 'newTab' | 'closeTab' | 'copy' | 'paste' | 'search' | 'splitRight' | 'splitDown' | 'closePane'
  | 'nextTab' | 'prevTab' | 'nextPane' | 'prevPane';

/** Drzewo paneli jednej karty. `id` liścia = id sesji PTY w backendzie. */
export type PaneNode = Leaf | Split;
export interface Leaf { kind: 'leaf'; id: number; cwd?: string; env?: Record<string, string> }
export interface Split { kind: 'split'; dir: 'row' | 'col'; ratio: number; a: PaneNode; b: PaneNode }

export interface Tab {
  id: number;
  title: string;            // tytuł z OSC lub domyślny
  customTitle?: string;     // nadany ręcznie (dwuklik)
  root: PaneNode;
  active: number;           // id aktywnego liścia
}

export interface SessionData {
  version: 1;
  activeTab: number;        // indeks
  tabs: Array<{ title?: string; customTitle?: string; root: PaneNode; active: number }>;
}

export interface Toast { id: number; kind: 'error' | 'info' | 'ok'; text: string }
