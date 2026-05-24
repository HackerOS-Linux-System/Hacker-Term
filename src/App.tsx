import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, Terminal, Settings, Command,
  Palette, Type, Monitor, Cpu, Keyboard, FileText,
} from 'lucide-react'
import { Tab, AppSettings, FontFamily, CursorStyle } from './types'
import { THEMES, TRANSLATIONS, DEFAULT_SETTINGS, settingsFromHk, settingsToHk } from './config'
import XTermInstance from './components/XTermInstance'
import { windowMinimize, windowMaximize, windowClose, loadConfig, saveConfig } from './services/tauriApi'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const genId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

// ──────────────────────────────────────────────
// App
// ──────────────────────────────────────────────
const App: React.FC = () => {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: genId(), title: 'zsh', active: true },
  ])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'terminal' | 'shortcuts' | 'about'>('appearance')
  const [isMaximized, setIsMaximized] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [configLoaded, setConfigLoaded] = useState(false)

  const t = TRANSLATIONS[settings.language]
  const currentTheme = THEMES[settings.themeName] ?? THEMES['Hacker (Default)']

  // ── Load .hk config on mount ──
  useEffect(() => {
    loadConfig()
      .then((raw) => {
        setSettings(settingsFromHk(raw as Record<string, Record<string, unknown>>))
        setConfigLoaded(true)
      })
      .catch(() => {
        setConfigLoaded(true) // use defaults
      })
  }, [])

  // ── Persist settings to .hk on every change (debounced) ──
  useEffect(() => {
    if (!configLoaded) return
    const timer = setTimeout(() => {
      saveConfig(settingsToHk(settings) as Record<string, Record<string, unknown>>).catch(() => {})
    }, 600)
    return () => clearTimeout(timer)
  }, [settings, configLoaded])

  // ──────────────────────────────────────────────
  // Tab management
  // ──────────────────────────────────────────────
  const createTab = useCallback(() => {
    const newId = genId()
    setTabs((prev) => [
      ...prev.map((t) => ({ ...t, active: false })),
      { id: newId, title: 'zsh', active: true },
    ])
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex((t) => t.id === id)
      const remaining = prev.filter((t) => t.id !== id)
      if (prev[idx]?.active && remaining.length > 0) {
        const newIdx = Math.min(idx, remaining.length - 1)
        remaining[newIdx] = { ...remaining[newIdx], active: true }
      }
      return remaining
    })
  }, [])

  const activateTab = useCallback((id: string) => {
    setTabs((prev) => prev.map((t) => ({ ...t, active: t.id === id })))
  }, [])

  const activeTabId = tabs.find((t) => t.active)?.id

  // ──────────────────────────────────────────────
  // Global keyboard shortcuts
  // ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+T → New tab
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyT') {
        e.preventDefault()
        createTab()
        return
      }
      // Ctrl+W → Close active tab
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyW') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
        return
      }
      // Ctrl+Shift+C and Ctrl+Shift+V are handled inside XTermInstance
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createTab, closeTab, activeTabId])

  // ──────────────────────────────────────────────
  // Window controls
  // ──────────────────────────────────────────────
  const handleMinimize = () => windowMinimize()
  const handleMaximize = () => {
    windowMaximize()
    setIsMaximized((v) => !v)
  }
  const handleClose = () => windowClose()

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-transparent font-sans relative select-none">
      <style>{`
        .drag-handle { -webkit-app-region: drag; }
        .no-drag { -webkit-app-region: no-drag; }
        .glass-panel {
          background: rgba(10, 10, 12, ${settings.opacity});
          backdrop-filter: blur(${settings.blur}px);
          -webkit-backdrop-filter: blur(${settings.blur}px);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.07),
                      0 25px 50px -12px rgba(0,0,0,0.6);
        }
        .animate-slide-in {
          animation: slideIn 0.18s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
        input[type=range] { -webkit-appearance: none; background: transparent; width: 100%; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 15px; width: 15px; border-radius: 50%;
          background: #a855f7; cursor: pointer; margin-top: -5.5px;
          box-shadow: 0 0 8px rgba(168,85,247,0.6);
        }
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%; height: 3px; cursor: pointer;
          background: #2a2a35; border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `}</style>

      {/* ── Main glass container ── */}
      <div
        className={`flex flex-col w-full h-full glass-panel overflow-hidden border border-white/5 transition-all duration-300 ${
          isMaximized ? 'rounded-none' : 'rounded-xl'
        }`}
      >
        {/* ── Title Bar ── */}
        <div className="flex items-center h-10 px-3 border-b border-white/5 bg-black/20 drag-handle z-20 flex-shrink-0">
          {/* Traffic lights */}
          <div className="flex gap-1.5 mr-5 no-drag">
            <button onClick={handleClose}    className="w-3 h-3 rounded-full bg-[#FF5F57] hover:brightness-110 transition-all" title="Close" />
            <button onClick={handleMinimize} className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:brightness-110 transition-all" title="Minimize" />
            <button onClick={handleMaximize} className="w-3 h-3 rounded-full bg-[#28C840] hover:brightness-110 transition-all" title="Maximize" />
          </div>

          {/* Tabs */}
          <div className="flex-1 flex items-center h-full gap-1 overflow-x-auto no-scrollbar no-drag">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => activateTab(tab.id)}
                className={`group relative flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono cursor-pointer transition-all rounded-md min-w-[110px] max-w-[170px] h-7 ${
                  tab.active
                    ? 'bg-white/10 text-white ring-1 ring-white/10'
                    : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                }`}
              >
                <Terminal size={10} className={tab.active ? 'text-purple-400 flex-shrink-0' : 'opacity-40 flex-shrink-0'} />
                <span className="truncate flex-1">{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-all flex-shrink-0"
                    title="Close tab (Ctrl+W)"
                  >
                    <X size={9} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={createTab}
              title="New tab (Ctrl+T)"
              className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors ml-0.5 no-drag flex-shrink-0"
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Settings toggle */}
          <div className="ml-3 pl-3 border-l border-white/10 no-drag flex-shrink-0">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className={`p-1.5 rounded-md transition-all duration-200 ${
                settingsOpen
                  ? 'text-purple-400 bg-purple-500/10 rotate-90'
                  : 'text-gray-500 hover:text-white hover:bg-white/10'
              }`}
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* ── Settings Panel ── */}
        {settingsOpen && (
          <div className="absolute top-12 right-4 w-[420px] h-[520px] bg-[#101012] border border-[#252528] rounded-xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] z-50 overflow-hidden no-drag animate-slide-in flex">
            {/* Sidebar */}
            <div className="w-12 bg-[#161618] border-r border-[#252528] flex flex-col items-center py-4 gap-3 flex-shrink-0">
              {[
                { key: 'appearance', icon: <Palette size={17} />, label: t.appearance },
                { key: 'terminal',   icon: <Type size={17} />,    label: t.terminal },
                { key: 'shortcuts',  icon: <Keyboard size={17} />, label: t.shortcuts },
                { key: 'about',      icon: <Monitor size={17} />, label: t.about },
              ].map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => setSettingsTab(key as typeof settingsTab)}
                  title={label}
                  className={`p-2 rounded-lg transition-colors ${
                    settingsTab === key
                      ? 'bg-purple-600/20 text-purple-400'
                      : 'text-gray-600 hover:text-gray-300'
                  }`}
                >
                  {icon}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-2 text-gray-700 hover:text-red-400 transition-colors"
                title="Close"
              >
                <X size={17} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
              <h2 className="text-sm font-bold text-white mb-5 flex items-center gap-2">
                {settingsTab === 'appearance' && <><Palette size={15} className="text-purple-500" /> {t.appearance}</>}
                {settingsTab === 'terminal'   && <><Type size={15} className="text-purple-500" /> {t.terminal}</>}
                {settingsTab === 'shortcuts'  && <><Keyboard size={15} className="text-purple-500" /> {t.shortcuts}</>}
                {settingsTab === 'about'      && <><Monitor size={15} className="text-purple-500" /> {t.about}</>}
              </h2>

              {/* ── Appearance ── */}
              {settingsTab === 'appearance' && (
                <div className="space-y-5">
                  {/* Theme */}
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.theme}</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {Object.keys(THEMES).map((theme) => (
                        <button
                          key={theme}
                          onClick={() => setSettings({ ...settings, themeName: theme })}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs transition-all ${
                            settings.themeName === theme
                              ? 'bg-white/8 border-purple-500/60 text-white'
                              : 'border-[#2a2a2e] text-gray-400 hover:bg-white/4 hover:border-[#444]'
                          }`}
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: THEMES[theme].cursor }}
                          />
                          <span>{theme}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opacity */}
                  <SliderRow
                    label={t.opacity}
                    value={`${Math.round(settings.opacity * 100)}%`}
                  >
                    <input
                      type="range" min="0.6" max="1" step="0.01"
                      value={settings.opacity}
                      onChange={(e) => setSettings({ ...settings, opacity: parseFloat(e.target.value) })}
                    />
                  </SliderRow>

                  {/* Blur */}
                  <SliderRow label={t.blur} value={`${settings.blur}px`}>
                    <input
                      type="range" min="0" max="40" step="1"
                      value={settings.blur}
                      onChange={(e) => setSettings({ ...settings, blur: parseInt(e.target.value) })}
                    />
                  </SliderRow>
                </div>
              )}

              {/* ── Terminal ── */}
              {settingsTab === 'terminal' && (
                <div className="space-y-5">
                  {/* Font size */}
                  <SliderRow label={t.fontSize} value={`${settings.fontSize}px`}>
                    <input
                      type="range" min="10" max="32" step="1"
                      value={settings.fontSize}
                      onChange={(e) => setSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                    />
                  </SliderRow>

                  {/* Font family */}
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.fontFamily}</label>
                    <select
                      value={settings.fontFamily}
                      onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value as FontFamily })}
                      className="w-full bg-[#18181b] border border-[#333] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500 transition-colors"
                    >
                      <option value='"Fira Code", monospace'>Fira Code</option>
                      <option value='"JetBrains Mono", monospace'>JetBrains Mono</option>
                      <option value='"Hack", monospace'>Hack</option>
                      <option value="monospace">System Monospace</option>
                    </select>
                  </div>

                  {/* Cursor style */}
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.cursorStyle}</label>
                    <div className="flex gap-2">
                      {(['block', 'bar', 'underline'] as CursorStyle[]).map((style) => (
                        <button
                          key={style}
                          onClick={() => setSettings({ ...settings, cursorStyle: style })}
                          className={`flex-1 py-1.5 text-xs rounded-lg border capitalize transition-colors ${
                            settings.cursorStyle === style
                              ? 'bg-purple-600/20 border-purple-500/60 text-purple-300'
                              : 'border-[#2a2a2e] text-gray-500 hover:border-[#444]'
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cursor blink */}
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.cursorBlink}</label>
                    <button
                      onClick={() => setSettings({ ...settings, cursorBlink: !settings.cursorBlink })}
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        settings.cursorBlink ? 'bg-purple-600' : 'bg-[#2a2a2e]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                          settings.cursorBlink ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Padding */}
                  <SliderRow label={t.padding} value={`${settings.padding}px`}>
                    <input
                      type="range" min="0" max="50" step="2"
                      value={settings.padding}
                      onChange={(e) => setSettings({ ...settings, padding: parseInt(e.target.value) })}
                    />
                  </SliderRow>
                </div>
              )}

              {/* ── Shortcuts ── */}
              {settingsTab === 'shortcuts' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-gray-600 mb-4">
                    {settings.language === 'pl'
                      ? 'Wbudowane skróty klawiszowe HackerTerm'
                      : 'Built-in HackerTerm keyboard shortcuts'}
                  </p>
                  {[
                    { keys: ['Ctrl', 'T'],              desc: settings.language === 'pl' ? 'Nowa karta' : 'New tab' },
                    { keys: ['Ctrl', 'W'],              desc: settings.language === 'pl' ? 'Zamknij kartę' : 'Close tab' },
                    { keys: ['Ctrl', 'Shift', 'C'],     desc: settings.language === 'pl' ? 'Kopiuj zaznaczenie' : 'Copy selection' },
                    { keys: ['Ctrl', 'Shift', 'V'],     desc: settings.language === 'pl' ? 'Wklej ze schowka' : 'Paste from clipboard' },
                  ].map(({ keys, desc }) => (
                    <div key={desc} className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-xs text-gray-400">{desc}</span>
                      <div className="flex gap-1">
                        {keys.map((k) => (
                          <kbd
                            key={k}
                            className="px-2 py-0.5 text-[10px] bg-[#1e1e22] border border-[#333] rounded text-gray-300 font-mono"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 p-3 bg-purple-900/10 border border-purple-900/30 rounded-lg">
                    <p className="text-[10px] text-purple-400 flex items-center gap-1.5">
                      <FileText size={11} />
                      {t.configFile}:
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono mt-1 break-all">
                      ~/.config/HackerOS/Hacker-Term/config.hk
                    </p>
                  </div>
                </div>
              )}

              {/* ── About ── */}
              {settingsTab === 'about' && (
                <div className="space-y-4">
                  <div className="p-4 bg-white/4 rounded-xl border border-white/6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
                        <Terminal size={16} className="text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-sm">HackerTerm</h3>
                        <p className="text-[10px] text-gray-500">v0.8.0 · Tauri 2 + Rust</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {settings.language === 'pl'
                        ? 'Wysokiej jakości emulator terminala zbudowany dla estetyki HackerOS. Backend oparty na Rust i Tauri.'
                        : 'A high-fidelity terminal emulator built for the HackerOS aesthetic. Rust + Tauri backend.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.language}</label>
                    <div className="flex gap-2">
                      {(['pl', 'en'] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setSettings({ ...settings, language: lang })}
                          className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                            settings.language === lang
                              ? 'bg-purple-600 border-purple-600 text-white'
                              : 'border-[#2a2a2e] text-gray-400 hover:border-[#444]'
                          }`}
                        >
                          {lang === 'pl' ? 'Polski' : 'English'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-[#0d0d10] rounded-lg border border-[#1e1e22] space-y-1">
                    <p className="text-[10px] text-gray-600 font-mono">Shell: zsh (default)</p>
                    <p className="text-[10px] text-gray-600 font-mono">Config: .hk format</p>
                    <p className="text-[10px] text-gray-600 font-mono">Backend: Rust + portable-pty</p>
                    <p className="text-[10px] text-gray-600 font-mono">Frontend: React + xterm.js</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Terminals area ── */}
        <div className="relative flex-1 bg-transparent overflow-hidden z-10">
          {tabs.map((tab) => (
            <XTermInstance
              key={tab.id}
              id={tab.id}
              isActive={tab.active}
              settings={settings}
              theme={currentTheme}
              onExit={() => closeTab(tab.id)}
            />
          ))}
        </div>

        {/* ── Status bar ── */}
        <div className="h-6 bg-black/40 border-t border-white/5 flex items-center px-4 justify-between text-[10px] text-gray-600 font-mono z-20 drag-handle flex-shrink-0">
          <div className="flex gap-4 items-center">
            <span className="flex items-center gap-1.5 text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px_#22c55e]" />
              {t.ready}
            </span>
            <span className="flex items-center gap-1 text-gray-500">
              <Command size={9} />
              zsh
            </span>
          </div>
          <div className="flex gap-3 items-center">
            <span className="text-gray-700">HackerTerm v0.8.0</span>
            <span className="opacity-25">|</span>
            <span className="opacity-40">UTF-8</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reusable slider row ──
const SliderRow: React.FC<{
  label: string
  value: string
  children: React.ReactNode
}> = ({ label, value, children }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{label}</label>
      <span className="text-[10px] text-purple-400 font-mono">{value}</span>
    </div>
    {children}
  </div>
)

export default App
