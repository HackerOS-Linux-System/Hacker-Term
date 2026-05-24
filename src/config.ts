import { AppSettings, TerminalTheme, Translations } from './types'

export const THEMES: Record<string, TerminalTheme> = {
  'Hacker (Default)': {
    name: 'Hacker',
    background: '#00000000',
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
    brightWhite: '#A6ADC8',
  },
  Cyberpunk: {
    name: 'Cyberpunk',
    background: '#00000000',
    foreground: '#00ff9f',
    cursor: '#ff003c',
    selection: 'rgba(255, 0, 60, 0.3)',
    black: '#100b20',
    red: '#ff003c',
    green: '#00ff9f',
    yellow: '#fcee0a',
    blue: '#00b8ff',
    magenta: '#d600ff',
    cyan: '#00fff5',
    white: '#ffffff',
    brightBlack: '#45475a',
    brightRed: '#ff4d76',
    brightGreen: '#50fa7b',
    brightYellow: '#ffffa5',
    brightBlue: '#8be9fd',
    brightMagenta: '#ff79c6',
    brightCyan: '#8be9fd',
    brightWhite: '#ffffff',
  },
  Dracula: {
    name: 'Dracula',
    background: '#00000000',
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
    brightWhite: '#ffffff',
  },
  'Nord Dark': {
    name: 'Nord Dark',
    background: '#00000000',
    foreground: '#D8DEE9',
    cursor: '#88C0D0',
    selection: 'rgba(136, 192, 208, 0.3)',
    black: '#3B4252',
    red: '#BF616A',
    green: '#A3BE8C',
    yellow: '#EBCB8B',
    blue: '#81A1C1',
    magenta: '#B48EAD',
    cyan: '#88C0D0',
    white: '#E5E9F0',
    brightBlack: '#4C566A',
    brightRed: '#BF616A',
    brightGreen: '#A3BE8C',
    brightYellow: '#EBCB8B',
    brightBlue: '#81A1C1',
    brightMagenta: '#B48EAD',
    brightCyan: '#8FBCBB',
    brightWhite: '#ECEFF4',
  },
  'Tokyo Night': {
    name: 'Tokyo Night',
    background: '#00000000',
    foreground: '#a9b1d6',
    cursor: '#7aa2f7',
    selection: 'rgba(122, 162, 247, 0.3)',
    black: '#32344a',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#ad8ee6',
    cyan: '#449dab',
    white: '#787c99',
    brightBlack: '#444b6a',
    brightRed: '#ff7a93',
    brightGreen: '#b9f27c',
    brightYellow: '#ff9e64',
    brightBlue: '#7da6ff',
    brightMagenta: '#bb9af7',
    brightCyan: '#0db9d7',
    brightWhite: '#acb0d0',
  },
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  fontSize: 14,
  themeName: 'Hacker (Default)',
  opacity: 0.97,
  blur: 16,
  padding: 20,
  cursorStyle: 'block',
  cursorBlink: true,
  fontFamily: '"Fira Code", monospace',
}

export const TRANSLATIONS: Record<string, Translations> = {
  pl: {
    settings: 'Ustawienia',
    appearance: 'Wygląd',
    terminal: 'Terminal',
    about: 'O programie',
    language: 'Język',
    shell: 'Powłoka',
    theme: 'Motyw Kolorystyczny',
    fontSize: 'Rozmiar czcionki',
    opacity: 'Przezroczystość',
    blur: 'Rozmycie tła',
    padding: 'Marginesy',
    cursorStyle: 'Styl kursora',
    cursorBlink: 'Mruganie kursora',
    fontFamily: 'Rodzina czcionek',
    close: 'Zamknij',
    newTab: 'Nowa karta',
    ready: 'Gotowy',
    shortcuts: 'Skróty klawiszowe',
    configFile: 'Plik konfiguracyjny',
  },
  en: {
    settings: 'Settings',
    appearance: 'Appearance',
    terminal: 'Terminal',
    about: 'About',
    language: 'Language',
    shell: 'Shell',
    theme: 'Color Theme',
    fontSize: 'Font Size',
    opacity: 'Window Opacity',
    blur: 'Background Blur',
    padding: 'Terminal Padding',
    cursorStyle: 'Cursor Style',
    cursorBlink: 'Cursor Blink',
    fontFamily: 'Font Family',
    close: 'Close',
    newTab: 'New Tab',
    ready: 'Ready',
    shortcuts: 'Keyboard Shortcuts',
    configFile: 'Config File',
  },
}

// ──────────────────────────────────────────────
// Map .hk config values → AppSettings
// ──────────────────────────────────────────────

type HkRaw = Record<string, Record<string, unknown>>

export function settingsFromHk(raw: HkRaw): AppSettings {
  const s = { ...DEFAULT_SETTINGS }

  const app = raw['appearance'] ?? {}
  const term = raw['terminal'] ?? {}

  if (typeof app['theme'] === 'string') s.themeName = app['theme']
  if (typeof app['opacity'] === 'number') s.opacity = app['opacity']
  if (typeof app['blur'] === 'number') s.blur = app['blur']
  if (typeof app['language'] === 'string') s.language = app['language'] as 'pl' | 'en'

  if (typeof term['font_size'] === 'number') s.fontSize = term['font_size']
  if (typeof term['padding'] === 'number') s.padding = term['padding']
  if (typeof term['cursor_blink'] === 'boolean') s.cursorBlink = term['cursor_blink']
  if (typeof term['cursor_style'] === 'string')
    s.cursorStyle = term['cursor_style'] as AppSettings['cursorStyle']

  if (typeof term['font_family'] === 'string') {
    const ff = term['font_family'] as string
    const map: Record<string, AppSettings['fontFamily']> = {
      'Fira Code': '"Fira Code", monospace',
      'JetBrains Mono': '"JetBrains Mono", monospace',
      Hack: '"Hack", monospace',
      monospace: 'monospace',
    }
    s.fontFamily = map[ff] ?? '"Fira Code", monospace'
  }

  return s
}

export function settingsToHk(s: AppSettings): HkRaw {
  const ffMap: Record<string, string> = {
    '"Fira Code", monospace': 'Fira Code',
    '"JetBrains Mono", monospace': 'JetBrains Mono',
    '"Hack", monospace': 'Hack',
    monospace: 'monospace',
  }

  return {
    appearance: {
      theme: s.themeName,
      opacity: s.opacity,
      blur: s.blur,
      language: s.language,
    },
    terminal: {
      font_size: s.fontSize,
      font_family: ffMap[s.fontFamily] ?? 'Fira Code',
      padding: s.padding,
      cursor_style: s.cursorStyle,
      cursor_blink: s.cursorBlink,
      shell: 'zsh',
    },
  }
}
