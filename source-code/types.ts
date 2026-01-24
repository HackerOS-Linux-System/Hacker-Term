export interface Tab {
    id: string;
    title: string;
    active: boolean;
}

export interface TerminalTheme {
    name: string;
    background: string;
    foreground: string;
    cursor: string;
    selection: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
}

export type CursorStyle = 'block' | 'underline' | 'bar';
export type FontFamily = '"Fira Code", monospace' | '"JetBrains Mono", monospace' | '"Hack", monospace' | 'monospace';

export interface AppSettings {
    language: 'pl' | 'en';
    fontSize: number;
    themeName: string;
    // New Settings
    opacity: number;       // 0.0 to 1.0
    blur: number;          // px
    padding: number;       // px
    cursorStyle: CursorStyle;
    cursorBlink: boolean;
    fontFamily: FontFamily;
}

export interface Translations {
    settings: string;
    appearance: string;
    terminal: string;
    about: string;
    language: string;
    theme: string;
    fontSize: string;
    opacity: string;
    blur: string;
    padding: string;
    cursorStyle: string;
    cursorBlink: string;
    fontFamily: string;
    close: string;
    newTab: string;
    ready: string;
    shell: string; // Kept for display purposes
}

export interface FileSystemNode {
    name: string;
    type: 'file' | 'directory';
    content?: string;
    children?: Record<string, FileSystemNode>;
}

export interface ShellState {
    cwd: string[];
    history: string[];
    fileSystem: Record<string, FileSystemNode>;
}

declare global {
    interface Window {
        electronAPI?: {
            minimize: () => void;
            maximize: () => void;
            close: () => void;

            createTerminal: (id: string) => Promise<string>; // Removed shell arg
            onTerminalData: (callback: (id: string, data: string) => void) => void;
            writeTerminal: (id: string, data: string) => void;
            resizeTerminal: (id: string, cols: number, rows: number) => void;
            disposeTerminal: (id: string) => void;
            onTerminalExit: (callback: (id: string) => void) => void;
        };
    }
}
