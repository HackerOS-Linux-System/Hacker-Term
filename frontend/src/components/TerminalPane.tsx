import { For, Index, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js';
import type { Rect } from '../utils/paneTree';
import { getSession, releaseSession, settings, theme, t, setActivePane, toast, tabs, findPaneTabId } from '../store';
import { cell } from '../term/metrics';
import { runStyle, glyphSegs } from '../term/theme';
import { selectionText, wordAt, type Match } from '../term/search';
import { mouseReport } from '../term/keys';
import { clipboard, errText } from '../services/api';
import type { Leaf } from '../types';
import type { Packed } from '../term/emulator';
import { cssFont } from '../config';

export interface PaneHandle { copy(): void; paste(): void; focus(): void }
const handles = new Map<number, PaneHandle>();
export const paneHandle = (id: number) => handles.get(id);

/** Aktualne dopasowania wyszukiwania (ustawia SearchBar) — rysowane jako nakładki. */
export const [searchState, setSearchState] = createSignal<{ pane: number; matches: Match[]; current: number }>({ pane: 0, matches: [], current: -1 });
export const [paneMenu, setPaneMenu] = createSignal<{ pane: number; x: number; y: number } | null>(null);

interface Props { leaf: Leaf; tabId: number; rect: Rect; active: boolean; visible: boolean }
type Pos = { r: number; c: number };

const sig = (p: Packed) => p.runs.map((r) => `${r.col}|${r.fg}|${r.bg}|${r.attr}|${r.text}`).join('\n');

export default function TerminalPane(props: Props) {
  const id = props.leaf.id;
  const session = getSession(id);
  const emu = session.emu;
  let host!: HTMLDivElement;
  let screen!: HTMLDivElement;
  let sink!: HTMLTextAreaElement;
  const [sel, setSel] = createSignal<{ a: Pos; b: Pos } | null>(null);
  let dragging = false;
  let moved = false;
  let lastClick = { t: 0, r: -1, c: -1, n: 0 };

  // ── wiersze: niezmienione wiersze zachowują tożsamość obiektu, więc DOM nie jest odtwarzany ──
  let prev: Packed[] = [];
  let prevSig: string[] = [];
  const rows = createMemo(() => {
    session.tick();
    const next = emu.viewRows();
    const out = next.map((r, i) => {
      const s = sig(r);
      if (prevSig[i] === s) return prev[i];
      return r;
    });
    prevSig = next.map(sig);
    prev = out;
    return out;
  });

  const cw = () => cell().w;
  const ch = () => cell().h;
  const pad = () => settings().padding;

  // ── rozmiar → kolumny/wiersze ──
  const fit = () => {
    const r = host.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const cols = Math.max(2, Math.floor((r.width - pad() * 2) / cw()));
    const rws = Math.max(1, Math.floor((r.height - pad() * 2) / ch()));
    session.resize(cols, rws);
    setHostH(r.height);
  };

  onMount(async () => {
    handles.set(id, { copy: doCopy, paste: doPaste, focus: () => sink.focus() });
    // poczekaj na pierwszy układ (Silver zwraca zera przed pierwszą klatką), potem otwórz PTY z właściwym rozmiarem
    for (let i = 0; i < 40; i++) {
      const r = host.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) break;
      await new Promise((res) => setTimeout(res, 16));
    }
    fit();
    await session.open({ shell: settings().shell, cwd: props.leaf.cwd, env: props.leaf.env });
    fit();
    if (props.active) sink.focus();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => fit());
      ro.observe(host);
      onCleanup(() => ro.disconnect());
    }
    window.addEventListener('resize', fit);
    onCleanup(() => window.removeEventListener('resize', fit));
  });

  onCleanup(() => { handles.delete(id); releaseSession(id); });

  createEffect(on([cell, () => settings().padding], () => queueMicrotask(fit), { defer: true }));
  createEffect(on(() => props.rect, () => setTimeout(fit, 0), { defer: true }));
  createEffect(() => { if (props.active && props.visible) setTimeout(() => sink?.focus(), 0); });

  // ── geometria myszy ──
  const cellAt = (e: { clientX: number; clientY: number }): Pos => {
    const r = screen.getBoundingClientRect();
    const col = Math.min(emu.cols - 1, Math.max(0, Math.floor((e.clientX - r.left) / cw())));
    const row = Math.min(emu.rows - 1, Math.max(0, Math.floor((e.clientY - r.top) / ch())));
    return { r: emu.scrollback.length - (emu.altScreen ? 0 : emu.viewOffset) + row, c: col };
  };
  const viewRowOf = (abs: number) => abs - (emu.scrollback.length - (emu.altScreen ? 0 : emu.viewOffset));

  const activate = () => { setActivePane(props.tabId, id); sink.focus(); };

  const onMouseDown = (e: MouseEvent) => {
    activate();
    setPaneMenu(null);
    if (e.button === 2) return;
    const p = cellAt(e);
    if (emu.mouse.track && !e.shiftKey) {
      session.send(mouseReport(e.button, p.c, viewRowOf(p.r), false, emu.mouse.sgr));
      mouseHeld = e.button;
      return;
    }
    const now = Date.now();
    const same = now - lastClick.t < 450 && lastClick.r === p.r && lastClick.c === p.c;
    lastClick = { t: now, r: p.r, c: p.c, n: same ? lastClick.n + 1 : 1 };
    const lines = emu.allLines();
    if (lastClick.n === 2) {
      const [a, b] = wordAt(lines[p.r]?.chars ?? [], p.c);
      setSel({ a: { r: p.r, c: a }, b: { r: p.r, c: b } });
      dragging = false;
    } else if (lastClick.n >= 3) {
      setSel({ a: { r: p.r, c: 0 }, b: { r: p.r, c: emu.cols - 1 } });
      dragging = false;
    } else {
      setSel({ a: p, b: p });
      dragging = true; moved = false;
    }
  };
  let mouseHeld = -1;
  const onMouseMove = (e: MouseEvent) => {
    lastCell = cellAt(e);
    if (mouseHeld >= 0 && emu.mouse.track >= 1002) {
      const p = cellAt(e);
      session.send(mouseReport(mouseHeld + 32, p.c, viewRowOf(p.r), false, emu.mouse.sgr));
      return;
    }
    if (!dragging) return;
    const p = cellAt(e);
    const cur = sel();
    if (cur && (p.r !== cur.b.r || p.c !== cur.b.c)) { moved = true; setSel({ a: cur.a, b: p }); }
  };
  const onMouseUp = (e: MouseEvent) => {
    if (mouseHeld >= 0) {
      const p = cellAt(e);
      session.send(mouseReport(mouseHeld, p.c, viewRowOf(p.r), true, emu.mouse.sgr));
      mouseHeld = -1;
      return;
    }
    if (dragging && !moved) setSel(null);
    dragging = false;
  };
  // ── przewijanie ──
  // Silver nie wysyła zdarzenia `wheel` do JS — kółko przewija kontenery z overflow i wywołuje `scroll`.
  // Dlatego nad ekranem leży przezroczysty kontener (`.scroller`) z odległościomierzem-rozpórką:
  //  • zwykły ekran: pozycja scrollTop = pozycja w historii (scrollback);
  //  • ekran alternatywny / śledzenie myszy: pozycja jest stale centrowana, a odchylenie zamieniamy na strzałki / raporty kółka.
  const VIRTUAL = 4000;
  let scroller!: HTMLDivElement;
  let lastSet = -1;
  let lastCell: Pos = { r: 0, c: 0 };
  const virtualMode = () => emu.altScreen || emu.mouse.track !== 0;
  const [hostH, setHostH] = createSignal(0);
  const spacerH = createMemo(() => { session.tick(); return hostH() + (virtualMode() ? VIRTUAL : emu.scrollback.length * ch()); });
  createEffect(() => {
    session.tick(); spacerH();
    const target = virtualMode() ? VIRTUAL / 2 : (emu.scrollback.length - emu.viewOffset) * ch();
    if (scroller && target !== lastSet) { scroller.scrollTop = target; lastSet = target; }
  });
  const onScroll = (ev: Event) => {
    const e = ev as unknown as { y?: number };
    const y = typeof e.y === 'number' ? e.y : scroller.scrollTop;
    if (virtualMode()) {
      const d = y - VIRTUAL / 2;
      if (Math.abs(d) < 1) return;
      const up = d < 0;
      const notches = Math.max(1, Math.min(5, Math.round(Math.abs(d) / ch())));
      if (emu.mouse.track) for (let i = 0; i < notches; i++) session.send(mouseReport(up ? 64 : 65, lastCell.c, viewRowOf(lastCell.r), false, emu.mouse.sgr));
      else session.send((up ? '\x1b[A' : '\x1b[B').repeat(notches));
      scroller.scrollTop = VIRTUAL / 2; lastSet = VIRTUAL / 2;
      return;
    }
    lastSet = y;
    const off = Math.round((emu.scrollback.length * ch() - y) / ch());
    emu.scrollView(Math.min(Math.max(off, 0), emu.scrollback.length) - emu.viewOffset);
    session.refresh();
  };
  const onContext = (e: MouseEvent) => {
    e.preventDefault();
    activate();
    setPaneMenu({ pane: id, x: e.clientX, y: e.clientY });
  };

  // ── wejście z klawiatury: zwykły tekst przychodzi przez pole `sink` ──
  const onInput = () => {
    const v = sink.value;
    if (!v) return;
    sink.value = '';
    emu.scrollToBottom();
    session.send(v);
    setSel(null);
  };

  function doCopy() {
    const s = sel();
    if (!s) return;
    const text = selectionText(emu.allLines(), s.a, s.b);
    if (text) clipboard.write(text).then(() => toast('ok', t().copied, 1500)).catch((e) => toast('error', `${t().errClipboard}: ${errText(e)}`));
  }
  function doPaste() {
    clipboard.read().then((txt) => { if (txt) { emu.scrollToBottom(); session.paste(txt); } }).catch((e) => toast('error', `${t().errClipboard}: ${errText(e)}`));
  }

  // ── nakładki: zaznaczenie, wyszukiwanie, kursor ──
  const overlayRects = (a: Pos, b: Pos) => {
    const [s, e] = a.r < b.r || (a.r === b.r && a.c <= b.c) ? [a, b] : [b, a];
    const out: Array<{ row: number; c0: number; c1: number }> = [];
    for (let r = s.r; r <= e.r; r++) {
      const row = viewRowOf(r);
      if (row < 0 || row >= emu.rows) continue;
      out.push({ row, c0: r === s.r ? s.c : 0, c1: r === e.r ? e.c : emu.cols - 1 });
    }
    return out;
  };
  const selRects = createMemo(() => { session.tick(); const s = sel(); return s ? overlayRects(s.a, s.b) : []; });
  const matchRects = createMemo(() => {
    session.tick();
    const st = searchState();
    if (st.pane !== id) return [];
    const out: Array<{ row: number; c0: number; c1: number; cur: boolean }> = [];
    st.matches.forEach((m, i) => {
      const row = viewRowOf(m.line);
      if (row >= 0 && row < emu.rows) out.push({ row, c0: m.col, c1: m.col + m.len - 1, cur: i === st.current });
    });
    return out;
  });
  const cursor = createMemo(() => {
    session.tick();
    const visible = emu.cursorVisible && emu.viewOffset === 0;
    const line = emu.grid[emu.cy];
    return { x: emu.cx, y: emu.cy, visible, ch: line?.cells[emu.cx]?.ch || ' ' };
  });

  const bg = () => theme().background;

  return (
    <div
      ref={host}
      class="pane"
      classList={{ active: props.active }}
      style={{
        left: `${props.rect.x * 100}%`, top: `${props.rect.y * 100}%`,
        width: `${props.rect.w * 100}%`, height: `${props.rect.h * 100}%`,
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={onContext}
    >
      <div
        ref={screen}
        class="screen"
        style={{
          left: `${pad()}px`, top: `${pad()}px`,
          width: `${emu.cols * cw()}px`, height: `${emu.rows * ch()}px`,
          'font-family': cssFont(settings().fontFamily), 'font-size': `${settings().fontSize}px`,
          'line-height': `${ch()}px`, color: theme().foreground,
        }}
      >
        <Index each={rows()}>
          {(row, i) => (
            <div class="row" style={{ top: `${i * ch()}px`, height: `${ch()}px` }}>
              <For each={row().runs}>{(r) => <span class="run" style={runStyle(r, theme(), cw())}><For each={glyphSegs(r.text)}>{(g) => (g.nf ? <span class="nf">{g.t}</span> : g.t)}</For></span>}</For>
            </div>
          )}
        </Index>

        <For each={selRects()}>
          {(r) => <div class="ov sel" style={{ left: `${r.c0 * cw()}px`, top: `${r.row * ch()}px`, width: `${(r.c1 - r.c0 + 1) * cw()}px`, height: `${ch()}px`, background: theme().selection }} />}
        </For>
        <For each={matchRects()}>
          {(r) => <div class="ov match" classList={{ current: r.cur }} style={{ left: `${r.c0 * cw()}px`, top: `${r.row * ch()}px`, width: `${(r.c1 - r.c0 + 1) * cw()}px`, height: `${ch()}px` }} />}
        </For>
        <Show when={cursor().visible}>
          <div
            class={`cursor ${settings().cursorStyle}`}
            classList={{ blink: settings().cursorBlink && props.active, hollow: !props.active }}
            style={{
              left: `${cursor().x * cw()}px`, top: `${cursor().y * ch()}px`, width: `${cw()}px`, height: `${ch()}px`,
              '--cur': theme().cursor, color: bg(), 'line-height': `${ch()}px`,
            }}
          >
            {settings().cursorStyle === 'block' && props.active ? cursor().ch : ''}
          </div>
        </Show>
        <textarea
          ref={sink}
          class="sink"
          spellcheck={false}
          style={{ left: `${cursor().x * cw()}px`, top: `${cursor().y * ch()}px` }}
          onInput={onInput}
        />
      </div>
      <div ref={scroller} class="scroller" onScroll={onScroll}>
        <div style={{ height: `${spacerH()}px`, width: '1px' }} />
      </div>
    </div>
  );
}
