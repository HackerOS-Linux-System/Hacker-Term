import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { AppSettings, TerminalTheme } from '../types';

interface XTermInstanceProps {
    isActive: boolean;
    settings: AppSettings;
    theme: TerminalTheme;
    onExit?: () => void;
}

const XTermInstance: React.FC<XTermInstanceProps> = ({ isActive, settings, theme, onExit }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const idRef = useRef<string>(Math.random().toString(36).substr(2, 9));

    // 1. Initialize Terminal & PTY (Only once on mount)
    useEffect(() => {
        if (!terminalRef.current) return;
        const termId = idRef.current;

        // --- Init XTerm ---
        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            fontSize: settings.fontSize,
            fontFamily: '"Fira Code", monospace',
            lineHeight: 1.2,
            allowTransparency: true,
            theme: {
                background: theme.background,
                foreground: theme.foreground,
                    cursor: theme.cursor,
                    selectionBackground: theme.selection,
                    black: theme.black,
                    red: theme.red,
                    green: theme.green,
                    yellow: theme.yellow,
                    blue: theme.blue,
                    magenta: theme.magenta,
                    cyan: theme.cyan,
                    white: theme.white,
                    brightBlack: theme.brightBlack,
                    brightRed: theme.brightRed,
                    brightGreen: theme.brightGreen,
                    brightYellow: theme.brightYellow,
                    brightBlue: theme.brightBlue,
                    brightMagenta: theme.brightMagenta,
                    brightCyan: theme.brightCyan,
                    brightWhite: theme.brightWhite
            }
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);
        term.open(terminalRef.current);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // --- Init Electron PTY ---
        if (window.electronAPI) {
            window.electronAPI.createTerminal(termId, settings.shell).then((shellName) => {
                // Only show welcome on first load to keep it clean
                // term.writeln(`\x1b[2mSession started: ${shellName}\x1b[0m`);

                setTimeout(() => {
                    fitAddon.fit();
                    if(window.electronAPI) {
                        window.electronAPI.resizeTerminal(termId, term.cols, term.rows);
                    }
                    term.focus();
                }, 100);
            });

            term.onData(data => {
                window.electronAPI?.writeTerminal(termId, data);
            });

            window.electronAPI.onTerminalData((id, data) => {
                if (id === termId) {
                    term.write(data);
                }
            });

            window.electronAPI.onTerminalExit((id) => {
                if (id === termId && onExit) {
                    onExit();
                }
            });
        } else {
            term.writeln('\x1b[31mError: Electron API not found.\x1b[0m');
        }

        const handleResize = () => {
            fitAddon.fit();
            if(window.electronAPI) {
                window.electronAPI.resizeTerminal(termId, term.cols, term.rows);
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (window.electronAPI) {
                window.electronAPI.disposeTerminal(termId);
            }
            term.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 2. React to prop changes (Theme, FontSize) without killing PTY
    useEffect(() => {
        if (xtermRef.current) {
            // Update Theme
            xtermRef.current.options.theme = {
                background: theme.background,
                foreground: theme.foreground,
                    cursor: theme.cursor,
                    selectionBackground: theme.selection,
                    black: theme.black,
                    red: theme.red,
                    green: theme.green,
                    yellow: theme.yellow,
                    blue: theme.blue,
                    magenta: theme.magenta,
                    cyan: theme.cyan,
                    white: theme.white,
                    brightBlack: theme.brightBlack,
                    brightRed: theme.brightRed,
                    brightGreen: theme.brightGreen,
                    brightYellow: theme.brightYellow,
                    brightBlue: theme.brightBlue,
                    brightMagenta: theme.brightMagenta,
                    brightCyan: theme.brightCyan,
                    brightWhite: theme.brightWhite
            };

            // Update Font Size
            xtermRef.current.options.fontSize = settings.fontSize;

            // Refit after font change
            fitAddonRef.current?.fit();
            if(window.electronAPI && xtermRef.current) {
                window.electronAPI.resizeTerminal(idRef.current, xtermRef.current.cols, xtermRef.current.rows);
            }
        }
    }, [theme, settings.fontSize]);

    // 3. Handle Visibility
    useEffect(() => {
        if (isActive && fitAddonRef.current && xtermRef.current) {
            requestAnimationFrame(() => {
                fitAddonRef.current?.fit();
                xtermRef.current?.focus();
                if(window.electronAPI && xtermRef.current) {
                    window.electronAPI.resizeTerminal(idRef.current, xtermRef.current.cols, xtermRef.current.rows);
                }
            });
        }
    }, [isActive]);

    return (
        <div
        className={`absolute inset-0 p-4 ${isActive ? 'z-10' : 'z-0 invisible'}`}
        style={{
            visibility: isActive ? 'visible' : 'hidden'
        }}
        ref={terminalRef}
        />
    );
};

export default XTermInstance;
