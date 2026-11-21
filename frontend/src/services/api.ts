import type { HkRaw } from '../config';

interface Commands {
  create_terminal: { args: { id: number; cols: number; rows: number; shell?: string; cwd?: string; env?: string }; result: { id: number } };
  write_terminal: { args: { id: number; data: string }; result: { ok: boolean } };
  resize_terminal: { args: { id: number; cols: number; rows: number }; result: { ok: boolean } };
  close_terminal: { args: { id: number }; result: { ok: boolean } };
  terminal_cwd: { args: { id: number }; result: { cwd: string } };
  load_config: { args: undefined; result: HkRaw };
  save_config: { args: { config: HkRaw }; result: { ok: boolean } };
  load_session: { args: undefined; result: unknown };
  save_session: { args: { session: unknown }; result: { ok: boolean } };
  home_dir: { args: undefined; result: { home: string } };
}

export function call<K extends keyof Commands>(
  cmd: K,
  ...args: Commands[K]['args'] extends undefined ? [] : [Commands[K]['args']]
): Promise<Commands[K]['result']> {
  if (typeof silver === 'undefined') return Promise.reject(new Error('Silver runtime not available'));
  return silver.invoke(cmd, args[0] as Record<string, unknown> | undefined);
}

export const errText = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { error?: string })?.error ?? JSON.stringify(e);

export function onTerminalData(cb: (id: number, b64: string) => void): () => void {
  return silver.listen<{ id: number; data: string }>('terminal-data', (p) => cb(p.id, p.data));
}
export function onTerminalExit(cb: (id: number) => void): () => void {
  return silver.listen<{ id: number }>('terminal-exit', (p) => cb(p.id));
}

export const win = {
  minimize: () => silver.window.minimize(),
  maximize: () => silver.window.maximize(),
  restore: () => silver.window.restore(),
  close: () => silver.window.close(),
  setOpacity: (pct: number) => silver.window.setOpacity(pct),
  setTitle: (t: string) => silver.window.setTitle(t),
};
export const clipboard = {
  read: () => silver.clipboard.readText(),
  write: (t: string) => silver.clipboard.writeText(t),
};
