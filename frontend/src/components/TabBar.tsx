import { For, Show, createSignal } from 'solid-js';
import { activeTabId, closeTab, moveTab, newTab, renameTab, selectTab, tabLabel, tabs, t } from '../store';
import { win } from '../services/api';
import type { Tab } from '../types';

export const [tabMenu, setTabMenu] = createSignal<{ tab: number; x: number; y: number } | null>(null);
export const [newTabDialog, setNewTabDialog] = createSignal(false);
export const [settingsOpen, setSettingsOpen] = createSignal(false);

export default function TabBar() {
  const [editing, setEditing] = createSignal(0);
  const [dragId, setDragId] = createSignal(0);
  const [maximized, setMaximized] = createSignal(false);

  const toggleMax = () => {
    if (maximized()) { void win.restore(); setMaximized(false); } else { void win.maximize(); setMaximized(true); }
  };

  const finish = (tab: Tab, input: HTMLInputElement, commit: boolean) => {
    if (editing() !== tab.id) return;
    setEditing(0);
    if (commit) renameTab(tab.id, input.value);
  };

  return (
    <div class="titlebar">
      <div class="traffic">
        <button class="dot red" title={t().close} onClick={() => void win.close()} />
        <button class="dot yellow" title={t().minimize} onClick={() => void win.minimize()} />
        <button class="dot green" title={t().maximize} onClick={toggleMax} />
      </div>
      <div class="tabs">
        <For each={tabs()}>
          {(tab, i) => (
            <div
              class="tab"
              classList={{ active: tab.id === activeTabId(), dragging: dragId() === tab.id }}
              onMouseDown={(e) => { if (e.button === 0) { selectTab(tab.id); setDragId(tab.id); const up = () => { setDragId(0); document.removeEventListener('mouseup', up); }; document.addEventListener('mouseup', up); } }}
              onMouseEnter={() => { if (dragId() && dragId() !== tab.id) moveTab(dragId(), i()); }}
              onDblClick={() => setEditing(tab.id)}
              onContextMenu={(e) => { e.preventDefault(); selectTab(tab.id); setTabMenu({ tab: tab.id, x: e.clientX, y: e.clientY }); }}
            >
              <Show when={editing() === tab.id} fallback={<span class="tab-title">{tabLabel(tab)}</span>}>
                <input
                  class="tab-edit"
                  value={tabLabel(tab)}
                  ref={(el) => setTimeout(() => { el.focus(); }, 0)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') finish(tab, e.currentTarget, true);
                    else if (e.key === 'Escape') finish(tab, e.currentTarget, false);
                  }}
                  onBlur={(e) => finish(tab, e.currentTarget, true)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </Show>
              <button class="tab-close" title={t().closeTab} onMouseDown={(e) => e.stopPropagation()} onClick={() => closeTab(tab.id)}>×</button>
            </div>
          )}
        </For>
        <button class="tab-add" title={t().newTab} onClick={() => newTab()} onContextMenu={(e) => { e.preventDefault(); setNewTabDialog(true); }}>+</button>
      </div>
      <div class="drag-space" />
      <button class="icon-btn" title={t().settings} onClick={() => setSettingsOpen(!settingsOpen())}>⚙</button>
    </div>
  );
}
