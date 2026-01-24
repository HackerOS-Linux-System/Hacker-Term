import React, { useState } from 'react';
import { Plus, X, Terminal, Settings, Command, Palette, Type, Monitor, Cpu } from 'lucide-react';
import { Tab, AppSettings, FontFamily, CursorStyle } from './types';
import { THEMES, TRANSLATIONS } from './config';
import XTermInstance from './components/XTermInstance';

const App: React.FC = () => {
    // --- State ---
    const [tabs, setTabs] = useState<Tab[]>([
        { id: 'init-1', title: 'Home', active: true }
    ]);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'appearance' | 'terminal' | 'about'>('appearance');
    const [isMaximized, setIsMaximized] = useState(false);

    const [settings, setSettings] = useState<AppSettings>({
        language: 'pl',
        fontSize: 14,
        themeName: 'Hacker (Default)',
                                                          opacity: 0.9,
                                                          blur: 16,
                                                          padding: 20,
                                                          cursorStyle: 'block',
                                                          cursorBlink: true,
                                                          fontFamily: '"Fira Code", monospace'
    });

    const t = TRANSLATIONS[settings.language];
    const currentTheme = THEMES[settings.themeName];

    // --- Handlers ---

    const createTab = () => {
        const newId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setTabs(prev => {
            const deactivated = prev.map(t => ({ ...t, active: false }));
            return [...deactivated, { id: newId, title: 'zsh', active: true }];
        });
    };

    const closeTab = (e: React.MouseEvent | null, id: string) => {
        if (e) e.stopPropagation();

        setTabs(prev => {
            if (prev.length <= 1) return prev;

            const closingIndex = prev.findIndex(t => t.id === id);
            const remaining = prev.filter(t => t.id !== id);

            if (prev[closingIndex].active) {
                const newActiveIndex = closingIndex > 0 ? closingIndex - 1 : 0;
                if (remaining[newActiveIndex]) {
                    remaining[newActiveIndex].active = true;
                }
            }
            return remaining;
        });
    };

    const activateTab = (id: string) => {
        setTabs(prev => prev.map(t => ({ ...t, active: t.id === id })));
    };

    // --- Electron Controls ---
    const handleMinimize = () => window.electronAPI?.minimize();
    const handleMaximize = () => {
        window.electronAPI?.maximize();
        setIsMaximized(!isMaximized);
    };
    const handleClose = () => window.electronAPI?.close();

    return (
        <div className="flex flex-col w-screen h-screen overflow-hidden bg-transparent font-sans relative">
        <style>{`
            .drag-handle { -webkit-app-region: drag; }
            .no-drag { -webkit-app-region: no-drag; }
            .glass-panel {
                background: rgba(10, 10, 12, ${settings.opacity});
                backdrop-filter: blur(${settings.blur}px);
                -webkit-backdrop-filter: blur(${settings.blur}px);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            }
            .animate-slide-in { animation: slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
            @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

            /* Custom Range Slider */
            input[type=range] {
                -webkit-appearance: none;
                background: transparent;
            }
            input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none;
                height: 16px;
                width: 16px;
                border-radius: 50%;
                background: #a855f7;
                cursor: pointer;
                margin-top: -6px;
                box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
            }
            input[type=range]::-webkit-slider-runnable-track {
                width: 100%;
                height: 4px;
                cursor: pointer;
                background: #333;
                border-radius: 2px;
            }
            `}</style>

            {/* --- Main Container --- */}
            <div className={`
                flex flex-col w-full h-full
                glass-panel overflow-hidden
                ${isMaximized ? 'rounded-none' : 'rounded-lg'}
                border border-white/5 transition-all duration-300
                `}>

                {/* --- Title Bar --- */}
                <div className="flex items-center h-10 px-4 border-b border-white/5 bg-[#000000]/20 select-none drag-handle z-20">

                {/* Traffic Lights */}
                <div className="flex gap-2 mr-6 no-drag group opacity-80 hover:opacity-100 transition-opacity">
                <div onClick={handleClose} className="w-3 h-3 rounded-full bg-[#FF5F57] hover:bg-[#ff3b30] shadow-sm flex items-center justify-center cursor-pointer"></div>
                <div onClick={handleMinimize} className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#fc0] shadow-sm flex items-center justify-center cursor-pointer"></div>
                <div onClick={handleMaximize} className="w-3 h-3 rounded-full bg-[#28C840] hover:bg-[#34c759] shadow-sm flex items-center justify-center cursor-pointer"></div>
                </div>

                {/* Tabs Area */}
                <div className="flex-1 flex items-center h-full gap-1 overflow-x-auto no-scrollbar no-drag">
                {tabs.map(tab => (
                    <div
                    key={tab.id}
                    onClick={() => activateTab(tab.id)}
                    className={`
                        group relative flex items-center gap-2 px-3 py-1 text-xs font-mono cursor-pointer transition-all rounded-md min-w-[120px] max-w-[180px] h-[28px]
                        ${tab.active
                            ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}
                `}
                >
                <Terminal size={11} className={tab.active ? 'text-purple-400' : 'opacity-40'} />
                <span className="truncate flex-1">{tab.title}</span>
                <button
                onClick={(e) => closeTab(e, tab.id)}
                className={`p-0.5 rounded-full hover:bg-red-500/20 hover:text-red-400 ${tabs.length === 1 ? 'hidden' : 'opacity-0 group-hover:opacity-100'}`}
                >
                <X size={10} />
                </button>
                </div>
                ))}

                <button
                onClick={createTab}
                className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors ml-1"
                >
                <Plus size={14} />
                </button>
                </div>

                {/* Settings Toggle */}
                <div className="ml-4 pl-4 border-l border-white/10 flex items-center gap-3 no-drag">
                <div
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`p-1.5 rounded-md cursor-pointer transition-all duration-200 ${settingsOpen ? 'text-purple-400 bg-purple-500/10 rotate-90' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                >
                <Settings size={15} />
                </div>
                </div>
                </div>

                {/* --- Settings Modal (Overhauled) --- */}
                {settingsOpen && (
                    <div className="absolute top-12 right-4 w-[400px] h-[500px] bg-[#101012] border border-[#2a2a30] rounded-xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)] z-50 overflow-hidden no-drag animate-slide-in flex flex-row">

                    {/* Sidebar */}
                    <div className="w-12 bg-[#18181b] border-r border-[#2a2a30] flex flex-col items-center py-4 gap-4">
                    <button
                    onClick={() => setSettingsTab('appearance')}
                    title={t.appearance}
                    className={`p-2 rounded-lg transition-colors ${settingsTab === 'appearance' ? 'bg-purple-600/20 text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                    <Palette size={18} />
                    </button>
                    <button
                    onClick={() => setSettingsTab('terminal')}
                    title={t.terminal}
                    className={`p-2 rounded-lg transition-colors ${settingsTab === 'terminal' ? 'bg-purple-600/20 text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                    <Type size={18} />
                    </button>
                    <button
                    onClick={() => setSettingsTab('about')}
                    title={t.about}
                    className={`p-2 rounded-lg transition-colors ${settingsTab === 'about' ? 'bg-purple-600/20 text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                    <Monitor size={18} />
                    </button>

                    <div className="flex-1" />
                    <button onClick={() => setSettingsOpen(false)} className="p-2 text-gray-600 hover:text-red-400 transition-colors">
                    <X size={18} />
                    </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                    <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    {settingsTab === 'appearance' && <><Palette size={18} className="text-purple-500"/> {t.appearance}</>}
                    {settingsTab === 'terminal' && <><Type size={18} className="text-purple-500"/> {t.terminal}</>}
                    {settingsTab === 'about' && <><Monitor size={18} className="text-purple-500"/> {t.about}</>}
                    </h2>

                    {settingsTab === 'appearance' && (
                        <div className="space-y-6">

                        {/* Theme */}
                        <div className="space-y-2">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.theme}</label>
                        <div className="grid grid-cols-1 gap-2">
                        {Object.keys(THEMES).map(theme => (
                            <button
                            key={theme}
                            onClick={() => setSettings({...settings, themeName: theme})}
                            className={`flex items-center gap-3 px-3 py-2 rounded border transition-all ${settings.themeName === theme ? 'bg-white/10 border-purple-500 text-white' : 'border-[#333] text-gray-400 hover:bg-white/5'}`}
                            >
                            <div className="w-3 h-3 rounded-full" style={{ background: THEMES[theme].cursor }}></div>
                            <span className="text-xs">{theme}</span>
                            </button>
                        ))}
                        </div>
                        </div>

                        {/* Opacity */}
                        <div className="space-y-2">
                        <div className="flex justify-between">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.opacity}</label>
                        <span className="text-xs text-purple-400">{Math.round(settings.opacity * 100)}%</span>
                        </div>
                        <input
                        type="range" min="0.5" max="1" step="0.01"
                        value={settings.opacity}
                        onChange={(e) => setSettings({...settings, opacity: parseFloat(e.target.value)})}
                        className="w-full"
                        />
                        </div>

                        {/* Blur */}
                        <div className="space-y-2">
                        <div className="flex justify-between">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.blur}</label>
                        <span className="text-xs text-purple-400">{settings.blur}px</span>
                        </div>
                        <input
                        type="range" min="0" max="40" step="1"
                        value={settings.blur}
                        onChange={(e) => setSettings({...settings, blur: parseInt(e.target.value)})}
                        className="w-full"
                        />
                        </div>

                        </div>
                    )}

                    {settingsTab === 'terminal' && (
                        <div className="space-y-6">
                        {/* Font Size */}
                        <div className="space-y-2">
                        <div className="flex justify-between">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.fontSize}</label>
                        <span className="text-xs text-purple-400">{settings.fontSize}px</span>
                        </div>
                        <input
                        type="range" min="10" max="32" step="1"
                        value={settings.fontSize}
                        onChange={(e) => setSettings({...settings, fontSize: parseInt(e.target.value)})}
                        className="w-full"
                        />
                        </div>

                        {/* Font Family */}
                        <div className="space-y-2">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.fontFamily}</label>
                        <select
                        value={settings.fontFamily}
                        onChange={(e) => setSettings({...settings, fontFamily: e.target.value as FontFamily})}
                        className="w-full bg-[#18181b] border border-[#333] rounded px-2 py-2 text-xs focus:outline-none focus:border-purple-500 text-gray-300"
                        >
                        <option value='"Fira Code", monospace'>Fira Code</option>
                        <option value='"JetBrains Mono", monospace'>JetBrains Mono</option>
                        <option value='"Hack", monospace'>Hack</option>
                        <option value='monospace'>System Monospace</option>
                        </select>
                        </div>

                        {/* Cursor Style */}
                        <div className="space-y-2">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.cursorStyle}</label>
                        <div className="flex gap-2">
                        {(['block', 'bar', 'underline'] as CursorStyle[]).map(style => (
                            <button
                            key={style}
                            onClick={() => setSettings({...settings, cursorStyle: style})}
                            className={`flex-1 py-2 text-xs rounded border capitalize transition-colors ${settings.cursorStyle === style ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'border-[#333] text-gray-500 hover:border-gray-500'}`}
                            >
                            {style}
                            </button>
                        ))}
                        </div>
                        </div>

                        {/* Padding */}
                        <div className="space-y-2">
                        <div className="flex justify-between">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.padding}</label>
                        <span className="text-xs text-purple-400">{settings.padding}px</span>
                        </div>
                        <input
                        type="range" min="0" max="50" step="5"
                        value={settings.padding}
                        onChange={(e) => setSettings({...settings, padding: parseInt(e.target.value)})}
                        className="w-full"
                        />
                        </div>
                        </div>
                    )}

                    {settingsTab === 'about' && (
                        <div className="space-y-4 text-gray-400 text-xs">
                        <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                        <h3 className="text-white font-bold mb-2">HackerTerm</h3>
                        <p className="mb-2">A high-fidelity terminal emulator built for Linux aesthetics.</p>
                        <p>Version: 1.0.0-dist</p>
                        </div>

                        <div className="space-y-2">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t.language}</label>
                        <div className="flex gap-2">
                        <button onClick={() => setSettings({...settings, language: 'pl'})} className={`flex-1 py-1.5 text-xs rounded border transition-colors ${settings.language === 'pl' ? 'bg-purple-600 border-purple-600 text-white' : 'border-[#333] hover:border-gray-500 text-gray-400'}`}>Polski</button>
                        <button onClick={() => setSettings({...settings, language: 'en'})} className={`flex-1 py-1.5 text-xs rounded border transition-colors ${settings.language === 'en' ? 'bg-purple-600 border-purple-600 text-white' : 'border-[#333] hover:border-gray-500 text-gray-400'}`}>English</button>
                        </div>
                        </div>
                        </div>
                    )}
                    </div>
                    </div>
                )}

                {/* --- Terminals Area --- */}
                <div className="relative flex-1 bg-transparent overflow-hidden z-10" style={{ padding: 0 }}>
                {tabs.map(tab => (
                    <XTermInstance
                    key={tab.id}
                    isActive={tab.active}
                    settings={settings}
                    theme={currentTheme}
                    onExit={() => closeTab(null, tab.id)}
                    />
                ))}
                </div>

                {/* --- Footer --- */}
                <div className="h-6 bg-[#000000]/40 border-t border-white/5 flex items-center px-4 justify-between text-[10px] text-gray-500 font-mono z-20 drag-handle">
                <div className="flex gap-4 items-center">
                <span className="flex items-center gap-1.5 text-green-500">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]"></div>
                {t.ready}
                </span>
                <span className="flex items-center gap-1 text-gray-400">
                <Command size={10} />
                zsh (Locked)
                </span>
                </div>
                <div className="flex gap-4 items-center">
                <span className="flex items-center gap-1"><Cpu size={10}/> 12%</span>
                <span className="opacity-30">|</span>
                <span className="opacity-50">UTF-8</span>
                </div>
                </div>

                </div>
                </div>
    );
};

export default App;
