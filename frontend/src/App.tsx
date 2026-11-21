import { For, Show, createEffect, onCleanup, onMount } from 'solid-js';
import TabBar, { settingsOpen, setSettingsOpen, setNewTabDialog } from './components/TabBar';
import TabArea from './components/TabArea';
import SettingsPanel, { captureShortcut } from './components/SettingsPanel';
import SearchBar, { searchOpen, setSearchOpen, openSearch } from './components/SearchBar';
import { ContextMenus, NewTabDialog, StatusBar, Toasts } from './components/Overlays';
import { paneHandle } from './components/TerminalPane';
import {
  activePaneId, activeTab, closePane, closeTab, cyclePane, cycleTab, getSession, loadSettings, newTab, restoreOrCreate, saveSessionNow,
  settings, splitActive, startSessionAutosave, tabs, theme, wireBackendEvents,
} from './store';
import { matches } from './utils/keybinding';
import { encodeKey } from './term/keys';
import { remeasure } from './term/metrics';
import { cssFont } from './config';
import type { ShortcutAction } from './types';

export default function App() {
  const actions: Record<ShortcutAction, () => void> = {
    newTab: () => { newTab(); },
    closeTab: () => { const t = activeTab(); if (t) closeTab(t.id); },
    copy: () => paneHandle(activePaneId())?.copy(),
    paste: () => paneHandle(activePaneId())?.paste(),
    search: () => (searchOpen() ? setSearchOpen(false) : openSearch()),
    splitRight: () => splitActive('row'),
    splitDown: () => splitActive('col'),
    closePane: () => closePane(activePaneId()),
    nextTab: () => cycleTab(1),
    prevTab: () => cycleTab(-1),
    nextPane: () => cyclePane(1),
    prevPane: () => cyclePane(-1),
  };

  const onKey = (e: KeyboardEvent) => {
    if (captureShortcut(e)) return;
    for (const [name, combo] of Object.entries(settings().shortcuts) as Array<[ShortcutAction, string]>) {
      if (matches(e, combo)) { e.preventDefault(); actions[name](); return; }
    }
    // dalej tylko, gdy fokus jest w ukrytym polu terminala (nie w polu ustawień / zmiany nazwy / wyszukiwania)
    const el = document.activeElement as HTMLElement | null;
    if (!el || !el.classList?.contains('sink')) return;
    const s = getSession(activePaneId());
    if (e.shiftKey && !e.ctrlKey && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
      s.emu.scrollView((e.key === 'PageUp' ? 1 : -1) * Math.max(1, s.emu.rows - 1));
      s.refresh(); e.preventDefault(); return;
    }
    const bytes = encodeKey(e, s.emu.appCursorKeys);
    if (bytes !== null) {
      e.preventDefault();
      s.emu.scrollToBottom();
      s.send(bytes);
    }
  };

  onMount(async () => {
    document.addEventListener('keydown', onKey);
    wireBackendEvents();
    await loadSettings();
    await restoreOrCreate();
    startSessionAutosave();
    window.addEventListener('beforeunload', () => { void saveSessionNow(); });
  });
  onCleanup(() => document.removeEventListener('keydown', onKey));

  createEffect(() => remeasure(cssFont(settings().fontFamily), settings().fontSize));

  return (
    <div
      class="app"
      style={{ '--bg': theme().background, '--fg': theme().foreground, '--accent': theme().cursor, '--sel': theme().selection, '--blur': `${settings().blur}px` }}
      onMouseDown={() => { if (settingsOpen()) setSettingsOpen(false); }}
    >
      <TabBar />
      <div class="content">
        <For each={tabs().map((x) => x.id)}>{(id) => <TabArea tabId={id} />}</For>
        <SearchBar />
        <Show when={settingsOpen()}><SettingsPanel /></Show>
      </div>
      <StatusBar />
      <ContextMenus />
      <NewTabDialog />
      <Toasts />
    </div>
  );
}
