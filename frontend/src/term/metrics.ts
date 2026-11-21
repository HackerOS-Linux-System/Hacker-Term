import { createSignal } from 'solid-js';

export interface Cell { w: number; h: number }
export const FALLBACK_ADVANCE = 0.602;
export const LINE_HEIGHT = 1.25;

const [cell, setCell] = createSignal<Cell>({ w: 8.43, h: 18 });
export { cell };

let probe: HTMLElement | null = null;
const N = 40;

export function measure(fontCss: string, fontSize: number): Cell {
  if (typeof document === 'undefined') return { w: fontSize * FALLBACK_ADVANCE, h: Math.round(fontSize * LINE_HEIGHT) };
  if (!probe) {
    probe = document.createElement('span');
    probe.className = 'probe';
    document.body.appendChild(probe);
  }
  probe.setAttribute('style', `font-family:${fontCss};font-size:${fontSize}px;`);
  probe.textContent = 'M'.repeat(N);
  const w = probe.getBoundingClientRect().width / N;
  return { w: w > 1 ? w : fontSize * FALLBACK_ADVANCE, h: Math.round(fontSize * LINE_HEIGHT) };
}

/** Mierzy teraz i jeszcze kilka razy w kolejnych klatkach (pierwszy odczyt w Silverze bywa zerowy). */
export function remeasure(fontCss: string, fontSize: number): void {
  const run = () => {
    const c = measure(fontCss, fontSize);
    const cur = cell();
    if (Math.abs(c.w - cur.w) > 0.01 || c.h !== cur.h) setCell(c);
  };
  run();
  for (const ms of [32, 120, 400, 1200]) setTimeout(run, ms);
}
