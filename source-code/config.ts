import { TerminalTheme, Translations } from './types';

export const THEMES: Record<string, TerminalTheme> = {
    'Hacker (Default)': {
        name: 'Hacker',
        background: '#0a0a0c00', // Fully transparent for glass effect
        foreground: '#CDD6F4',
            cursor: '#CBA6F7',
            selection: 'rgba(203, 166, 247, 0.3)',
            black: '#45475A',
            red: '#F38BA8',
            green: '#A6E3A1',
            yellow: '#F9E2AF',
            blue: '#89B4FA',
            magenta: '#F5C2E7',
            cyan: '#94E2D5',
            white: '#BAC2DE',
            brightBlack: '#585B70',
            brightRed: '#F38BA8',
            brightGreen: '#A6E3A1',
            brightYellow: '#F9E2AF',
            brightBlue: '#89B4FA',
            brightMagenta: '#F5C2E7',
            brightCyan: '#94E2D5',
            brightWhite: '#A6ADC8'
    },
    'Dracula': {
        name: 'Dracula',
        background: '#282a3600',
        foreground: '#f8f8f2',
            cursor: '#bd93f9',
            selection: '#44475a',
            black: '#21222c',
            red: '#ff5555',
            green: '#50fa7b',
            yellow: '#f1fa8c',
            blue: '#bd93f9',
            magenta: '#ff79c6',
            cyan: '#8be9fd',
            white: '#f8f8f2',
            brightBlack: '#6272a4',
            brightRed: '#ff6e6e',
            brightGreen: '#69ff94',
            brightYellow: '#ffffa5',
            brightBlue: '#d6acff',
            brightMagenta: '#ff92df',
            brightCyan: '#a4ffff',
            brightWhite: '#ffffff'
    },
    'Solarized Dark': {
        name: 'Solarized Dark',
        background: '#002b3600',
        foreground: '#839496',
            cursor: '#93a1a1',
            selection: '#073642',
            black: '#073642',
            red: '#dc322f',
            green: '#859900',
            yellow: '#b58900',
            blue: '#268bd2',
            magenta: '#d33682',
            cyan: '#2aa198',
            white: '#eee8d5',
            brightBlack: '#002b36',
            brightRed: '#cb4b16',
            brightGreen: '#586e75',
            brightYellow: '#657b83',
            brightBlue: '#839496',
            brightMagenta: '#6c71c4',
            brightCyan: '#93a1a1',
            brightWhite: '#fdf6e3'
    }
};

export const TRANSLATIONS: Record<string, Translations> = {
    pl: {
        settings: 'Ustawienia',
        language: 'Język',
        shell: 'Powłoka (Shell)',
        theme: 'Motyw',
        fontSize: 'Rozmiar czcionki',
        close: 'Zamknij',
        newTab: 'Nowa karta',
        ready: 'Gotowy'
    },
    en: {
        settings: 'Settings',
        language: 'Language',
        shell: 'Shell Path',
        theme: 'Theme',
        fontSize: 'Font Size',
        close: 'Close',
        newTab: 'New Tab',
        ready: 'Ready'
    }
};
