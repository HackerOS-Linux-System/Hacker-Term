import test from 'node:test';
import assert from 'node:assert/strict';
import { leaves, splitLeaf, removeLeaf, setRatio, cycleLeaf, cloneWithNewIds, sanitize } from '../src/utils/paneTree';
import { matches, formatEvent, parseCombo } from '../src/utils/keybinding';
import { settingsFromHk, settingsToHk, DEFAULT_SETTINGS, resolveTheme, CUSTOM_THEME_NAME } from '../src/config';
import { LOCALES, translationsFor } from '../src/locales';
import type { PaneNode } from '../src/types';

const L = (id: number): PaneNode => ({ kind: 'leaf', id });

test('drzewo paneli: podział, usuwanie, cykl', () => {
  let t: PaneNode = L(1);
  t = splitLeaf(t, 1, 'row', { kind: 'leaf', id: 2 });
  t = splitLeaf(t, 2, 'col', { kind: 'leaf', id: 3 });
  assert.deepEqual(leaves(t).map((l) => l.id), [1, 2, 3]);
  assert.equal(cycleLeaf(t, 3, 1), 1);
  assert.equal(cycleLeaf(t, 1, -1), 3);
  const r = removeLeaf(t, 2)!;
  assert.deepEqual(leaves(r).map((l) => l.id), [1, 3]);
  assert.equal(r.kind, 'split');
  assert.equal(removeLeaf(L(1), 1), null);
  const s = setRatio(t, ['b'], 0.95) as any;
  assert.equal(s.b.ratio, 0.9);
});

test('klonowanie i sanityzacja sesji', () => {
  let n = 100;
  const t = splitLeaf(L(1), 1, 'row', { kind: 'leaf', id: 2, cwd: '/tmp', env: { A: 'b' } });
  const c = cloneWithNewIds(t, () => ++n);
  assert.deepEqual(leaves(c).map((l) => l.id), [101, 102]);
  assert.equal(leaves(c)[1].cwd, '/tmp');
  assert.equal(sanitize({ kind: 'nonsens' }), null);
  const s = sanitize({ kind: 'split', dir: 'x', ratio: 5, a: { kind: 'leaf', cwd: 7 }, b: { kind: 'leaf', env: { Z: 1, Y: 'ok' } } }) as any;
  assert.equal(s.dir, 'row'); assert.equal(s.ratio, 0.9); assert.equal(s.a.cwd, undefined); assert.deepEqual(s.b.env, { Y: 'ok' });
});

test('skróty klawiszowe', () => {
  const ev = (key: string, o: any = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...o });
  assert.ok(matches(ev('t', { ctrlKey: true }), 'Ctrl+T'));
  assert.ok(!matches(ev('t', { ctrlKey: true, shiftKey: true }), 'Ctrl+T'));
  assert.ok(matches(ev('Tab', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Tab'));
  assert.ok(matches(ev('ArrowRight', { ctrlKey: true, altKey: true }), 'Ctrl+Alt+ArrowRight'));
  assert.equal(formatEvent(ev('d', { ctrlKey: true, altKey: true })), 'Ctrl+Alt+D');
  assert.equal(formatEvent(ev('Control', { ctrlKey: true })), null);
  assert.equal(parseCombo(''), null);
});

test('konfiguracja .hk ⇄ ustawienia', () => {
  const s = settingsFromHk({ appearance: { theme: 'Nord Dark', opacity: 5, language: 'pl' }, terminal: { font_size: 18, cursor_style: 'bar', cursor_blink: false }, shortcuts: { newTab: 'Ctrl+N' } });
  assert.equal(s.themeName, 'Nord Dark'); assert.equal(s.opacity, 1); assert.equal(s.language, 'pl');
  assert.equal(s.fontSize, 18); assert.equal(s.cursorStyle, 'bar'); assert.equal(s.cursorBlink, false);
  assert.equal(s.shortcuts.newTab, 'Ctrl+N'); assert.equal(s.shortcuts.closeTab, 'Ctrl+W');
  const back = settingsFromHk(settingsToHk(s));
  assert.deepEqual(back, s);
  const d = settingsFromHk({});
  assert.deepEqual(d, DEFAULT_SETTINGS);
  const c = settingsFromHk({ appearance: { theme: CUSTOM_THEME_NAME }, custom_theme: { background: '#000000' } });
  assert.equal(resolveTheme(c).background, '#000000');
  assert.equal(resolveTheme(c).red, '#F38BA8');
});

test('lokalizacje są kompletne', () => {
  const en = translationsFor('en');
  assert.ok(LOCALES.length >= 4);
  for (const l of LOCALES) assert.deepEqual(Object.keys(l.translations).sort(), Object.keys(en).sort(), l.code);
  assert.equal(translationsFor('xx'), en);
});

import { computeLayout } from '../src/utils/paneTree';
test('układ paneli', () => {
  let t: PaneNode = L(1);
  t = splitLeaf(t, 1, 'row', { kind: 'leaf', id: 2 });
  t = splitLeaf(t, 2, 'col', { kind: 'leaf', id: 3 });
  const l = computeLayout(t);
  assert.deepEqual(l.panes.get(1), { x: 0, y: 0, w: 0.5, h: 1 });
  assert.deepEqual(l.panes.get(2), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  assert.deepEqual(l.panes.get(3), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  assert.equal(l.dividers.length, 2);
});
