import type { LocaleModule } from './locale';

export const en = {
  settings: 'Settings', appearance: 'Appearance', terminal: 'Terminal', shortcuts: 'Shortcuts', about: 'About',
  language: 'Language', theme: 'Color Theme', customTheme: 'Custom theme', editTheme: 'Edit colors', resetTheme: 'Reset',
  opacity: 'Window Opacity', blur: 'Background Blur', fontSize: 'Font Size', fontFamily: 'Font Family',
  padding: 'Terminal Padding', cursorStyle: 'Cursor Style', cursorBlink: 'Cursor Blink', shell: 'Shell',
  scrollback: 'Scrollback lines', restoreSession: 'Restore tabs on startup', configFile: 'Config file', resetKey: 'Reset',
  pressKeys: 'Press keys…', shortcutsHint: 'Click a shortcut, then press the new key combination. Esc cancels.',
  newTab: 'New tab', newTabHere: 'New tab with options…', closeTab: 'Close tab', closeOthers: 'Close other tabs',
  duplicateTab: 'Duplicate tab', renameTab: 'Rename tab', copy: 'Copy', paste: 'Paste', search: 'Search',
  splitRight: 'Split right', splitDown: 'Split down', closePane: 'Close pane', nextTab: 'Next tab', prevTab: 'Previous tab',
  nextPane: 'Next pane', prevPane: 'Previous pane',
  workingDir: 'Working directory', envVars: 'Environment variables (KEY=VALUE per line)', open: 'Open', cancel: 'Cancel',
  ready: 'Ready', searchPlaceholder: 'Search in terminal…', noMatches: 'No matches', matches: 'matches',
  errConfigLoad: 'Could not load config', errConfigSave: 'Could not save config', errSession: 'Could not save session',
  errTerminal: 'Terminal error', errClipboard: 'Clipboard unavailable', copied: 'Copied to clipboard',
  aboutText: 'A terminal emulator for HackerOS. Backend in H#, window and rendering by Silver, UI in TypeScript + Solid.js.',
  close: 'Close', minimize: 'Minimize', maximize: 'Maximize',
};

const locale: LocaleModule = { code: 'en', name: 'English', flag: '🇬🇧', translations: en };
export default locale;
