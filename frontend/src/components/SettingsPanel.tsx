import { For, Show, createSignal } from 'solid-js';
import { settings, t, theme, updateSettings } from '../store';
import { CUSTOM_THEME_NAME, DEFAULT_SHORTCUTS, FONT_CHOICES, THEMES, THEME_COLOR_KEYS } from '../config';
import { LOCALES } from '../locales';
import { formatEvent } from '../utils/keybinding';
import { setSettingsOpen } from './TabBar';
import type { CursorStyle, ShortcutAction, TerminalTheme } from '../types';

/** id akcji, której skrót jest właśnie nagrywany (globalny handler klawiszy wtedy nie reaguje) */
export const [capturing, setCapturing] = createSignal<ShortcutAction | null>(null);

type Page = 'appearance' | 'terminal' | 'shortcuts' | 'about';

function Stepper(props: { label: string; value: number; min: number; max: number; step: number; fmt?: (n: number) => string; onChange: (n: number) => void }) {
  const set = (v: number) => props.onChange(Math.round(Math.min(props.max, Math.max(props.min, v)) * 1000) / 1000);
  return (
    <div class="row-setting">
      <span class="label">{props.label}</span>
      <div class="stepper">
        <button class="icon-btn" onClick={() => set(props.value - props.step)}>−</button>
        <span class="value">{props.fmt ? props.fmt(props.value) : props.value}</span>
        <button class="icon-btn" onClick={() => set(props.value + props.step)}>+</button>
      </div>
    </div>
  );
}

function Toggle(props: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <div class="row-setting">
      <span class="label">{props.label}</span>
      <button class="switch" classList={{ on: props.value }} onClick={() => props.onChange(!props.value)}><span class="knob" /></button>
    </div>
  );
}

const SHORTCUT_ORDER: ShortcutAction[] = ['newTab', 'closeTab', 'nextTab', 'prevTab', 'splitRight', 'splitDown', 'closePane', 'nextPane', 'prevPane', 'copy', 'paste', 'search'];
const COLOR_RE = /^(#[0-9a-fA-F]{6}|rgba?\([^)]*\))$/;

export default function SettingsPanel() {
  const [page, setPage] = createSignal<Page>('appearance');
  const [editTheme, setEditTheme] = createSignal(false);

  const startCustom = () => {
    const base = theme();
    updateSettings({ customTheme: { ...base, name: CUSTOM_THEME_NAME }, themeName: CUSTOM_THEME_NAME });
    setEditTheme(true);
  };
  const setColor = (k: keyof TerminalTheme, v: string) => {
    const cur = settings().customTheme;
    if (cur && COLOR_RE.test(v.trim())) updateSettings({ customTheme: { ...cur, [k]: v.trim() } });
  };

  const pages: Array<[Page, () => string]> = [['appearance', () => t().appearance], ['terminal', () => t().terminal], ['shortcuts', () => t().shortcuts], ['about', () => t().about]];

  return (
    <div class="settings" onMouseDown={(e) => e.stopPropagation()}>
      <div class="settings-head">
        <h3>{t().settings}</h3>
        <button class="icon-btn" onClick={() => { setCapturing(null); setSettingsOpen(false); }}>×</button>
      </div>
      <div class="settings-tabs">
        <For each={pages}>{([id, label]) => <button class="seg" classList={{ on: page() === id }} onClick={() => setPage(id)}>{label()}</button>}</For>
      </div>
      <div class="settings-body">
        <Show when={page() === 'appearance'}>
          <div class="group">
            <span class="label">{t().language}</span>
            <div class="chips">
              <For each={LOCALES}>{(l) => <button class="chip" classList={{ on: settings().language === l.code }} onClick={() => updateSettings({ language: l.code })}>{l.flag} {l.name}</button>}</For>
            </div>
          </div>
          <div class="group">
            <span class="label">{t().theme}</span>
            <div class="chips">
              <For each={[...Object.keys(THEMES), ...(settings().customTheme ? [CUSTOM_THEME_NAME] : [])]}>
                {(name) => <button class="chip" classList={{ on: settings().themeName === name }} onClick={() => updateSettings({ themeName: name })}>{name}</button>}
              </For>
              <Show when={!settings().customTheme}><button class="chip" onClick={startCustom}>+ {t().customTheme}</button></Show>
            </div>
            <Show when={settings().customTheme}>
              <button class="btn small" onClick={() => setEditTheme(!editTheme())}>{t().editTheme}</button>
              <button class="btn small" onClick={() => { updateSettings({ customTheme: null, themeName: 'Hacker (Default)' }); setEditTheme(false); }}>{t().resetTheme}</button>
            </Show>
            <Show when={editTheme() && settings().customTheme}>
              <div class="colors">
                <For each={[...THEME_COLOR_KEYS]}>
                  {(k) => (
                    <div class="color-row">
                      <span class="swatch" style={{ background: settings().customTheme![k] }} />
                      <span class="color-name">{k}</span>
                      <input class="field mini" value={settings().customTheme![k]} onInput={(e) => setColor(k, e.currentTarget.value)} />
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
          <Stepper label={t().opacity} value={settings().opacity} min={0.3} max={1} step={0.05} fmt={(n) => `${Math.round(n * 100)}%`} onChange={(n) => updateSettings({ opacity: n })} />
          <Stepper label={t().blur} value={settings().blur} min={0} max={40} step={2} fmt={(n) => `${n}px`} onChange={(n) => updateSettings({ blur: n })} />
        </Show>

        <Show when={page() === 'terminal'}>
          <Stepper label={t().fontSize} value={settings().fontSize} min={10} max={32} step={1} fmt={(n) => `${n}px`} onChange={(n) => updateSettings({ fontSize: n })} />
          <div class="group">
            <span class="label">{t().fontFamily}</span>
            <div class="chips">
              <For each={FONT_CHOICES}>{(f) => <button class="chip" classList={{ on: settings().fontFamily === f }} onClick={() => updateSettings({ fontFamily: f })}>{f}</button>}</For>
            </div>
            <input class="field" value={settings().fontFamily} onChange={(e) => e.currentTarget.value.trim() && updateSettings({ fontFamily: e.currentTarget.value.trim() })} />
          </div>
          <Stepper label={t().padding} value={settings().padding} min={0} max={50} step={2} fmt={(n) => `${n}px`} onChange={(n) => updateSettings({ padding: n })} />
          <div class="group">
            <span class="label">{t().cursorStyle}</span>
            <div class="chips">
              <For each={['block', 'underline', 'bar'] as CursorStyle[]}>{(c) => <button class="chip" classList={{ on: settings().cursorStyle === c }} onClick={() => updateSettings({ cursorStyle: c })}>{c}</button>}</For>
            </div>
          </div>
          <Toggle label={t().cursorBlink} value={settings().cursorBlink} onChange={(b) => updateSettings({ cursorBlink: b })} />
          <div class="group">
            <span class="label">{t().shell}</span>
            <input class="field" value={settings().shell} onChange={(e) => e.currentTarget.value.trim() && updateSettings({ shell: e.currentTarget.value.trim() })} />
          </div>
          <Stepper label={t().scrollback} value={settings().scrollback} min={0} max={100000} step={1000} onChange={(n) => updateSettings({ scrollback: n })} />
          <Toggle label={t().restoreSession} value={settings().restoreSession} onChange={(b) => updateSettings({ restoreSession: b })} />
        </Show>

        <Show when={page() === 'shortcuts'}>
          <p class="hint">{t().shortcutsHint}</p>
          <For each={SHORTCUT_ORDER}>
            {(a) => (
              <div class="row-setting">
                <span class="label">{t()[a]}</span>
                <div class="keys">
                  <button class="keybtn" classList={{ rec: capturing() === a }} onClick={() => setCapturing(capturing() === a ? null : a)}>
                    {capturing() === a ? t().pressKeys : settings().shortcuts[a]}
                  </button>
                  <Show when={settings().shortcuts[a] !== DEFAULT_SHORTCUTS[a]}>
                    <button class="icon-btn" title={t().resetKey} onClick={() => updateSettings({ shortcuts: { ...settings().shortcuts, [a]: DEFAULT_SHORTCUTS[a] } })}>↺</button>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </Show>

        <Show when={page() === 'about'}>
          <p class="about-title">HackerTerm 1.0</p>
          <p class="hint">{t().aboutText}</p>
          <p class="hint">{t().configFile}: ~/.config/HackerOS/Hacker-Term/config.hk</p>
        </Show>
      </div>
    </div>
  );
}

/** Wywoływane z globalnego handlera klawiszy, gdy nagrywamy skrót. Zwraca true, jeśli zdarzenie zostało zużyte. */
export function captureShortcut(e: KeyboardEvent): boolean {
  const action = capturing();
  if (!action) return false;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { setCapturing(null); return true; }
  const combo = formatEvent(e);
  if (combo) {
    updateSettings({ shortcuts: { ...settings().shortcuts, [action]: combo } });
    setCapturing(null);
  }
  return true;
}
