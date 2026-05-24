export interface Tab {
  id: string
  title: string
  active: boolean
}

export interface TerminalTheme {
  name: string
  background: string
  foreground: string
  cursor: string
  selection: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export type CursorStyle = 'block' | 'underline' | 'bar'

export type FontFamily =
  | '"Fira Code", monospace'
  | '"JetBrains Mono", monospace'
  | '"Hack", monospace'
  | 'monospace'

export interface AppSettings {
  language: 'pl' | 'en'
  fontSize: number
  themeName: string
  opacity: number
  blur: number
  padding: number
  cursorStyle: CursorStyle
  cursorBlink: boolean
  fontFamily: FontFamily
}

export interface Translations {
  settings: string
  appearance: string
  terminal: string
  about: string
  language: string
  theme: string
  fontSize: string
  opacity: string
  blur: string
  padding: string
  cursorStyle: string
  cursorBlink: string
  fontFamily: string
  close: string
  newTab: string
  ready: string
  shell: string
  shortcuts: string
  configFile: string
}
