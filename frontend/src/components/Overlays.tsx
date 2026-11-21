import { For, Show, createEffect, createSignal } from 'solid-js';
import { closeOtherTabs, closePane, closeTab, dismissToast, duplicateTab, newTab, splitActive, t, tabs, toasts, setActiveTabId, settings } from '../store';
import { newTabDialog, setNewTabDialog, setTabMenu, tabMenu } from './TabBar';
import { paneHandle, paneMenu, setPaneMenu } from './TerminalPane';
import { openSearch } from './SearchBar';

export function Toasts() {
  return (
    <div class="toasts">
      <For each={toasts()}>
        {(x) => <div class={`toast ${x.kind}`} onClick={() => dismissToast(x.id)}>{x.text}</div>}
      </For>
    </div>
  );
}

interface Item { label: string; run: () => void; sep?: boolean }
function Menu(props: { x: number; y: number; items: Item[]; onClose: () => void }) {
  return (
    <>
      <div class="menu-backdrop" onMouseDown={props.onClose} onContextMenu={(e) => { e.preventDefault(); props.onClose(); }} />
      <div class="menu" style={{ left: `${Math.min(props.x, window.innerWidth - 220)}px`, top: `${Math.min(props.y, window.innerHeight - props.items.length * 30 - 12)}px` }}>
        <For each={props.items}>
          {(it) => (
            <>
              <Show when={it.sep}><div class="menu-sep" /></Show>
              <button class="menu-item" onClick={() => { props.onClose(); it.run(); }}>{it.label}</button>
            </>
          )}
        </For>
      </div>
    </>
  );
}

export function ContextMenus() {
  return (
    <>
      <Show when={tabMenu()}>
        {(m) => (
          <Menu x={m().x} y={m().y} onClose={() => setTabMenu(null)} items={[
            { label: t().newTab, run: () => newTab() },
            { label: t().newTabHere, run: () => setNewTabDialog(true) },
            { label: t().duplicateTab, run: () => duplicateTab(m().tab), sep: true },
            { label: t().renameTab, run: () => { setActiveTabId(m().tab); document.querySelector<HTMLElement>('.tab.active')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); } },
            { label: t().closeTab, run: () => closeTab(m().tab), sep: true },
            ...(tabs().length > 1 ? [{ label: t().closeOthers, run: () => closeOtherTabs(m().tab) }] : []),
          ]} />
        )}
      </Show>
      <Show when={paneMenu()}>
        {(m) => (
          <Menu x={m().x} y={m().y} onClose={() => setPaneMenu(null)} items={[
            { label: t().copy, run: () => paneHandle(m().pane)?.copy() },
            { label: t().paste, run: () => paneHandle(m().pane)?.paste() },
            { label: t().search, run: () => openSearch() },
            { label: t().splitRight, run: () => splitActive('row'), sep: true },
            { label: t().splitDown, run: () => splitActive('col') },
            { label: t().closePane, run: () => closePane(m().pane), sep: true },
          ]} />
        )}
      </Show>
    </>
  );
}

/** Nowa karta z katalogiem roboczym i zmiennymi środowiskowymi. */
export function NewTabDialog() {
  const [cwd, setCwd] = createSignal('');
  const [env, setEnv] = createSignal('');
  createEffect(() => { if (newTabDialog()) { setCwd(''); setEnv(''); } });
  const submit = () => {
    const vars: Record<string, string> = {};
    for (const line of env().split('\n')) {
      const i = line.indexOf('=');
      if (i > 0) vars[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    newTab({ cwd: cwd().trim() || undefined, env: Object.keys(vars).length ? vars : undefined });
    setNewTabDialog(false);
  };
  return (
    <Show when={newTabDialog()}>
      <div class="modal-backdrop" onMouseDown={() => setNewTabDialog(false)}>
        <div class="modal" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setNewTabDialog(false); }}>
          <h3>{t().newTabHere}</h3>
          <label>{t().workingDir}</label>
          <input class="field" placeholder="~/projects" value={cwd()} onInput={(e) => setCwd(e.currentTarget.value)} ref={(el) => setTimeout(() => el.focus(), 0)} />
          <label>{t().envVars}</label>
          <textarea class="field area" placeholder="FOO=bar" value={env()} onInput={(e) => setEnv(e.currentTarget.value)} />
          <div class="modal-actions">
            <button class="btn" onClick={() => setNewTabDialog(false)}>{t().cancel}</button>
            <button class="btn primary" onClick={submit}>{t().open}</button>
          </div>
        </div>
      </div>
    </Show>
  );
}

export function StatusBar() {
  return (
    <div class="statusbar">
      <span class="status-dot" /> <span>{t().ready}</span>
      <span class="status-sep">·</span>
      <span>{settings().shell}</span>
      <span class="status-right">HackerTerm 1.0 · H# + Silver</span>
    </div>
  );
}
