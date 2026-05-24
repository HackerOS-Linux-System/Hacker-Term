import React, { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { AppSettings, TerminalTheme } from '../types'
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  onTerminalData,
  onTerminalExit,
  closeTerminal,
} from '../services/tauriApi'
import type { UnlistenFn } from '@tauri-apps/api/event'

interface Props {
  id: string
  isActive: boolean
  settings: AppSettings
  theme: TerminalTheme
  onExit: () => void
}

function buildTheme(theme: TerminalTheme) {
  return {
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
    brightWhite: theme.brightWhite,
  }
}

const XTermInstance: React.FC<Props> = ({ id, isActive, settings, theme, onExit }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const unlistenDataRef = useRef<UnlistenFn | null>(null)
  const unlistenExitRef = useRef<UnlistenFn | null>(null)

  // ── Mount: create terminal + PTY session ──
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      lineHeight: 1.2,
      allowTransparency: true,
      theme: buildTheme(theme),
      // Allow xterm to handle ctrl+c, ctrl+v etc. normally
      // We intercept copy/paste ourselves below
      macOptionIsMeta: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)

    termRef.current = term
    fitRef.current = fitAddon

    // ── Keyboard shortcuts ──
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Ctrl+Shift+C → Copy
      if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        const sel = term.getSelection()
        if (sel) navigator.clipboard.writeText(sel).catch(() => {})
        return false // prevent xterm default (send ^C)
      }
      // Ctrl+Shift+V → Paste
      if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
        navigator.clipboard.readText().then((text) => {
          if (text) writeTerminal(id, text)
        }).catch(() => {})
        return false
      }
      return true
    })

    // ── PTY data flow ──
    term.onData((data) => {
      writeTerminal(id, data)
    })

    // Listen for data/exit events from Rust
    let mounted = true

    onTerminalData((eid, data) => {
      if (eid === id && mounted && termRef.current) {
        termRef.current.write(data)
      }
    }).then((fn) => { unlistenDataRef.current = fn })

    onTerminalExit((eid) => {
      if (eid === id && mounted) {
        onExit()
      }
    }).then((fn) => { unlistenExitRef.current = fn })

    // Create PTY session in Rust
    setTimeout(() => {
      fitAddon.fit()
      createTerminal(id, term.cols, term.rows).then(() => {
        fitAddon.fit()
        resizeTerminal(id, term.cols, term.rows)
        term.focus()
      })
    }, 80)

    // Resize handler
    const handleResize = () => {
      fitAddon.fit()
      resizeTerminal(id, term.cols, term.rows)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      mounted = false
      window.removeEventListener('resize', handleResize)
      unlistenDataRef.current?.()
      unlistenExitRef.current?.()
      closeTerminal(id)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync settings/theme changes ──
  useEffect(() => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term) return
    term.options.theme = buildTheme(theme)
    term.options.fontSize = settings.fontSize
    term.options.fontFamily = settings.fontFamily
    term.options.cursorStyle = settings.cursorStyle
    term.options.cursorBlink = settings.cursorBlink
    fit?.fit()
    resizeTerminal(id, term.cols, term.rows)
  }, [theme, settings, id])

  // ── Handle tab visibility change ──
  useEffect(() => {
    if (isActive && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit()
        termRef.current?.focus()
        resizeTerminal(id, termRef.current!.cols, termRef.current!.rows)
      })
    }
  }, [isActive, settings.padding, id])

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${isActive ? 'z-10' : 'z-0'}`}
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        padding: `${settings.padding}px`,
      }}
    />
  )
}

export default XTermInstance
