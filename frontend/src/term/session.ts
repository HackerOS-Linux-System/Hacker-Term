import { createSignal, type Accessor } from 'solid-js';
import { Emulator } from './emulator';
import { b64ToBytes, textToB64 } from './b64';
import { call, errText } from '../services/api';

export class TerminalSession {
  readonly emu: Emulator;
  /** zmienia się po każdej partii danych (odświeżenie widoku, max raz na klatkę) */
  readonly tick: Accessor<number>;
  private setTick: (n: number) => void;
  readonly title: Accessor<string>;
  private setTitle: (s: string) => void;
  readonly exited: Accessor<boolean>;
  private setExited: (b: boolean) => void;
  private raf = 0;
  private opened = false;
  onTitle: (t: string) => void = () => {};
  onCwd: (p: string) => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor(readonly id: number, cols: number, rows: number, scrollback: number) {
    this.emu = new Emulator(cols, rows, scrollback);
    [this.tick, this.setTick] = createSignal(0);
    [this.title, this.setTitle] = createSignal('');
    [this.exited, this.setExited] = createSignal(false);
    this.emu.onResponse = (d) => this.send(d);
    this.emu.onTitle = (t) => { this.setTitle(t); this.onTitle(t); };
    this.emu.onCwd = (p) => this.onCwd(p);
  }

  async open(opts: { shell?: string; cwd?: string; env?: Record<string, string> }): Promise<void> {
    const env = opts.env ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`).join('\n') : '';
    try {
      await call('create_terminal', { id: this.id, cols: this.emu.cols, rows: this.emu.rows, shell: opts.shell, cwd: opts.cwd, env });
      this.opened = true;
    } catch (e) { this.onError(errText(e)); this.setExited(true); }
  }

  /** dane z PTY (base64) */
  feed(b64: string): void {
    this.emu.write(b64ToBytes(b64));
    this.refresh();
  }

  refresh(): void {
    if (this.raf) return;
    const run = () => { this.raf = 0; this.setTick(this.emu.version); };
    this.raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : (setTimeout(run, 16) as unknown as number);
  }

  /** tekst użytkownika → PTY (UTF-8) */
  send(text: string): void {
    if (!this.opened || this.exited() || !text) return;
    call('write_terminal', { id: this.id, data: textToB64(text) }).catch((e) => this.onError(errText(e)));
  }

  /** wklejanie z uwzględnieniem trybu bracketed paste */
  paste(text: string): void {
    const t = text.replace(/\r?\n/g, '\r');
    this.send(this.emu.bracketedPaste ? `\x1b[200~${t}\x1b[201~` : t);
  }

  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  resize(cols: number, rows: number): void {
    if (cols === this.emu.cols && rows === this.emu.rows) return;
    this.emu.resize(cols, rows);
    this.refresh();
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      if (this.opened) call('resize_terminal', { id: this.id, cols, rows }).catch(() => {});
    }, 30);
  }

  markExited(): void { this.setExited(true); this.refresh(); }

  close(): void {
    if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    clearTimeout(this.resizeTimer);
    if (this.opened) call('close_terminal', { id: this.id }).catch(() => {});
    this.opened = false;
  }
}
