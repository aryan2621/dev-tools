# Wall: developer guide

[← Back to README](../README.md) · [User guide](user.md)

## Build and install

Needs Node 22, Rust (stable), Xcode command-line tools and `cmake` (for llama.cpp's server).
macOS on Apple silicon only.

```bash
cd wall
npm install
npm run tauri build -- --bundles app
cp -R src-tauri/target/release/bundle/macos/Wall.app /Applications/
```

```bash
npm run tauri dev   # run with hot reload (UI on port 1520)
npx tsc -b          # TypeScript check
```

Both `tauri dev` and `tauri build` first run `scripts/build-llama-server.sh`, which downloads
llama.cpp (pinned version), builds `llama-server` as one static binary with the Metal shaders
embedded, and puts it in `src-tauri/binaries/` for Tauri to bundle as a sidecar. It's skipped
when that version is already built.

CI (`../.github/workflows/wall.yml`) builds the macOS `.dmg` on every push that touches `wall/`.
Pushing a `v*` tag runs every app's build and publishes one GitHub Release with all installers.

## Code layout

```
src/
  App.tsx                 the terminal window: title bar, tabs, panes, AI bar, palette, chat
  Dashboard.tsx           Wall's window: sidebar, Home and History, Settings dialog
  components/terminal/    Pane (PTY + blocks), BlockCard, InputEditor, AI and agent blocks
  components/ai/          chat panel
  components/layout/      title bar
  components/bits.tsx     shared pieces for Wall's window (page header, panels, keys, app icon)
  pages/                  TerminalPage, Home, History, Settings
  stores/                 zustand stores: blocks, workspace, settings, chat, llm
  lib/terminalTheme.ts    xterm colors from the CSS theme
src-tauri/src/
  lib.rs                  app setup, menu, the dashboard window
  pty.rs                  shell processes
  ai.rs                   suggest, explain, chat, agent steps
  history.rs              SQLite history and stats
  shell.rs                git info, completion, known commands, settings file
  safety.rs               command risk assessment
  llm/                    llama-server lifecycle, model catalog and downloads
src-tauri/shell/.zshrc    shell integration (OSC 133 / OSC 7 markers)
```

## How it works

- **Blocks:** Wall starts zsh with `src-tauri/shell/.zshrc`, which loads your own `.zshrc` and then
  emits OSC 133 / OSC 7 markers for prompt start, command start, command end (with exit code) and
  the current folder. Wall splits the terminal stream on those markers. A finished block's output
  becomes static HTML, so old blocks cost nothing to keep. The shell's prompt is hidden; Wall draws
  its own input.
- **AI:** requests go to the local `llama-server` on `127.0.0.1`, started on first use. Every
  suggestion passes a rule-based safety check (`safety.rs`) that sets its risk level. AI output is
  only typed into the prompt (`insertIntoPrompt` in `src/lib/ptyRegistry.ts`); the user runs it,
  except agent steps rated safe when auto-run is on.
- **Two windows:** the terminal is the `main` window. Home, History and Settings live in a
  `dashboard` window that `open_dashboard` (in `lib.rs`) builds on demand, like Murmur's main
  window: overlay title bar, translucent with the macOS sidebar material (`macOSPrivateApi`). Both
  windows load the same bundle; `main.tsx` picks the view by window label. Settings changes are
  broadcast with a `settings-changed` event so both windows stay in sync, and History's insert sends
  `insert-command` to the terminal. Closing the terminal quits the app.
- **Look:** the theme follows Claude, shared with Murmur: warm paper tones, a clay accent, Source
  Serif 4 headings, Inter text and JetBrains Mono in the terminal (`src/index.css`,
  `tailwind.config.js`).
- **Data:** `history.db`, `settings.json`, `models/` and `llama-server.log` in
  `~/Library/Application Support/app.wall.desktop`. Models from LocalBoard's folder are reused
  read-only.

## Limitations

- Block mode needs zsh; other shells get the classic terminal view.
- Plain-English detection is a heuristic.
- Startup output printed by `.zshrc` is hidden.
- Split panes are always 50/50.
