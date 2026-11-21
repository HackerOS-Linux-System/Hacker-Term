import type { TerminalTheme } from '../types';
import { A_BOLD, A_DIM, A_HIDDEN, A_INVERSE, A_ITALIC, A_STRIKE, A_UNDERLINE, TRUE, type Run } from './emulator';

const CUBE = [0, 95, 135, 175, 215, 255];
const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export function paletteColor(i: number, t: TerminalTheme): string {
  if (i < 16) {
    return [t.black, t.red, t.green, t.yellow, t.blue, t.magenta, t.cyan, t.white,
      t.brightBlack, t.brightRed, t.brightGreen, t.brightYellow, t.brightBlue, t.brightMagenta, t.brightCyan, t.brightWhite][i];
  }
  if (i < 232) { const n = i - 16; return `#${hex2(CUBE[(n / 36) | 0])}${hex2(CUBE[((n / 6) | 0) % 6])}${hex2(CUBE[n % 6])}`; }
  const g = 8 + (i - 232) * 10;
  return `#${hex2(g)}${hex2(g)}${hex2(g)}`;
}

/** -1 → undefined (kolor domyślny), paleta, truecolor */
export function colorCss(c: number, t: TerminalTheme): string | undefined {
  if (c < 0) return undefined;
  if (c >= TRUE) return `#${(c - TRUE).toString(16).padStart(6, '0')}`;
  return paletteColor(c, t);
}

export interface RunStyle { css: string }

/** Styl inline serii: pozycja (kolumna × szerokość komórki), kolory, atrybuty. */
export function runStyle(r: Run, t: TerminalTheme, cw: number): string {
  let fg = colorCss(r.fg, t);
  let bg = colorCss(r.bg, t);
  if (r.attr & A_BOLD && r.fg >= 0 && r.fg < 8) fg = paletteColor(r.fg + 8, t);
  if (r.attr & A_INVERSE) { const f = fg ?? t.foreground; fg = bg ?? t.background; bg = f; }
  if (r.attr & A_HIDDEN) fg = bg ?? t.background;
  let css = `left:${(r.col * cw).toFixed(2)}px;`;
  if (fg) css += `color:${fg};`;
  if (bg) css += `background:${bg};width:${(r.w * cw).toFixed(2)}px;`;
  if (r.attr & A_BOLD) css += 'font-weight:bold;';
  if (r.attr & A_ITALIC) css += 'font-style:italic;';
  if (r.attr & A_DIM) css += 'opacity:0.6;';
  const deco = [r.attr & A_UNDERLINE ? 'underline' : '', r.attr & A_STRIKE ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) css += `text-decoration:${deco};`;
  return css;
}

/** Dzieli tekst na odcinki zwykłe i ikonowe (Private Use Area → czcionka Symbols Nerd Font Mono). */
const PUA = /([\uE000-\uF8FF\u{F0000}-\u{FFFFD}]+)/u;
export function glyphSegs(text: string): { t: string; nf: boolean }[] {
  if (!PUA.test(text)) return [{ t: text, nf: false }];
  return text.split(PUA).filter((t) => t !== '').map((t) => ({ t, nf: PUA.test(t) }));
}
