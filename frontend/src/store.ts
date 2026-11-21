import { batch, createSignal } from 'solid-js';
import type { AppSettings, Leaf, PaneNode, SessionData, Tab, Toast } from './types';
import { DEFAULT_SETTINGS, resolveTheme, settingsFromHk, settingsToHk } from './config';
import { translationsFor } from './locales';
import { call, errText, onTerminalData, onTerminalExit, win } from './services/api';
import { TerminalSession } from './term/session';
import { cloneWithNewIds, cycleLeaf, findLeaf, leaves, removeLeaf, sanitize, setRatio, splitLeaf } from './utils/paneTree';

// ───────────── ustawienia ─────────────
export const [settings, setSettings] = createSignal<AppSettings>(DEFAULT_SETTINGS);
export const theme = () => resolveTheme(settings());
export const t = () => translationsFor(settings().language);

let configLoaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function updateSettings(patch: Partial<AppSettings>): void {
  const next = { ...settings(), ...patch };
  setSettings(next);
  if (patch.opacity !== undefined) applyOpacity(next.opacity);
  if (patch.scrollback !== undefined) for (const s of sessions.values()) s.emu.maxScrollback = next.scrollback;
  if (!configLoaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    call('save_config', { config: settingsToHk(settings()) }).catch((e) => toast('error', `${t().errConfigSave}: ${errText(e)}`));
  }, 600);
}

function applyOpacity(o: number): void {
  try { void win.setOpacity(Math.round(o * 100)); } catch { /* okno bez obsługi przezroczystości */ }
}

export async function loadSettings(): Promise<void> {
  try {
    setSettings(settingsFromHk(await call('load_config')));
    applyOpacity(settings().opacity);
  } catch (e) {
    toast('error', `${t().errConfigLoad}: ${errText(e)}`);
  }
  configLoaded = true;
}

// ───────────── toasty ─────────────
export const [toasts, setToasts] = createSignal<Toast[]>([]);
let toastId = 0;
export function toast(kind: Toast['kind'], text: string, ms = 4500): void {
  const id = ++toastId;
  setToasts((l) => [...l.slice(-4), { id, kind, text }]);
  setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), ms);
}
export const dismissToast = (id: number) => setToasts((l) => l.filter((x) => x.id !== id));

// ───────────── sesje PTY ─────────────
export const sessions = new Map<number, TerminalSession>();
let paneSeq = 0;
let tabSeq = 0;
export const nextPaneId = () => ++paneSeq;

export function getSession(id: number): TerminalSession {
  let s = sessions.get(id);
  if (!s) {
    s = new TerminalSession(id, 80, 24, settings().scrollback);
    s.onError = (m) => toast('error', `${t().errTerminal}: ${m}`);
    s.onTitle = (title) => setPaneTitle(id, title);
    sessions.set(id, s);
  }
  return s;
}

export function releaseSession(id: number): void {
  sessions.get(id)?.close();
  sessions.delete(id);
}

let wired = false;
export function wireBackendEvents(): void {
  if (wired || typeof silver === 'undefined') return;
  wired = true;
  onTerminalData((id, b64) => sessions.get(id)?.feed(b64));
  onTerminalExit((id) => { sessions.get(id)?.markExited(); closePane(id); });
}

// ───────────── karty i panele ─────────────
export const [tabs, setTabs] = createSignal<Tab[]>([]);
export const [activeTabId, setActiveTabId] = createSignal(0);
export const activeTab = () => tabs().find((x) => x.id === activeTabId());
export const activePaneId = () => activeTab()?.active ?? 0;

const newLeaf = (o: Partial<Leaf> = {}): Leaf => ({ kind: 'leaf', id: nextPaneId(), ...o });
const DEFAULT_TITLE = () => settings().shell || 'shell';

export function newTab(opts: { cwd?: string; env?: Record<string, string> } = {}): number {
  const leaf = newLeaf(opts);
  const tab: Tab = { id: ++tabSeq, title: DEFAULT_TITLE(), root: leaf, active: leaf.id };
  batch(() => { setTabs((l) => [...l, tab]); setActiveTabId(tab.id); });
  markDirty();
  return tab.id;
}

export function closeTab(id: number): void {
  const tab = tabs().find((x) => x.id === id);
  if (!tab) return;
  const idx = tabs().findIndex((x) => x.id === id);
  const rest = tabs().filter((x) => x.id !== id);
  batch(() => {
    setTabs(rest);
    if (activeTabId() === id && rest.length) setActiveTabId(rest[Math.min(idx, rest.length - 1)].id);
  });
  markDirty();
  if (!rest.length) void saveSessionNow().finally(() => { void win.close(); });
}

export function closeOtherTabs(id: number): void {
  const keep = tabs().find((x) => x.id === id);
  if (!keep) return;
  batch(() => { setTabs([keep]); setActiveTabId(id); });
  markDirty();
}

export function duplicateTab(id: number): void {
  const src = tabs().find((x) => x.id === id);
  if (!src) return;
  const idMapRoot = cloneWithNewIds(src.root, nextPaneId);
  // cwd bieżących powłok zamiast początkowych
  void Promise.all(leaves(src.root).map((l) => call('terminal_cwd', { id: l.id }).then((r) => r.cwd).catch(() => ''))).then((cwds) => {
    const olds = leaves(src.root), news = leaves(idMapRoot);
    news.forEach((n, i) => { if (cwds[i]) n.cwd = cwds[i]; else n.cwd = olds[i].cwd; });
    const tab: Tab = { id: ++tabSeq, title: src.title, customTitle: src.customTitle, root: idMapRoot, active: news[0].id };
    const at = tabs().findIndex((x) => x.id === id);
    batch(() => { setTabs((l) => [...l.slice(0, at + 1), tab, ...l.slice(at + 1)]); setActiveTabId(tab.id); });
    markDirty();
  });
}

export function renameTab(id: number, name: string): void {
  const n = name.trim();
  setTabs((l) => l.map((x) => (x.id === id ? { ...x, customTitle: n || undefined } : x)));
  markDirty();
}

export function moveTab(id: number, toIndex: number): void {
  const l = tabs();
  const from = l.findIndex((x) => x.id === id);
  if (from < 0 || from === toIndex || toIndex < 0 || toIndex >= l.length) return;
  const copy = l.slice();
  const [m] = copy.splice(from, 1);
  copy.splice(toIndex, 0, m);
  setTabs(copy);
  markDirty();
}

export function selectTab(id: number): void { setActiveTabId(id); }
export function cycleTab(step: 1 | -1): void {
  const l = tabs();
  if (l.length < 2) return;
  const i = l.findIndex((x) => x.id === activeTabId());
  setActiveTabId(l[(i + step + l.length) % l.length].id);
}

export function setActivePane(tabId: number, paneId: number): void {
  setTabs((l) => l.map((x) => (x.id === tabId && x.active !== paneId ? { ...x, active: paneId } : x)));
  setActiveTabId(tabId);
}

export function cyclePane(step: 1 | -1): void {
  const tab = activeTab();
  if (!tab) return;
  setActivePane(tab.id, cycleLeaf(tab.root, tab.active, step));
}

export function splitActive(dir: 'row' | 'col'): void {
  const tab = activeTab();
  if (!tab) return;
  // nowy panel startuje w katalogu aktywnego
  const src = findLeaf(tab.root, tab.active);
  const fresh = newLeaf({ cwd: src?.cwd, env: src?.env });
  const finish = (cwd?: string) => {
    if (cwd) fresh.cwd = cwd;
    setTabs((l) => l.map((x) => (x.id === tab.id ? { ...x, root: splitLeaf(x.root, tab.active, dir, fresh), active: fresh.id } : x)));
    markDirty();
  };
  call('terminal_cwd', { id: tab.active }).then((r) => finish(r.cwd || undefined)).catch(() => finish());
}

export function closePane(paneId: number): void {
  const tab = tabs().find((x) => !!findLeaf(x.root, paneId));
  if (!tab) return;
  const root = removeLeaf(tab.root, paneId);
  if (!root) { closeTab(tab.id); return; }
  const active = tab.active === paneId ? leaves(root)[0].id : tab.active;
  setTabs((l) => l.map((x) => (x.id === tab.id ? { ...x, root, active } : x)));
  markDirty();
}

export function resizeSplit(tabId: number, path: Array<'a' | 'b'>, ratio: number): void {
  setTabs((l) => l.map((x) => (x.id === tabId ? { ...x, root: setRatio(x.root, path, ratio) } : x)));
  markDirty();
}

function setPaneTitle(paneId: number, title: string): void {
  const tab = tabs().find((x) => x.active === paneId && !!findLeaf(x.root, paneId));
  const clean = title.trim();
  if (tab && clean && tab.title !== clean) setTabs((l) => l.map((x) => (x.id === tab.id ? { ...x, title: clean } : x)));
}

export const tabLabel = (tab: Tab) => tab.customTitle || tab.title;

// ───────────── sesja (karty/panele między uruchomieniami) ─────────────
let dirty = false;
export const markDirty = () => { dirty = true; };

async function snapshot(): Promise<SessionData> {
  const out: SessionData['tabs'] = [];
  for (const tab of tabs()) {
    const root = structuredClone(tab.root) as PaneNode;
    await Promise.all(leaves(root).map(async (l) => {
      try { const c = (await call('terminal_cwd', { id: l.id })).cwd; if (c) l.cwd = c; } catch { /* zostaje cwd początkowy */ }
    }));
    out.push({ title: tab.title, customTitle: tab.customTitle, root, active: tab.active });
  }
  const idx = Math.max(0, tabs().findIndex((x) => x.id === activeTabId()));
  return { version: 1, activeTab: idx, tabs: out };
}

export async function saveSessionNow(): Promise<void> {
  if (!tabs().length) return;
  try {
    await call('save_session', { session: await snapshot() });
    dirty = false;
  } catch (e) { toast('error', `${t().errSession}: ${errText(e)}`); }
}

export function startSessionAutosave(): void {
  setInterval(() => { if (dirty) void saveSessionNow(); }, 3000);
}

export async function restoreOrCreate(): Promise<void> {
  if (settings().restoreSession) {
    try {
      const raw = (await call('load_session')) as Partial<SessionData> | null;
      const restored: Tab[] = [];
      for (const rt of raw?.tabs ?? []) {
        const root = sanitize(rt.root);
        if (!root) continue;
        const fresh = cloneWithNewIds(root, nextPaneId);
        const ls = leaves(fresh);
        const oldLeaves = leaves(root);
        const oi = oldLeaves.findIndex((l) => l.id === rt.active);
        restored.push({ id: ++tabSeq, title: typeof rt.title === 'string' && rt.title ? rt.title : DEFAULT_TITLE(), customTitle: typeof rt.customTitle === 'string' ? rt.customTitle : undefined, root: fresh, active: ls[Math.max(0, oi)].id });
      }
      if (restored.length) {
        batch(() => {
          setTabs(restored);
          setActiveTabId(restored[Math.min(Math.max(0, raw?.activeTab ?? 0), restored.length - 1)].id);
        });
        return;
      }
    } catch { /* brak sesji — startujemy od zera */ }
  }
  newTab();
}

export const findPaneTabId = (paneId: number): number => tabs().find((x) => !!findLeaf(x.root, paneId))?.id ?? 0;
