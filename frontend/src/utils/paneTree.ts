import type { Leaf, PaneNode, Split } from '../types';

export const leaves = (n: PaneNode): Leaf[] => (n.kind === 'leaf' ? [n] : [...leaves(n.a), ...leaves(n.b)]);

export const findLeaf = (n: PaneNode, id: number): Leaf | undefined => leaves(n).find((l) => l.id === id);

/** Zastępuje liść `id` podziałem (stary liść po lewej/na górze, nowy po prawej/na dole). */
export function splitLeaf(n: PaneNode, id: number, dir: Split['dir'], fresh: Leaf): PaneNode {
  if (n.kind === 'leaf') return n.id === id ? { kind: 'split', dir, ratio: 0.5, a: n, b: fresh } : n;
  return { ...n, a: splitLeaf(n.a, id, dir, fresh), b: splitLeaf(n.b, id, dir, fresh) };
}

/** Usuwa liść; rodzeństwo zajmuje jego miejsce. Zwraca null, gdy nie zostało nic. */
export function removeLeaf(n: PaneNode, id: number): PaneNode | null {
  if (n.kind === 'leaf') return n.id === id ? null : n;
  const a = removeLeaf(n.a, id);
  const b = removeLeaf(n.b, id);
  if (!a) return b;
  if (!b) return a;
  return { ...n, a, b };
}

/** Ustawia proporcję podziału wskazanego ścieżką ('a'|'b'…). */
export function setRatio(n: PaneNode, path: Array<'a' | 'b'>, ratio: number): PaneNode {
  if (n.kind === 'leaf') return n;
  const r = Math.min(0.9, Math.max(0.1, ratio));
  if (path.length === 0) return { ...n, ratio: r };
  const [h, ...rest] = path;
  return { ...n, [h]: setRatio(n[h], rest, ratio) } as Split;
}

/** Następny/poprzedni liść względem `id` (cyklicznie). */
export function cycleLeaf(n: PaneNode, id: number, step: 1 | -1): number {
  const ls = leaves(n);
  const i = ls.findIndex((l) => l.id === id);
  return ls[(i + step + ls.length) % ls.length].id;
}

/** Głęboka kopia z nowymi id liści (dla duplikowania karty / przywracania sesji). */
export function cloneWithNewIds(n: PaneNode, next: () => number): PaneNode {
  if (n.kind === 'leaf') return { kind: 'leaf', id: next(), cwd: n.cwd, env: n.env };
  return { ...n, a: cloneWithNewIds(n.a, next), b: cloneWithNewIds(n.b, next) };
}

/** Odtwarza mapę stare id → nowe id po cloneWithNewIds (liście w tej samej kolejności). */
export function idMap(oldRoot: PaneNode, newRoot: PaneNode): Map<number, number> {
  const a = leaves(oldRoot), b = leaves(newRoot);
  return new Map(a.map((l, i) => [l.id, b[i].id]));
}

/** Waliduje drzewo wczytane z session.json. */
export function sanitize(n: unknown, depth = 0): PaneNode | null {
  if (!n || typeof n !== 'object' || depth > 16) return null;
  const o = n as Record<string, unknown>;
  if (o.kind === 'leaf') {
    const env: Record<string, string> = {};
    if (o.env && typeof o.env === 'object') for (const [k, v] of Object.entries(o.env as object)) if (typeof v === 'string') env[k] = v;
    return { kind: 'leaf', id: typeof o.id === 'number' ? o.id : 0, cwd: typeof o.cwd === 'string' && o.cwd ? o.cwd : undefined, env: Object.keys(env).length ? env : undefined };
  }
  if (o.kind === 'split') {
    const a = sanitize(o.a, depth + 1), b = sanitize(o.b, depth + 1);
    if (!a || !b) return a ?? b;
    const ratio = typeof o.ratio === 'number' ? Math.min(0.9, Math.max(0.1, o.ratio)) : 0.5;
    return { kind: 'split', dir: o.dir === 'col' ? 'col' : 'row', ratio, a, b };
  }
  return null;
}

// ── układ: panele są renderowane płasko (żeby przebudowa drzewa nie zrywała sesji PTY), a ich prostokąty liczy ta funkcja ──
export interface Rect { x: number; y: number; w: number; h: number }          // ułamki 0..1 obszaru karty
export interface Divider { path: Array<'a' | 'b'>; dir: 'row' | 'col'; rect: Rect; parent: Rect }
export interface Layout { panes: Map<number, Rect>; dividers: Divider[] }

export function computeLayout(root: PaneNode, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }): Layout {
  const out: Layout = { panes: new Map(), dividers: [] };
  const walk = (n: PaneNode, r: Rect, path: Array<'a' | 'b'>) => {
    if (n.kind === 'leaf') { out.panes.set(n.id, r); return; }
    if (n.dir === 'row') {
      const wa = r.w * n.ratio;
      walk(n.a, { x: r.x, y: r.y, w: wa, h: r.h }, [...path, 'a']);
      walk(n.b, { x: r.x + wa, y: r.y, w: r.w - wa, h: r.h }, [...path, 'b']);
      out.dividers.push({ path, dir: 'row', rect: { x: r.x + wa, y: r.y, w: 0, h: r.h }, parent: r });
    } else {
      const ha = r.h * n.ratio;
      walk(n.a, { x: r.x, y: r.y, w: r.w, h: ha }, [...path, 'a']);
      walk(n.b, { x: r.x, y: r.y + ha, w: r.w, h: r.h - ha }, [...path, 'b']);
      out.dividers.push({ path, dir: 'col', rect: { x: r.x, y: r.y + ha, w: r.w, h: 0 }, parent: r });
    }
  };
  walk(root, rect, []);
  return out;
}
