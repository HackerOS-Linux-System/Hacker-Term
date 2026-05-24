import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'

// ──────────────────────────────────────────────
// Window controls
// ──────────────────────────────────────────────
export const windowMinimize = () => invoke('window_minimize')
export const windowMaximize = () => invoke('window_maximize')
export const windowClose = () => invoke('window_close')

// ──────────────────────────────────────────────
// Terminal (PTY) commands
// ──────────────────────────────────────────────
export const createTerminal = (id: string, cols: number, rows: number): Promise<string> =>
  invoke('create_terminal', { id, cols, rows })

export const writeTerminal = (id: string, data: string): Promise<void> =>
  invoke('write_terminal', { id, data })

export const resizeTerminal = (id: string, cols: number, rows: number): Promise<void> =>
  invoke('resize_terminal', { id, cols, rows })

export const closeTerminal = (id: string): Promise<void> =>
  invoke('close_terminal', { id })

// ──────────────────────────────────────────────
// Terminal event listeners
// ──────────────────────────────────────────────
export const onTerminalData = (
  callback: (id: string, data: string) => void
): Promise<UnlistenFn> =>
  listen<{ id: string; data: string }>('terminal-data', (e) =>
    callback(e.payload.id, e.payload.data)
  )

export const onTerminalExit = (
  callback: (id: string) => void
): Promise<UnlistenFn> =>
  listen<{ id: string }>('terminal-exit', (e) => callback(e.payload.id))

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────
export const loadConfig = (): Promise<Record<string, Record<string, unknown>>> =>
  invoke('load_config')

export const saveConfig = (
  config: Record<string, Record<string, unknown>>
): Promise<void> => invoke('save_config', { config })
