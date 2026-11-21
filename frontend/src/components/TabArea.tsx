import { For, createMemo } from 'solid-js';
import { computeLayout, leaves } from '../utils/paneTree';
import { activeTabId, resizeSplit, tabs } from '../store';
import TerminalPane from './TerminalPane';
import type { Tab } from '../types';

/** Panele karty rysowane płasko (klucz = id liścia), dzięki czemu podział/zamknięcie panelu nie restartuje pozostałych PTY. */
export default function TabArea(props: { tabId: number }) {
  let area!: HTMLDivElement;
  const tab = (): Tab => tabs().find((x) => x.id === props.tabId)!;
  const layout = createMemo(() => computeLayout(tab().root));
  const ids = createMemo(() => leaves(tab().root).map((l) => l.id), [], { equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]) });
  const visible = () => activeTabId() === props.tabId;

  const startDrag = (d: ReturnType<typeof layout>['dividers'][number], e: MouseEvent) => {
    e.preventDefault();
    const rect = area.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      const ratio = d.dir === 'row'
        ? ((ev.clientX - rect.left) / rect.width - d.parent.x) / d.parent.w
        : ((ev.clientY - rect.top) / rect.height - d.parent.y) / d.parent.h;
      resizeSplit(props.tabId, d.path, ratio);
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  return (
    <div ref={area} class="tab-area" classList={{ hidden: !visible() }}>
      <For each={ids()}>
        {(id) => (
          <TerminalPane
            leaf={leaves(tab().root).find((l) => l.id === id)!}
            tabId={props.tabId}
            rect={layout().panes.get(id) ?? { x: 0, y: 0, w: 1, h: 1 }}
            active={tab().active === id}
            visible={visible()}
          />
        )}
      </For>
      <For each={layout().dividers}>
        {(d) => (
          <div
            class={`divider ${d.dir}`}
            style={d.dir === 'row'
              ? { left: `calc(${(d.rect.x) * 100}% - 3px)`, top: `${d.rect.y * 100}%`, height: `${d.rect.h * 100}%` }
              : { top: `calc(${d.rect.y * 100}% - 3px)`, left: `${d.rect.x * 100}%`, width: `${d.rect.w * 100}%` }}
            onMouseDown={(e) => startDrag(d, e)}
          />
        )}
      </For>
    </div>
  );
}
