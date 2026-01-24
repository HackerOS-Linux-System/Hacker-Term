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

export interface AppSettings {
    language: 'pl' | 'en';
    shell: string;
    fontSize: number;
    themeName: string;
}

export interface Translations {
    settings: string;
    language: string;
    shell: string;
    theme: string;
    fontSize: string;
    close: string;
    newTab: string;
    ready: string;
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

            // Updated to accept custom shell
            createTerminal: (id: string, shell?: string) => Promise<string>;
            onTerminalData: (callback: (id: string, data: string) => void) => void;
            writeTerminal: (id: string, data: string) => void;
            resizeTerminal: (id: string, cols: number, rows: number) => void;
            disposeTerminal: (id: string) => void;
            onTerminalExit: (callback: (id: string) => void) => void;
        };
    }
}
