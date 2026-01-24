import React, { useState } from 'react';
import { Plus, X, Terminal, Minus, Maximize2, Settings, Monitor, Command } from 'lucide-react';
import { Tab, AppSettings } from './types';
import { THEMES, TRANSLATIONS } from './config';
import XTermInstance from './components/XTermInstance';

const App: React.FC = () => {
    // --- State ---
    const [tabs, setTabs] = useState<Tab[]>([
        { id: 'init-1', title: 'Home', active: true }
    ]);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [settings, setSettings] = useState<AppSettings>({
        language: 'pl',
        shell: '', // Empty means auto-detect (Linux default)
    fontSize: 14,
    themeName: 'Hacker (Default)'
    });

    const t = TRANSLATIONS[settings.language];
    const currentTheme = THEMES[settings.themeName];

    // --- Handlers ---

    const createTab = () => {
        const newId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setTabs(prev => {
            const deactivated = prev.map(t => ({ ...t, active: false }));
            return [...deactivated, { id: newId, title: 'Terminal', active: true }];
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
        <div className="flex items-center justify-center w-screen h-screen overflow-hidden bg-[#0a0a0c] font-sans relative">
        <style>{`
            .drag-handle { -webkit-app-region: drag; }
            .no-drag { -webkit-app-region: no-drag; }
            .glass-panel {
                background: rgba(18, 18, 20, 0.75);
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                box-shadow:
                0 0 0 1px rgba(255, 255, 255, 0.08),
            0 20px 50px rgba(0, 0, 0, 0.5),
            0 0 100px rgba(117, 69, 230, 0.1);
            }
            .animate-fade-in { animation: fadeIn 0.2s ease-out; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

            {/* --- Aesthetic Background Effects (The "Blobs") --- */}
            <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none opacity-60" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none opacity-60" />
            <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] bg-pink-500/10 rounded-full blur-[100px] pointer-events-none opacity-40" />

            {/* --- Main Floating Container --- */}
            <div className={`
                flex flex-col relative
                transition-all duration-300 ease-out
                ${isMaximized ? 'w-full h-full rounded-none' : 'w-[92vw] h-[85vh] rounded-2xl'}
                glass-panel overflow-hidden border border-white/5
                `}>

                {/* --- Title Bar --- */}
                <div className="flex items-center h-12 px-4 border-b border-white/5 bg-white/5 select-none drag-handle z-20">

                {/* Traffic Lights */}
                <div className="flex gap-2 mr-6 no-drag group">
                <div onClick={handleClose} className="w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E] shadow-sm flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100"></div>
                <div onClick={handleMinimize} className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-[#D89E24] shadow-sm flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100"></div>
                <div onClick={handleMaximize} className="w-3 h-3 rounded-full bg-[#28C840] border border-[#1AAB29] shadow-sm flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100"></div>
                </div>

                {/* Tabs Area */}
                <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar no-drag mask-linear-fade">
                {tabs.map(tab => (
                    <div
                    key={tab.id}
                    onClick={() => activateTab(tab.id)}
                    className={`
                        group relative flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200 min-w-[120px] max-w-[180px]
                        border border-transparent
                        ${tab.active
                            ? 'bg-[#2a2a30]/60 text-gray-100 shadow-md border-white/10'
                : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}
                `}
                >
                <Terminal size={12} className={tab.active ? 'text-purple-400' : 'text-gray-600'} />
                <span className="text-xs font-mono truncate flex-1 tracking-tight">{tab.title}</span>

                <button
                onClick={(e) => closeTab(e, tab.id)}
                className={`
                    p-0.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-red-400 transition-all
                    ${tabs.length === 1 ? 'hidden' : 'opacity-0 group-hover:opacity-100'}
                    `}
                    >
                    <X size={10} />
                    </button>
                    </div>
                ))}
                </div>

                {/* Add Tab Button */}
                <button
                onClick={createTab}
                className="ml-2 p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-all no-drag active:scale-95"
                >
                <Plus size={16} />
                </button>

                {/* Settings Toggle */}
                <div className="ml-4 pl-4 border-l border-white/10 flex items-center gap-3 no-drag">
                <div
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`p-1.5 rounded-md cursor-pointer transition-colors ${settingsOpen ? 'text-purple-400 bg-purple-500/10' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                >
                <Settings size={15} />
                </div>
                </div>
                </div>

                {/* --- Settings Modal --- */}
                {settingsOpen && (
                    <div className="absolute top-14 right-4 w-72 bg-[#141417] border border-[#2a2a30] rounded-xl shadow-2xl z-50 overflow-hidden no-drag animate-fade-in">
                    <div className="flex items-center justify-between p-3 border-b border-[#2a2a30] bg-[#1a1a1d]">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Settings size={14} /> {t.settings}
                    </h3>
                    <button onClick={() => setSettingsOpen(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                    </div>

                    <div className="p-4 space-y-4">

                    {/* Language */}
                    <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.language}</label>
                    <div className="flex gap-2">
                    <button
                    onClick={() => setSettings({...settings, language: 'pl'})}
                    className={`flex-1 py-1.5 text-xs rounded border transition-colors ${settings.language === 'pl' ? 'bg-purple-600 border-purple-600 text-white' : 'border-[#333] hover:border-gray-500 text-gray-400'}`}
                    >Polski</button>
                    <button
                    onClick={() => setSettings({...settings, language: 'en'})}
                    className={`flex-1 py-1.5 text-xs rounded border transition-colors ${settings.language === 'en' ? 'bg-purple-600 border-purple-600 text-white' : 'border-[#333] hover:border-gray-500 text-gray-400'}`}
                    >English</button>
                    </div>
                    </div>

                    {/* Shell (Linux Only) */}
                    <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.shell}</label>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                    {['bash', 'zsh', '/bin/bash', '/bin/zsh'].map(s => (
                        <button
                        key={s}
                        onClick={() => setSettings({...settings, shell: s})}
                        className={`text-[10px] py-1 rounded border truncate px-1 transition-colors ${settings.shell === s ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'border-[#333] text-gray-500 hover:border-gray-600'}`}
                        >
                        {s}
                        </button>
                    ))}
                    </div>
                    <input
                    type="text"
                    value={settings.shell}
                    onChange={(e) => setSettings({...settings, shell: e.target.value})}
                    placeholder="Custom path..."
                    className="w-full bg-[#0a0a0c] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 text-gray-300 transition-colors"
                    />
                    </div>

                    {/* Theme */}
                    <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.theme}</label>
                    <select
                    value={settings.themeName}
                    onChange={(e) => setSettings({...settings, themeName: e.target.value})}
                    className="w-full bg-[#0a0a0c] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 text-gray-300"
                    >
                    {Object.keys(THEMES).map(theme => (
                        <option key={theme} value={theme}>{theme}</option>
                    ))}
                    </select>
                    </div>

                    {/* Font Size */}
                    <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.fontSize}: {settings.fontSize}px</label>
                    <input
                    type="range" min="10" max="24" step="1"
                    value={settings.fontSize}
                    onChange={(e) => setSettings({...settings, fontSize: parseInt(e.target.value)})}
                    className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    </div>

                    </div>
                    </div>
                )}

                {/* --- Terminals Area --- */}
                <div className="relative flex-1 bg-[#0a0a0c]/40 backdrop-blur-sm overflow-hidden z-10">
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
                <div className="h-7 bg-[#08080a]/80 border-t border-white/5 flex items-center px-4 justify-between text-[10px] text-gray-500 font-mono z-20 drag-handle">
                <div className="flex gap-4 items-center">
                <span className="flex items-center gap-1.5 text-green-500">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]"></div>
                {t.ready}
                </span>
                <span className="flex items-center gap-1">
                <Command size={10} />
                {settings.shell || 'bash'}
                </span>
                </div>
                <div className="flex gap-4">
                <span className="opacity-50">UTF-8</span>
                <span className="text-gray-700">|</span>
                <span className="hover:text-purple-400 cursor-pointer transition-colors">v1.2.0</span>
                </div>
                </div>

                </div>
                </div>
    );
};

export default App;
