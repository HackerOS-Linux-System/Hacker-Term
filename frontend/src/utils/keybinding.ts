export interface Combo { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string }
export interface KeyEventLike { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }

const ALIASES: Record<string, string> = { esc: 'escape', del: 'delete', return: 'enter', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', space: ' ' };

export function parseCombo(s: string): Combo | null {
  const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const c: Combo = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === 'ctrl' || l === 'control') c.ctrl = true;
    else if (l === 'shift') c.shift = true;
    else if (l === 'alt' || l === 'option') c.alt = true;
    else if (l === 'meta' || l === 'super' || l === 'cmd') c.meta = true;
    else c.key = ALIASES[l] ?? l;
  }
  return c.key ? c : null;
}

export function matches(e: KeyEventLike, combo: string): boolean {
  const c = parseCombo(combo);
  if (!c) return false;
  return e.ctrlKey === c.ctrl && e.shiftKey === c.shift && e.altKey === c.alt && e.metaKey === c.meta && e.key.toLowerCase() === c.key;
}

const PRETTY: Record<string, string> = { ' ': 'Space' };

/** Zdarzenie → zapis „Ctrl+Shift+T” (do przypisywania skrótów w ustawieniach). null = sam modyfikator. */
export function formatEvent(e: KeyEventLike): string | null {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta', 'Unidentified'].includes(k)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  parts.push(PRETTY[k] ?? (k.length === 1 ? k.toUpperCase() : k));
  return parts.join('+');
}
