export interface Match { line: number; col: number; len: number }

/** Szuka `query` w wierszach (tablice komórek). Kolumny odpowiadają komórkom, nie punktom kodowym. */
export function findAll(lines: Array<{ chars: string[] }>, query: string, caseSensitive = false): Match[] {
  if (!query) return [];
  const q = caseSensitive ? query : query.toLowerCase();
  const out: Match[] = [];
  for (let li = 0; li < lines.length; li++) {
    const chars = lines[li].chars;
    let text = '';
    const start: number[] = [];                     // indeks w `text` → numer komórki
    for (let c = 0; c < chars.length; c++) {
      if (chars[c] === '') continue;                // druga połowa znaku szerokiego
      for (let k = 0; k < chars[c].length; k++) start.push(c);
      text += chars[c];
    }
    const hay = caseSensitive ? text : text.toLowerCase();
    let from = 0;
    for (;;) {
      const i = hay.indexOf(q, from);
      if (i < 0) break;
      const c0 = start[i];
      const c1 = start[Math.min(i + q.length - 1, start.length - 1)];
      out.push({ line: li, col: c0, len: Math.max(1, c1 - c0 + 1) });
      from = i + Math.max(1, q.length);
    }
  }
  return out;
}

/** Tekst z zaznaczenia (wiersze absolutne, kolumny włącznie) — zawinięte wiersze są łączone bez nowej linii. */
export function selectionText(lines: Array<{ chars: string[]; wrapped: boolean }>, a: { r: number; c: number }, b: { r: number; c: number }): string {
  let [s, e] = a.r < b.r || (a.r === b.r && a.c <= b.c) ? [a, b] : [b, a];
  s = { r: Math.max(0, s.r), c: s.c }; e = { r: Math.min(lines.length - 1, e.r), c: e.c };
  let out = '';
  for (let r = s.r; r <= e.r; r++) {
    const chars = lines[r].chars;
    const from = r === s.r ? s.c : 0;
    const to = r === e.r ? e.c + 1 : chars.length;
    let seg = chars.slice(from, to).join('');
    const continues = r !== e.r && lines[r].wrapped;      // zawinięty wiersz: spacje na końcu są treścią
    if (!continues) seg = seg.replace(/\s+$/, '');
    out += seg;
    if (r !== e.r && !lines[r].wrapped) out += '\n';
  }
  return out;
}

/** Granice słowa wokół kolumny (dla dwukliku). */
export function wordAt(chars: string[], col: number): [number, number] {
  const isWord = (ch: string) => ch !== '' && /[\p{L}\p{N}_\-./~@%+]/u.test(ch);
  if (!isWord(chars[col] ?? ' ')) return [col, col];
  let a = col, b = col;
  while (a > 0 && isWord(chars[a - 1])) a--;
  while (b < chars.length - 1 && isWord(chars[b + 1])) b++;
  return [a, b];
}
