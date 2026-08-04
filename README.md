# ![Hacker Term logo](https://github.com/HackerOS-Linux-System/Hacker-Term/blob/main/images/logo.png)

# HackerTerm

**v0.9.0** — a high-fidelity, GPU-accelerated terminal emulator built for the HackerOS aesthetic.

HackerTerm pairs a Rust/[Tauri 2](https://tauri.app) backend (via [`portable-pty`](https://crates.io/crates/portable-pty)) with a [Solid.js](https://www.solidjs.com) + [xterm.js](https://xtermjs.org) frontend to deliver a fast, native-feeling terminal with split panes, session persistence, and a fully customizable look.

## Screenshot

![Hacker Term screenshot](https://github.com/HackerOS-Linux-System/Hacker-Term/blob/main/images/screenshot.png)

## Features

- **Split panes** — divide any tab horizontally or vertically, drag to resize, close individual panes.
- **Tabs** — rename (double-click), reorder by drag & drop, duplicate, close others, right-click context menu.
- **Session persistence** — reopens your tabs, panes, working directories and environment variables on next launch (toggleable).
- **In-terminal search** — `Ctrl+Shift+F` to find text in the scrollback buffer.
- **GPU rendering** — WebGL-accelerated output via `xterm-addon-webgl`, with automatic fallback to canvas rendering if unsupported.
- **Unicode 11 support** — correct width handling for emoji, CJK and combining characters.
- **Custom themes** — five built-in themes (Hacker, Cyberpunk, Dracula, Nord Dark, Tokyo Night) plus a full color-picker editor to create and save your own.
- **Rebindable shortcuts** — every keyboard shortcut (new tab, split, search, copy/paste, …) can be re-mapped from Settings.
- **Per-tab working directory & environment variables** — right-click "New Tab" for a dialog to set a custom `cwd` and extra `env` vars.
- **Custom fonts** — type any font family, or use "Detect system fonts" (Local Font Access API, Chromium-based webviews) to pick from installed fonts.
- **Multi-language UI** — English, Polski, Deutsch, Español out of the box; adding a language is just a new file in `src/locales/`.
- **Visible error handling** — config/session/terminal failures surface as toast notifications instead of failing silently.
- **`.hk` config format** — a simple, human-editable config file (see [Configuration](#configuration)).

## Prerequisites

- [Node.js](https://nodejs.org) 18+ and npm
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (system WebView, build tools, etc.)

## Getting started

```bash
# install frontend dependencies
npm install

# run in development mode (hot-reloading Tauri window)
npm run tauri dev

# build a release bundle for your platform
npm run tauri build
```

Frontend-only development (browser preview, without the Rust/PTY backend — terminals won't actually spawn a shell) is available via `npm run dev`.

## Configuration

HackerTerm stores its settings in a plain-text `.hk` file at:

```
~/.config/HackerOS/Hacker-Term/config.hk
```

It's created automatically on first run from [`config/template.hk`](config/template.hk) and re-saved whenever you change a setting in the UI. You can edit it by hand — most fields take effect on restart. See the template for the full list of keys (`[appearance]`, `[terminal]`, `[advanced]`).

Open tab/pane session state (used by "Restore tabs on startup") is stored separately at:

```
~/.config/HackerOS/Hacker-Term/session.json
```

## Default keyboard shortcuts

All of these are rebindable from **Settings → Shortcuts**.

| Action              | Default          |
|---------------------|------------------|
| New tab             | `Ctrl+T`         |
| Close tab           | `Ctrl+W`         |
| Copy selection       | `Ctrl+Shift+C`   |
| Paste from clipboard | `Ctrl+Shift+V`   |
| Search in terminal   | `Ctrl+Shift+F`   |
| Split right          | `Ctrl+Alt+D`     |
| Split down           | `Ctrl+Alt+S`     |
| Close pane           | `Ctrl+Shift+X`   |
| Next tab             | `Ctrl+Tab`       |
| Previous tab         | `Ctrl+Shift+Tab` |

## Project structure

```
Hacker-Term/
├── src/                    # Solid.js frontend
│   ├── components/         # XTermInstance, PaneView, modals, toasts, ...
│   ├── locales/            # One file per language (auto-discovered)
│   ├── services/           # Tauri command bindings
│   ├── utils/              # Pane-tree and keybinding helpers
│   ├── config.ts           # Themes, defaults, .hk <-> AppSettings mapping
│   └── App.tsx              # Root component
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── commands.rs      # Tauri command handlers
│   │   ├── pty_manager.rs   # PTY spawning/IO via portable-pty
│   │   ├── config.rs        # .hk config file parsing
│   │   └── session.rs       # Session (open tabs/panes) persistence
│   └── tauri.conf.json
└── config/template.hk       # Default config, copied on first run
```

## Adding a language

Drop a new file into `src/locales/`, e.g. `src/locales/fr.ts`:

```ts
import type { LocaleModule } from './locale'

const fr: LocaleModule = {
  code: 'fr',
  name: 'Français',
  flag: '🇫🇷',
  translations: { /* ... copy the shape from en.ts ... */ },
}

export default fr
```

It's picked up automatically — no other file needs to change.

## Contributing

Issues and pull requests are welcome. Please keep changes focused and include a short description of what you tested (`npm run tauri dev` on your platform, `npx tsc --noEmit`, etc.).

## License

Mozilla Public License 2.0 — see [LICENSE](LICENSE).
