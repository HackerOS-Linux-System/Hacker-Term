import type { AppSettings, ShortcutAction, TerminalTheme } from './types';

const t = (name: string, o: Omit<TerminalTheme, 'name'>): TerminalTheme => ({ name, ...o });

export const THEMES: Record<string, TerminalTheme> = {
  'Hacker (Default)': t('Hacker', {
    background: '#0a0a0c', foreground: '#CDD6F4', cursor: '#CBA6F7', selection: 'rgba(203,166,247,0.3)',
    black: '#45475A', red: '#F38BA8', green: '#A6E3A1', yellow: '#F9E2AF', blue: '#89B4FA', magenta: '#F5C2E7', cyan: '#94E2D5', white: '#BAC2DE',
    brightBlack: '#585B70', brightRed: '#F38BA8', brightGreen: '#A6E3A1', brightYellow: '#F9E2AF', brightBlue: '#89B4FA', brightMagenta: '#F5C2E7', brightCyan: '#94E2D5', brightWhite: '#A6ADC8',
  }),
  Cyberpunk: t('Cyberpunk', {
    background: '#0b0716', foreground: '#00ff9f', cursor: '#ff003c', selection: 'rgba(255,0,60,0.3)',
    black: '#100b20', red: '#ff003c', green: '#00ff9f', yellow: '#fcee0a', blue: '#00b8ff', magenta: '#d600ff', cyan: '#00fff5', white: '#ffffff',
    brightBlack: '#45475a', brightRed: '#ff4d76', brightGreen: '#50fa7b', brightYellow: '#ffffa5', brightBlue: '#8be9fd', brightMagenta: '#ff79c6', brightCyan: '#8be9fd', brightWhite: '#ffffff',
  }),
  Dracula: t('Dracula', {
    background: '#1e1f29', foreground: '#f8f8f2', cursor: '#bd93f9', selection: 'rgba(68,71,90,0.9)',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  }),
  'Nord Dark': t('Nord Dark', {
    background: '#242933', foreground: '#D8DEE9', cursor: '#88C0D0', selection: 'rgba(136,192,208,0.3)',
    black: '#3B4252', red: '#BF616A', green: '#A3BE8C', yellow: '#EBCB8B', blue: '#81A1C1', magenta: '#B48EAD', cyan: '#88C0D0', white: '#E5E9F0',
    brightBlack: '#4C566A', brightRed: '#BF616A', brightGreen: '#A3BE8C', brightYellow: '#EBCB8B', brightBlue: '#81A1C1', brightMagenta: '#B48EAD', brightCyan: '#8FBCBB', brightWhite: '#ECEFF4',
  }),
  'Tokyo Night': t('Tokyo Night', {
    background: '#1a1b26', foreground: '#a9b1d6', cursor: '#7aa2f7', selection: 'rgba(122,162,247,0.3)',
    black: '#32344a', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#ad8ee6', cyan: '#449dab', white: '#787c99',
    brightBlack: '#444b6a', brightRed: '#ff7a93', brightGreen: '#b9f27c', brightYellow: '#ff9e64', brightBlue: '#7da6ff', brightMagenta: '#bb9af7', brightCyan: '#0db9d7', brightWhite: '#acb0d0',
  }),
};
export const CUSTOM_THEME_NAME = 'Custom';

export const THEME_COLOR_KEYS = [
  'background', 'foreground', 'cursor', 'selection',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const;

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  newTab: 'Ctrl+T', closeTab: 'Ctrl+W', copy: 'Ctrl+Shift+C', paste: 'Ctrl+Shift+V', search: 'Ctrl+Shift+F',
  splitRight: 'Ctrl+Alt+D', splitDown: 'Ctrl+Alt+S', closePane: 'Ctrl+Shift+X',
  nextTab: 'Ctrl+Tab', prevTab: 'Ctrl+Shift+Tab', nextPane: 'Ctrl+Alt+ArrowRight', prevPane: 'Ctrl+Alt+ArrowLeft',
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  themeName: 'Hacker (Default)',
  opacity: 0.97,
  blur: 16,
  fontSize: 14,
  fontFamily: 'DejaVu Sans Mono',
  padding: 12,
  cursorStyle: 'block',
  cursorBlink: true,
  shell: 'zsh',
  scrollback: 5000,
  restoreSession: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  customTheme: null,
};

export const FONT_CHOICES = ['DejaVu Sans Mono', 'Fira Code', 'JetBrains Mono', 'Hack', 'monospace'];

export function resolveTheme(s: AppSettings): TerminalTheme {
  if (s.themeName === CUSTOM_THEME_NAME && s.customTheme) return s.customTheme;
  return THEMES[s.themeName] ?? THEMES['Hacker (Default)'];
}

// ──────────────────────────────────────────────
// .hk (JSON z backendu) ⇄ AppSettings
// ──────────────────────────────────────────────

export type HkRaw = Record<string, Record<string, unknown>>;

const num = (v: unknown, min: number, max: number, d: number) =>
  typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const str = (v: unknown, d: string) => (typeof v === 'string' && v !== '' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function settingsFromHk(raw: HkRaw): AppSettings {
  const d = DEFAULT_SETTINGS;
  const app = raw.appearance ?? {};
  const term = raw.terminal ?? {};
  const adv = raw.advanced ?? {};
  const sc = raw.shortcuts ?? {};
  const ct = raw.custom_theme ?? {};

  const shortcuts = { ...DEFAULT_SHORTCUTS };
  for (const k of Object.keys(shortcuts) as ShortcutAction[]) shortcuts[k] = str(sc[k], shortcuts[k]);

  let customTheme: TerminalTheme | null = null;
  if (Object.keys(ct).length) {
    const base = THEMES['Hacker (Default)'];
    customTheme = { ...base, name: CUSTOM_THEME_NAME };
    for (const k of THEME_COLOR_KEYS) (customTheme as unknown as Record<string, string>)[k] = str(ct[k], base[k]);
  }

  const cs = str(term.cursor_style, d.cursorStyle);
  return {
    language: str(app.language, d.language),
    themeName: str(app.theme, d.themeName),
    opacity: num(app.opacity, 0.3, 1, d.opacity),
    blur: num(app.blur, 0, 40, d.blur),
    fontSize: Math.round(num(term.font_size, 10, 32, d.fontSize)),
    fontFamily: str(term.font_family, d.fontFamily),
    padding: Math.round(num(term.padding, 0, 50, d.padding)),
    cursorStyle: cs === 'bar' || cs === 'underline' ? cs : 'block',
    cursorBlink: bool(term.cursor_blink, d.cursorBlink),
    shell: str(term.shell, d.shell),
    scrollback: Math.round(num(term.scrollback, 0, 100000, d.scrollback)),
    restoreSession: bool(adv.restore_session, d.restoreSession),
    shortcuts,
    customTheme,
  };
}

export function settingsToHk(s: AppSettings): HkRaw {
  const out: HkRaw = {
    appearance: { theme: s.themeName, opacity: s.opacity, blur: s.blur, language: s.language },
    terminal: {
      font_size: s.fontSize, font_family: s.fontFamily, padding: s.padding, cursor_style: s.cursorStyle,
      cursor_blink: s.cursorBlink, shell: s.shell, scrollback: s.scrollback,
    },
    advanced: { restore_session: s.restoreSession },
    shortcuts: { ...s.shortcuts },
  };
  if (s.customTheme) {
    const ct: Record<string, string> = {};
    for (const k of THEME_COLOR_KEYS) ct[k] = s.customTheme[k];
    out.custom_theme = ct;
  }
  return out;
}

export const cssFont = (family: string) => (family === 'monospace' ? 'monospace' : `"${family}", monospace`);
