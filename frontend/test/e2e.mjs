import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const calls = []; const listeners = {};
w.silver = {
  invoke: async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'load_config') return { terminal: { font_size: 15 }, appearance: { language: 'pl' } };
    if (cmd === 'load_session') return { tabs: [] };
    if (cmd === 'create_terminal') { setTimeout(() => (listeners['terminal-data'] || []).forEach((f) => f({ id: args.id, data: Buffer.from('\x1b[1;32muser@host\x1b[0m:~$ echo żółć\r\nżółć\r\n').toString('base64') })), 20); return { id: args.id }; }
    if (cmd === 'terminal_cwd') return { cwd: '/tmp' };
    return { ok: true };
  },
  listen: (ev, f) => { (listeners[ev] ||= []).push(f); return () => {}; },
  window: { minimize() {}, maximize() {}, restore() {}, close() {}, setOpacity() {}, setTitle() {} },
  clipboard: { readText: async () => 'x', writeText: async () => {} },
};
w.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0 }; };
w.eval(readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8'));
await new Promise((r) => setTimeout(r, 400));
const d = w.document;
const out = {
  tabs: d.querySelectorAll('.tab').length,
  panes: d.querySelectorAll('.pane').length,
  rows: d.querySelectorAll('.row').length,
  text: [...d.querySelectorAll('.row')].map((r) => r.textContent).filter(Boolean),
  title: d.querySelector('.tab-title')?.textContent,
  cmds: calls.map((c) => c[0]),
  created: calls.find((c) => c[0] === 'create_terminal')?.[1],
  lang: d.querySelector('.settings') ? 'open' : 'closed',
};
console.log(JSON.stringify(out, null, 1));
// klik + → druga karta; split przez skrót
d.querySelector('.tab-add').click();
await new Promise((r) => setTimeout(r, 100));
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'd', ctrlKey: true, altKey: true, bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
console.log('po akcjach: tabs', d.querySelectorAll('.tab').length, 'panes', d.querySelectorAll('.pane').length, 'dividers', d.querySelectorAll('.divider').length);
d.querySelector('.icon-btn[title]')?.click();
process.exit(0);
