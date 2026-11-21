# ![Hacker Term logo](images/logo.png)

# HackerTerm

**v1.0.0** — a terminal emulator for the HackerOS aesthetic, rewritten on the HackerOS stack:
**H#** backend, **[Silver](https://github.com/HackerOS-Linux-System/silver)** window/renderer (no WebView), **Bit** project file (`Bit.hk`), and a **TypeScript + Solid.js** frontend.

> v0.x was Rust + Tauri 2 + React + xterm.js. See [MIGRATION.md](MIGRATION.md) for a file-by-file account of what was kept, rewritten, fixed, extended, removed and added.

## Features

- **Split panes** — divide any tab horizontally or vertically, drag the divider to resize, close individual panes. Panes are rendered flat, so restructuring the layout never restarts the other shells.
- **Tabs** — rename (double-click), reorder by drag, duplicate, close others, right-click menu.
- **Session persistence** — tabs, panes, split ratios, *current* working directories (read from `/proc/<pid>/cwd`) and per-tab environment variables are restored on next launch (toggleable).
- **In-terminal search** — `Ctrl+Shift+F` over the whole scrollback, highlighted matches, `Enter` / `Shift+Enter` to jump.
- **Own VT/xterm emulator** (`frontend/src/term/`) — UTF-8 incl. wide/combining characters, SGR 16/256/truecolor, scroll regions, alternate screen, DEC line drawing, bracketed paste, mouse reporting (X10/SGR), OSC 0/2/7, DSR/DA replies, scrollback, mouse selection (double-click word, triple-click line).
- **Custom themes** — five built-in themes plus a custom theme editor (hex / `rgba()` fields).
- **Rebindable shortcuts** — every action can be re-mapped in Settings → Shortcuts.
- **Per-tab working directory & environment variables** — right-click the **+** button.
- **Multi-language UI** — English, Polski, Deutsch, Español; a new language is one new file in `frontend/src/locales/` (the index is generated at build time).
- **Visible error handling** — config/session/terminal failures surface as toasts.
- **`.hk` config format** — parsed and written by the H# backend (`src/config.h#`).

### Differences from v0.9 (Tauri) — by design

| v0.9 | v1.0 | Why |
|---|---|---|
| xterm.js + WebGL | built-in emulator, DOM rows rendered by Silver | Silver has no WebView, canvas or WebGL |
| "Detect system fonts" (Local Font Access API) | font name field; `DejaVu Sans Mono` bundled | no such API in Silver |
| Tailwind CSS | plain CSS (`frontend/style.css`) | smaller, matches Silver's CSS engine |
| window transparency + CSS blur | `silver.window.setOpacity` | depends on a compositing window manager |
| IME composition | not supported | Silver delivers text via a focused text field only |

## Requirements

- the **H#** toolchain (`h#`, ≥ 0.9, edition 2026) and **Bit** — on HackerOS: `hacker unpack h#-utils`
- Silver's system libraries (SDL2 etc.) — see the Silver README
- a C compiler and `ar` (for `native/pty_shim.c`)
- Node.js 18+ and npm (frontend build)

## Getting started

```bash
bit build          # builds libhtpty.a, the frontend bundle (pre-build hook) and the app
bit run            # run it

bit frontend       # rebuild only the frontend  (TypeScript + Solid → frontend/dist/app.js)
bit watch          # rebuild the frontend on every change (run next to `bit run`)
bit typecheck      # tsc --noEmit
bit test           # emulator/keys/config tests (TS) + .hk parser tests (H#)
```

## Architecture

```
┌───────────────────────── Silver window (SDL2, QuickJS) ─────────────────────────┐
│ frontend/ (TypeScript + Solid.js)                                               │
│   emulator (VT) ── rows as DOM ── hidden <textarea> for typed text              │
│        ▲ terminal-data (base64)        │ silver.invoke(...)                     │
└────────┼───────────────────────────────┼────────────────────────────────────────┘
         │ app::emit (on_tick, 12 ms)    ▼
   src/commands.h#  ──  src/pty.h#  ──FFI──  native/pty_shim.c (forkpty, non-blocking)
   src/config.h#  (.hk)      session.json / config.hk in ~/.config/HackerOS/Hacker-Term/
```

Backend commands (`silver.invoke`): `create_terminal`, `write_terminal`, `resize_terminal`, `close_terminal`, `terminal_cwd`, `load_config`, `save_config`, `load_session`, `save_session`, `home_dir`. Events: `terminal-data {id, data(base64)}`, `terminal-exit {id}`. PTY bytes travel as base64 because H# strings are NUL-terminated and a terminal must carry arbitrary bytes.

Silver-specific details worth knowing:
- Silver fires no JS `wheel` event; wheel scrolls overflow containers. Each pane therefore has a transparent `.scroller` whose scroll position is mapped to scrollback (or to arrow keys / mouse reports on the alternate screen).
- Silver's `keydown` carries a `key` only for special keys and unshifted ASCII; ordinary text (Shift, layouts, national characters) arrives through the hidden input, which the pane keeps focused.
- Silver's `TextDecoder` polyfill ignores `stream: true`, so the emulator uses its own incremental UTF-8 decoder.

## Configuration

```
~/.config/HackerOS/Hacker-Term/config.hk     # settings (created on first run, re-saved from the UI)
~/.config/HackerOS/Hacker-Term/session.json  # open tabs/panes (Restore tabs on startup)
```

See [config/template.hk](config/template.hk) for every key (`[appearance]`, `[terminal]`, `[advanced]`, `[shortcuts]`, `[custom_theme]`). Comments in the file are not preserved when the UI re-saves it.

## Default keyboard shortcuts

| Action | Default | | Action | Default |
|---|---|---|---|---|
| New tab | `Ctrl+T` | | Split right | `Ctrl+Alt+D` |
| Close tab | `Ctrl+W` | | Split down | `Ctrl+Alt+S` |
| Copy selection | `Ctrl+Shift+C` | | Close pane | `Ctrl+Shift+X` |
| Paste | `Ctrl+Shift+V` | | Next / previous pane | `Ctrl+Alt+→` / `←` |
| Search | `Ctrl+Shift+F` | | Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |

`Shift+PageUp/PageDown` scroll the history.

## Project structure

```
Hacker-Term/
├── Bit.hk                  # project file (replaces package.json / Cargo.toml / tauri.conf.json)
├── src/                    # H# backend
│   ├── main.h#             # Silver app: window, commands, PTY pump
│   ├── commands.h#         # silver.invoke handlers
│   ├── pty.h#              # PTY registry + FFI to libhtpty
│   ├── config.h#           # .hk parser / serializer / JSON bridge (pure, tested)
│   └── config_test.h#
├── native/                 # pty_shim.c (forkpty) + build.sh → libhtpty.a
├── frontend/               # TypeScript + Solid.js (esbuild + babel-preset-solid)
│   ├── src/term/           # VT emulator, UTF-8, keys, search, themes, cell metrics
│   ├── src/components/     # TerminalPane, TabArea, TabBar, SettingsPanel, SearchBar, overlays
│   ├── src/locales/        # one file per language
│   ├── src/store.ts        # tabs / panes / settings / session state
│   ├── fonts/              # DejaVu Sans Mono (Bitstream Vera licence)
│   ├── test/               # node:test suites + jsdom end-to-end smoke test
│   └── style.css
├── config/template.hk      # documented default config
└── images/
```

## Adding a language

Create `frontend/src/locales/fr.ts` (copy the shape from `en.ts`; `Translations` is typed, so a missing key fails `bit typecheck`). It is picked up automatically by `scripts/gen-locales.mjs` at build time.

## Static linking of the frontend, fonts and icons

The frontend is **embedded in the binary**: `npm run build` (run by the `pre-build` hook in `Bit.hk`) bundles the TypeScript with esbuild and then runs `frontend/scripts/embed.mjs`, which writes `src/assets_gen.h#` (HTML, CSS, `dist/app.js`, fonts and `images/logo.png` as base64, same format as `silver embed`). `main()` calls `assets_gen::install()` first, so the resulting `hacker-term` is a single file that runs from any directory without `frontend/` next to it. This needs **Silver >= 0.5** (`app::register_asset`). `src/assets_gen.h#` is generated and committed so the H# side builds even before the first frontend build.

Glyphs: Silver uses only the first name in `font-family`, so there is no per-glyph fallback. DejaVu Sans Mono covers box drawing, blocks, arrows and most symbols; Nerd Font / Powerline icons (Private Use Area) are drawn from the bundled `Symbols Nerd Font Mono` (MIT, `fonts/`) — `TerminalPane` wraps them in `<span class="nf">`. Emoji and CJK glyphs are still not available.

## Status / verification

Verified: `bit build --release` against Silver (path dependency) links the real binary with `libhtpty`; the binary was started in a real Silver/SDL2 window under Xvfb — config/session files are created, the PTY shell prompt renders, the tab bar and the status bar are laid out correctly. `config.h#` passes 7 H# tests, `libhtpty` was exercised through the H# FFI against a real PTY, TypeScript passes `tsc --noEmit`, the TypeScript tests (emulator, keys, search, pane tree, config, locales) pass, and a jsdom smoke test with a mocked `silver` passes.

Note: `bit check` does **not** catch codegen errors (e.g. an undefined builtin) — `bit build` is the real check.
**Not verified interactively:** typing through the hidden input sink, splits, settings panel and search in a live window. If something misbehaves, see *Silver-specific details* above (focus/text input, scroll container, font metrics).

Silver typings come from the npm package [`@hackeros/silver-types`](https://www.npmjs.com/package/@hackeros/silver-types) (listed in `tsconfig.json` → `types`), not from a local `.d.ts`.

## License

Mozilla Public License 2.0 — see [LICENSE](LICENSE). Bundled DejaVu Sans Mono: Bitstream Vera / DejaVu licence.
