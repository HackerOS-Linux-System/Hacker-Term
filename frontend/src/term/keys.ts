export interface KeyLike { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }

const CSI_LETTER: Record<string, string> = { ArrowUp: 'A', ArrowDown: 'B', ArrowRight: 'C', ArrowLeft: 'D', Home: 'H', End: 'F' };
const CSI_TILDE: Record<string, number> = { Insert: 2, Delete: 3, PageUp: 5, PageDown: 6 };
const FKEY_SS3: Record<string, string> = { F1: 'P', F2: 'Q', F3: 'R', F4: 'S' };
const FKEY_TILDE: Record<string, number> = { F5: 15, F6: 17, F7: 18, F8: 19, F9: 20, F10: 21, F11: 23, F12: 24 };

export function encodeKey(e: KeyLike, appCursorKeys: boolean): string | null {
  const mod = 1 + (e.shiftKey ? 1 : 0) + (e.altKey ? 2 : 0) + (e.ctrlKey ? 4 : 0) + (e.metaKey ? 8 : 0);
  const k = e.key;

  if (CSI_LETTER[k]) {
    const l = CSI_LETTER[k];
    if (mod > 1) return `\x1b[1;${mod}${l}`;
    return appCursorKeys ? `\x1bO${l}` : `\x1b[${l}`;
  }
  if (CSI_TILDE[k]) return mod > 1 ? `\x1b[${CSI_TILDE[k]};${mod}~` : `\x1b[${CSI_TILDE[k]}~`;
  if (FKEY_SS3[k]) return mod > 1 ? `\x1b[1;${mod}${FKEY_SS3[k]}` : `\x1bO${FKEY_SS3[k]}`;
  if (FKEY_TILDE[k]) return mod > 1 ? `\x1b[${FKEY_TILDE[k]};${mod}~` : `\x1b[${FKEY_TILDE[k]}~`;

  switch (k) {
    case 'Enter': return e.altKey ? '\x1b\r' : '\r';
    case 'Backspace': return e.ctrlKey ? '\x08' : e.altKey ? '\x1b\x7f' : '\x7f';
    case 'Tab': return e.shiftKey ? '\x1b[Z' : e.altKey ? '\x1b\t' : '\t';
    case 'Escape': return '\x1b';
  }

  if (k.length === 1) {
    const c = k.toLowerCase();
    if (e.ctrlKey && !e.metaKey) {
      if (c >= 'a' && c <= 'z') return (e.altKey ? '\x1b' : '') + String.fromCharCode(c.charCodeAt(0) - 96);
      const map: Record<string, number> = { '@': 0, ' ': 0, '2': 0, '[': 27, '3': 27, '\\': 28, '4': 28, ']': 29, '5': 29, '^': 30, '6': 30, _: 31, '/': 31, '7': 31, '-': 31 };
      if (map[c] !== undefined) return String.fromCharCode(map[c]);
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) return '\x1b' + (e.shiftKey && c >= 'a' && c <= 'z' ? c.toUpperCase() : k);
  }
  return null;   // zwykły znak: obsłuży pole wejściowe
}

/** Raport myszy (xterm): SGR (1006) albo klasyczny X10. button: 0 lewy, 1 środek, 2 prawy, 64/65 kółko; release = zwolnienie. */
export function mouseReport(button: number, col: number, row: number, release: boolean, sgr: boolean, mods = 0): string {
  const b = button + mods;
  if (sgr) return `\x1b[<${b};${col + 1};${row + 1}${release ? 'm' : 'M'}`;
  const cb = release ? 3 + mods : b;
  return `\x1b[M${String.fromCharCode(32 + cb)}${String.fromCharCode(32 + Math.min(col + 1, 223))}${String.fromCharCode(32 + Math.min(row + 1, 223))}`;
}
