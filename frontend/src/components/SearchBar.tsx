import { Show, createEffect, createSignal, on } from 'solid-js';
import { activePaneId, getSession, t } from '../store';
import { findAll } from '../term/search';
import { setSearchState } from './TerminalPane';

export const [searchOpen, setSearchOpen] = createSignal(false);
export const openSearch = () => setSearchOpen(true);

export default function SearchBar() {
  const [q, setQ] = createSignal('');
  const [idx, setIdx] = createSignal(-1);
  const [count, setCount] = createSignal(0);
  let input!: HTMLInputElement;

  const run = (jump: 1 | -1 | 0 = 0) => {
    const pane = activePaneId();
    const s = getSession(pane);
    const matches = findAll(s.emu.allLines(), q());
    setCount(matches.length);
    let cur = matches.length ? (idx() < 0 ? matches.length - 1 : idx()) : -1;
    if (jump && matches.length) cur = (cur + jump + matches.length) % matches.length;
    if (cur >= matches.length) cur = matches.length - 1;
    setIdx(cur);
    setSearchState({ pane, matches, current: cur });
    if (cur >= 0) { s.emu.revealLine(matches[cur].line); s.refresh(); }
  };

  createEffect(on(searchOpen, (open) => {
    if (open) setTimeout(() => { input?.focus(); run(); }, 0);
    else setSearchState({ pane: 0, matches: [], current: -1 });
  }));
  createEffect(on(q, () => { setIdx(-1); if (searchOpen()) run(); }, { defer: true }));

  return (
    <Show when={searchOpen()}>
      <div class="searchbar">
        <input
          ref={input}
          class="field"
          placeholder={t().searchPlaceholder}
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') setSearchOpen(false);
            else if (e.key === 'Enter') run(e.shiftKey ? -1 : 1);
          }}
        />
        <span class="search-count">{q() ? (count() ? `${idx() + 1}/${count()}` : t().noMatches) : ''}</span>
        <button class="icon-btn" onClick={() => run(-1)}>↑</button>
        <button class="icon-btn" onClick={() => run(1)}>↓</button>
        <button class="icon-btn" onClick={() => setSearchOpen(false)}>×</button>
      </div>
    </Show>
  );
}
