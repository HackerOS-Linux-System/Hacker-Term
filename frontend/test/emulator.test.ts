import test from 'node:test';
import assert from 'node:assert/strict';
import { Emulator, A_BOLD, TRUE, lineRuns } from '../src/term/emulator';
import { encodeKey } from '../src/term/keys';
import { b64ToBytes, bytesToB64, textToB64 } from '../src/term/b64';
import { charWidth } from '../src/term/width';

const mk = (c = 20, r = 5) => new Emulator(c, r, 100);

test('tekst, CR LF i zawijanie', () => {
  const t = mk(5, 3);
  t.feed('abcdefg\r\nxy');
  assert.deepEqual(t.screenText(), ['abcde', 'fg', 'xy']);
  assert.equal(t.grid[0].wrapped, true);
});

test('przewijanie trafia do historii', () => {
  const t = mk(10, 2);
  t.feed('1\r\n2\r\n3\r\n4');
  assert.deepEqual(t.screenText(), ['3', '4']);
  assert.equal(t.scrollback.length, 2);
  assert.equal(t.scrollback[0].chars.join('').trim(), '1');
});

test('sterowanie kursorem i czyszczenie', () => {
  const t = mk();
  t.feed('hello\x1b[3D\x1b[KXY');
  assert.equal(t.screenText()[0], 'heXY');
  t.feed('\x1b[2J\x1b[H!');
  assert.equal(t.screenText()[0], '!');
  assert.equal(t.screenText()[1], '');
  t.feed('\x1b[3;5Hz');
  assert.equal(t.cy, 2); assert.equal(t.grid[2].cells[4].ch, 'z');
});

test('SGR: 16, 256, truecolor, dwukropki, reset', () => {
  const t = mk();
  t.feed('\x1b[1;31ma\x1b[38;5;200;48;2;1;2;3mb\x1b[38:2::10:20:30mc\x1b[0md');
  const c = t.grid[0].cells;
  assert.equal(c[0].fg, 1); assert.ok(c[0].attr & A_BOLD);
  assert.equal(c[1].fg, 200); assert.equal(c[1].bg, TRUE + 0x010203);
  assert.equal(c[2].fg, TRUE + 0x0a141e);
  assert.equal(c[3].fg, -1); assert.equal(c[3].attr, 0);
  assert.equal(lineRuns(c).length, 4);
});

test('UTF-8 strumieniowo i szerokie znaki', () => {
  const t = mk();
  const bytes = new TextEncoder().encode('żó漢a');
  t.write(bytes.subarray(0, 1)); t.write(bytes.subarray(1, 4)); t.write(bytes.subarray(4));
  assert.equal(t.screenText()[0], 'żó漢a');
  assert.equal(t.cx, 5);                       // ż ó (1+1) + 漢 (2) + a (1)
  assert.equal(charWidth(0x1f600), 2);
  assert.equal(charWidth(0x301), 0);
});

test('region przewijania i RI/IND', () => {
  const t = mk(5, 4);
  t.feed('a\r\nb\r\nc\r\nd\x1b[2;3r\x1b[3;1H\n');      // przewija tylko wiersze 2-3
  assert.deepEqual(t.screenText(), ['a', 'c', '', 'd']);
  t.feed('\x1b[2;1H\x1bM');
  assert.deepEqual(t.screenText(), ['a', '', 'c', 'd']);
});

test('ekran alternatywny zachowuje główny', () => {
  const t = mk(10, 3);
  t.feed('main\x1b[?1049h\x1b[Halt');
  assert.equal(t.screenText()[0], 'alt');
  assert.equal(t.altScreen, true);
  t.feed('\x1b[?1049l');
  assert.equal(t.screenText()[0], 'main');
  assert.equal(t.cx, 4);
});

test('tryby DEC, OSC, odpowiedzi', () => {
  const t = mk();
  const out: string[] = []; let title = ''; let cwd = '';
  t.onResponse = (d) => out.push(d); t.onTitle = (s) => (title = s); t.onCwd = (s) => (cwd = s);
  t.feed('\x1b[?1h\x1b[?2004h\x1b[?25l\x1b[?1006h\x1b[?1002h');
  assert.ok(t.appCursorKeys && t.bracketedPaste && !t.cursorVisible && t.mouse.sgr && t.mouse.track === 1002);
  t.feed('\x1b]0;mój tytuł\x07\x1b]7;file://host/home/a%20b\x1b\\');
  assert.equal(title, 'mój tytuł'); assert.equal(cwd, '/home/a b');
  t.feed('\x1b[5n\x1b[3;4H\x1b[6n');
  assert.deepEqual(out, ['\x1b[0n', '\x1b[3;4R']);
});

test('grafika liniowa DEC, tabulatory, insert/delete', () => {
  const t = mk();
  t.feed('\x1b(0lqk\x1b(B\r\n\tX');
  assert.equal(t.screenText()[0], '┌─┐');
  assert.equal(t.grid[1].cells[8].ch, 'X');
  t.feed('\x1b[1;1H\x1b[2@ab');
  assert.equal(t.screenText()[0].slice(0, 5), 'ab┌─┐');
  t.feed('\x1b[1;1H\x1b[2P');
  assert.equal(t.screenText()[0].slice(0, 3), '┌─┐');
});

test('zmiana rozmiaru', () => {
  const t = mk(10, 4);
  t.feed('1\r\n2\r\n3\r\n4');
  t.resize(6, 2);
  assert.equal(t.rows, 2); assert.equal(t.grid[0].cells.length, 6);
  assert.deepEqual(t.screenText(), ['3', '4']);
  t.resize(12, 5);
  assert.equal(t.grid.length, 5);
});

test('widok przewinięty', () => {
  const t = mk(5, 2);
  t.feed('a\r\nb\r\nc\r\nd');
  t.scrollView(2);
  const v = t.viewRows().map((r) => r.chars.join('').trim());
  assert.deepEqual(v, ['a', 'b']);
  t.scrollToBottom();
  assert.deepEqual(t.viewRows().map((r) => r.chars.join('').trim()), ['c', 'd']);
});

test('klawisze → bajty', () => {
  const k = (key: string, o: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
    ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...o });
  assert.equal(encodeKey(k('Enter'), false), '\r');
  assert.equal(encodeKey(k('ArrowUp'), false), '\x1b[A');
  assert.equal(encodeKey(k('ArrowUp'), true), '\x1bOA');
  assert.equal(encodeKey(k('ArrowLeft', { ctrlKey: true }), false), '\x1b[1;5D');
  assert.equal(encodeKey(k('c', { ctrlKey: true }), false), '\x03');
  assert.equal(encodeKey(k('d', { ctrlKey: true }), false), '\x04');
  assert.equal(encodeKey(k('x', { altKey: true }), false), '\x1bx');
  assert.equal(encodeKey(k('Tab', { shiftKey: true }), false), '\x1b[Z');
  assert.equal(encodeKey(k('F5'), false), '\x1b[15~');
  assert.equal(encodeKey(k('Delete'), false), '\x1b[3~');
  assert.equal(encodeKey(k('a'), false), null);
  assert.equal(encodeKey(k(' ', { ctrlKey: true }), false), '\x00');
});

test('base64', () => {
  assert.equal(bytesToB64(b64ToBytes('aGVsbG8=')), 'aGVsbG8=');
  assert.equal(textToB64('zażółć'), Buffer.from('zażółć').toString('base64'));
});

import { findAll, selectionText, wordAt } from '../src/term/search';
import { runStyle, paletteColor } from '../src/term/theme';
import { THEMES } from '../src/config';

test('wyszukiwanie, zaznaczanie, słowa', () => {
  const t = mk(10, 3);
  t.feed('foo bar\r\nBAR foo');
  const lines = t.allLines();
  const m = findAll(lines, 'bar');
  assert.deepEqual(m.map((x) => [x.line, x.col]), [[0, 4], [1, 0]]);
  assert.equal(findAll(lines, 'bar', true).length, 1);
  assert.equal(selectionText(lines, { r: 0, c: 4 }, { r: 1, c: 2 }), 'bar\nBAR');
  assert.deepEqual(wordAt(lines[0].chars, 5), [4, 6]);
  const w = mk(6, 3); w.feed('漢字ab');
  assert.deepEqual(findAll(w.allLines(), 'ab').map((x) => x.col), [4]);
});

test('reveal i style serii', () => {
  const t = mk(5, 2);
  t.feed('a\r\nb\r\nc\r\nd\r\ne');
  t.revealLine(0);
  assert.ok(t.viewOffset > 0);
  assert.equal(t.viewRows().some((r) => r.chars.join('').trim() === 'a'), true);
  const th = THEMES['Hacker (Default)'];
  const r = { text: 'x', fg: 1, bg: -1, attr: 1, col: 3, w: 1 };
  assert.match(runStyle(r, th, 10), /left:30\.00px;color:#F38BA8.*bold/i);
  assert.equal(paletteColor(16, th), '#000000');
  assert.equal(paletteColor(255, th), '#eeeeee');
});

import { Utf8Decoder } from '../src/term/utf8';
test('dekoder UTF-8: porcje rozcinające znaki i błędne bajty', () => {
  const d = new Utf8Decoder();
  const bytes = new TextEncoder().encode('zażółć 漢 😀 ok');
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += d.decode(bytes.subarray(i, i + 1));     // bajt po bajcie
  assert.equal(out, 'zażółć 漢 😀 ok');
  const d2 = new Utf8Decoder();
  assert.equal(d2.decode(new Uint8Array([0x61, 0xff, 0x62, 0xe6, 0xbc])), 'a�b');      // ucięty znak czeka
  assert.equal(d2.decode(new Uint8Array([0xa2, 0x63])), '漢c');
  assert.equal(new Utf8Decoder().decode(new Uint8Array([0xc0, 0x80])), '��');
});

test('glyphSegs: ikony Nerd Font (PUA) trafiają do osobnych odcinków', async () => {
  const { glyphSegs } = await import('../src/term/theme');
  assert.deepEqual(glyphSegs('abc'), [{ t: 'abc', nf: false }]);
  assert.deepEqual(glyphSegs('ab'), [{ t: 'a', nf: false }, { t: '', nf: true }, { t: 'b', nf: false }]);
  assert.deepEqual(glyphSegs('\u{f0a47}x'), [{ t: '\u{f0a47}', nf: true }, { t: 'x', nf: false }]);
  assert.equal(glyphSegs('─╔█✓•').length, 1);
});
